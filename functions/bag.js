/* POST /bag: the storefront's bag, signed and handed to the WooCommerce checkout host.

   A Cloudflare Pages Function at launch; the local _serve.cjs runs this same file. The bag
   lives in the storefront, but Woo's cart is a first-party cookie on the checkout host, so the
   browser carries a signed, expiring payload there. The host's mu-plugin (sndr-bag-handoff)
   checks the signature and the expiry, fills the Woo cart and redirects to /checkout.

   What the signature proves: the bag came through this function (its checks, and later the
   live stock read) and is less than ten minutes old. What it does not need to prove: prices.
   Nothing here carries a price; Woo prices every line itself.

   Env: BAG_SECRET (shared with the checkout host), CHECKOUT_ORIGIN (e.g. https://mjukiceland.com). */

const MAX_LINES = 40, MAX_QTY = 20, MAX_NOTE = 160, TTL = 600;

const b64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export function readBag(raw) {
  let items;
  try { items = JSON.parse(raw || '[]'); } catch (e) { return null; }
  if (!Array.isArray(items) || !items.length || items.length > MAX_LINES) return null;
  const out = [];
  for (const i of items) {
    if (!i || !Number.isInteger(i.id) || i.id < 1 || !Number.isInteger(i.q) || i.q < 1 || i.q > MAX_QTY) return null;
    const line = { id: i.id, q: i.q };
    if (i.note) line.note = String(i.note).replace(/\s+/g, ' ').trim().slice(0, MAX_NOTE);
    out.push(line);
  }
  return out;
}

export async function sign(items, secret, now = Date.now()) {
  const enc = new TextEncoder();
  const payload = b64url(enc.encode(JSON.stringify({ v: 1, exp: Math.floor(now / 1000) + TTL, items })));
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = b64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(payload))));
  return { payload, sig };
}

export async function onRequestPost({ request, env }) {
  if (!env.BAG_SECRET || !env.CHECKOUT_ORIGIN) return new Response('Checkout is not configured.', { status: 500 });
  const form = await request.formData();
  const items = readBag(form.get('bag'));
  if (!items) return new Response('That bag could not be read. Go back and try again.', { status: 400, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  const { payload, sig } = await sign(items, env.BAG_SECRET);
  const to = new URL('/', env.CHECKOUT_ORIGIN);
  to.searchParams.set('sndr_bag', payload);
  to.searchParams.set('sig', sig);
  return new Response(null, { status: 303, headers: { Location: to.href, 'Cache-Control': 'no-store' } });
}
