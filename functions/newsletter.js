/* POST /newsletter: a newsletter sign-up from the shop's footer, signed and passed to her WordPress.

   The shop's form posts { email, lang, from, website } here (same origin, so no CORS and no third
   party in the browser). This edge checks the address, signs it with the secret the WordPress side
   holds (SNDR_BAG_SECRET, prefixed "news:" so a signed bag can never pass as a sign-up) and posts it
   to /wp-json/sndr/v1/newsletter on the checkout host (mu-plugins/sndr-newsletter.php in
   04-platform/mjuk-woo-sandbox), which saves it in her database and adds it to her Mailchimp list
   with double opt-in. "website" is a hidden field people never fill: a bot that fills it gets the
   same friendly answer and nothing is sent.

   GET /newsletter: 204 when this host can take a sign-up, 503 when it cannot (the static preview
   has no functions at all, so the form there says sign-up is not connected).

   Env: BAG_SECRET, CHECKOUT_ORIGIN (e.g. https://mjukiceland.com); WP_ORIGIN optionally overrides the
   address the edge itself calls (the local test copy, whose public address sits behind a login). */

const TTL = 600, MAX_BODY = 4096;
const EMAIL = /^[^\s@<>()[\]\\,;:"]{1,64}@[a-z0-9.-]{1,180}\.[a-z]{2,24}$/i;

const b64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const origin = (env, key) => { try { const u = new URL(env[key] || ''); return /^https?:$/.test(u.protocol) && u.host ? u : null; } catch (e) { return null; } };
const target = env => origin(env, 'WP_ORIGIN') || origin(env, 'CHECKOUT_ORIGIN');

export function readSignup(body) {
  if (!body || typeof body !== 'object') return null;
  const email = String(body.email || '').trim().toLowerCase();
  if (email.length > 190 || !EMAIL.test(email) || /\.\./.test(email)) return null;
  return { email, lang: body.lang === 'is' ? 'is' : 'en', from: String(body.from || '').replace(/[^a-z0-9/._-]/gi, '').slice(0, 40) };
}

export async function signSignup(s, secret, now = Date.now(), who = '') {
  const enc = new TextEncoder();
  const doc = { v: 1, exp: Math.floor(now / 1000) + TTL, n: b64url(crypto.getRandomValues(new Uint8Array(9))), e: s.email, l: s.lang, s: s.from, h: who };
  const payload = b64url(enc.encode(JSON.stringify(doc)));
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = b64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode('news:' + payload))));
  return { payload, sig };
}

// a short one-way tag for the visitor, so her side can limit sign-ups per person without keeping an IP
async function visitor(request, secret) {
  const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || '';
  if (!ip) return '';
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret + '|' + ip.split(',')[0].trim()));
  return [...new Uint8Array(d)].slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function onRequestGet({ env }) {
  return new Response(null, { status: env.BAG_SECRET && target(env) ? 204 : 503, headers: { 'Cache-Control': 'no-store' } });
}

export async function onRequestPost({ request, env, fetcher = fetch }) {
  if (!env.BAG_SECRET || !target(env)) return json({ ok: false, why: 'down' }, 503);
  if (+(request.headers.get('Content-Length') || 0) > MAX_BODY) return json({ ok: false, why: 'invalid' }, 413);
  let body = null;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY) return json({ ok: false, why: 'invalid' }, 413);
    body = /application\/json/.test(request.headers.get('Content-Type') || '') ? JSON.parse(text) : Object.fromEntries(new URLSearchParams(text));
  } catch (e) { /* unreadable */ }
  if (body && body.website) return json({ ok: true }); // the hidden field: a bot, answered kindly, nothing sent
  const s = readSignup(body);
  if (!s) return json({ ok: false, why: 'invalid' }, 400);
  const { payload, sig } = await signSignup(s, env.BAG_SECRET, Date.now(), await visitor(request, env.BAG_SECRET));
  const to = new URL('/wp-json/sndr/v1/newsletter', target(env));
  const headers = { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'mjuk-storefront-newsletter' };
  if (env.ORIGIN) { const o = new URL(env.ORIGIN); headers['X-SNDR-Rehearsal-Host'] = to.host; to.protocol = o.protocol; to.host = o.host; } // rehearsal only
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 9000);
  try {
    const r = await fetcher(to.href, { method: 'POST', headers, body: new URLSearchParams({ payload, sig }).toString(), signal: ctl.signal, redirect: 'manual' });
    if (r.status === 200) { let d = {}; try { d = await r.json(); } catch (e) {} return json({ ok: true, confirm: d.confirm === true }); }
    if (r.status === 429) return json({ ok: false, why: 'busy' }, 429);
    return json({ ok: false, why: 'down' }, 502);
  } catch (e) {
    return json({ ok: false, why: 'down' }, 502);
  } finally { clearTimeout(timer); }
}
