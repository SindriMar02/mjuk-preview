/* End to end, against the SANDBOX only: storefront bag → POST /bag (functions/bag.js via the
   local _serve.cjs) → signed hand-off → WooCommerce cart → order with the sandbox test payment.

     node tools/e2e-handoff.mjs [storefront]     default http://localhost:5895

   Needs the storefront preview (launch entry mjuk-experimental) and the sandbox (mjuk-woo-sandbox).
   Every case is a fresh guest session. The sandbox's cart and checkout pages are the classic
   shortcodes, as on her live shop (originals kept in 04-platform/mjuk-woo-sandbox/local/). The one order it places is cancelled (which puts the
   stock back) and deleted, and the stock is checked against what it was before. */
import fs from 'node:fs';
import path from 'node:path';
import { sign } from '../functions/bag.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const WS = path.resolve(ROOT, '../..');
const STORE = (process.argv[2] || 'http://localhost:5895').replace(/\/$/, '');
const env = f => Object.fromEntries(fs.readFileSync(f, 'utf8').split('\n').map(l => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map(m => [m[1], m[2].trim()]));
const dev = env(path.join(ROOT, '.dev.vars'));
const sb = env(path.join(WS, '04-platform/mjuk-woo-sandbox/local/sandbox.env'));
const HOST = dev.CHECKOUT_ORIGIN.replace(/\/$/, '');
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(HOST)) throw new Error('e2e runs against a local sandbox only, not ' + HOST);

globalThis.window = {};
new Function('window', fs.readFileSync(path.join(ROOT, 'assets/data.js'), 'utf8'))(globalThis.window);
const CM = globalThis.window.CM;

/* a guest browser: cookies kept, redirects followed by hand so each hop can be checked */
function browser() {
  const jar = new Map([['playground_auto_login_already_happened', '1']]); // a guest, not Playground's auto-admin
  const go = async (url, init = {}) => {
    const res = await fetch(url, { ...init, redirect: 'manual', headers: { ...(init.headers || {}), Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') } });
    for (const c of res.headers.getSetCookie()) { const [kv] = c.split(';'); const i = kv.indexOf('='); jar.set(kv.slice(0, i).trim(), kv.slice(i + 1)); }
    return res;
  };
  return { go, jar };
}
const admin = (p, init = {}) => fetch(HOST + '/wp-json/wc/v3/' + p, { ...init, headers: { ...(init.headers || {}),
  Authorization: 'Basic ' + Buffer.from(`${sb.SANDBOX_USER}:${sb.SANDBOX_APP_PASSWORD}`).toString('base64'),
  Cookie: 'playground_auto_login_already_happened=1', 'Content-Type': 'application/json' } }).then(r => r.json());

async function handoff(items, { tamper = false, signedAt = null } = {}) {
  const b = browser();
  let to;
  if (signedAt === null) {
    const r = await b.go(STORE + '/bag', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ bag: JSON.stringify(items) }) });
    if (r.status !== 303) throw new Error(`/bag answered ${r.status}: ${await r.text()}`);
    to = r.headers.get('location');
  } else {
    const { payload, sig } = await sign(items, dev.BAG_SECRET, signedAt);
    to = `${HOST}/?sndr_bag=${payload}&sig=${sig}`;
  }
  if (tamper) to = to.replace(/.$/, c => (c === 'A' ? 'B' : 'A'));
  const r = await b.go(to);
  const landed = new URL(r.headers.get('location') || to).pathname;
  // the page first: it prints Woo's session notices, and a Store API call would clear them
  const page = await (await b.go(HOST + landed)).text();
  const cart = await (await b.go(HOST + '/wp-json/wc/store/v1/cart')).json();
  return { b, landed, cart, page };
}

let fails = 0;
const check = (ok, what) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`); if (!ok) fails++; };
const lines = cart => cart.items.map(i => `${i.id}×${i.quantity}`).join(', ') || 'empty';

const hat = CM.all.find(p => p.tyk === 'hats' && !p.oos && p.q >= 1 && !/pom ?pom/i.test(p.t));
const pom = CM.all.find(p => p.tyk === 'pompoms' && !p.oos && p.q >= 1);
const one = CM.all.find(p => !p.oos && p.q === 1 && p.id !== hat.id);
const gone = CM.all.find(p => p.oos);
console.log(`hat #${hat.id} ${hat.t} · pompom #${pom.id} ${pom.t} · one-of-one #${one.id} · sold out #${gone.id}\n`);

/* 1 · the happy path, up to the checkout page */
const bag = [{ id: hat.id, q: 1 }, { id: pom.id, q: 1, note: 'Attach to ' + hat.t }];
const A = await handoff(bag);
check(A.landed === '/checkout/', `hand-off lands on /checkout/ (got ${A.landed})`);
check(lines(A.cart) === `${hat.id}×1, ${pom.id}×1`, `cart holds the hat and the pompom (${lines(A.cart)})`);
const pomLine = A.cart.items.find(i => i.id === pom.id);
check(pomLine && pomLine.item_data.some(d => d.key === 'Note' && d.value === 'Attach to ' + hat.t), 'the pompom line carries its note');

/* 2 · what must be refused or trimmed */
const T = await handoff(bag, { tamper: true });
check(T.landed === '/cart/' && !T.cart.items.length && /could not be opened/i.test(T.page), `a tampered signature fills nothing and says so (landed ${T.landed}, ${lines(T.cart)})`);
const E = await handoff(bag, { signedAt: Date.now() - 11 * 60 * 1000 });
check(E.landed === '/cart/' && !E.cart.items.length && /expired/i.test(E.page), `an 11-minute-old bag is refused as expired (landed ${E.landed})`);
const S = await handoff([{ id: gone.id, q: 1 }, { id: hat.id, q: 1 }]);
check(lines(S.cart) === `${hat.id}×1` && /no longer available/i.test(S.page), `a sold-out piece is left out and said so (${lines(S.cart)})`);
const Q = await handoff([{ id: one.id, q: 5 }]);
check(lines(Q.cart) === `${one.id}×1`, `five of a one-of-one becomes one (${lines(Q.cart)})`);
const bad = await fetch(STORE + '/bag', { method: 'POST', body: new URLSearchParams({ bag: '[{"id":"x","q":1}]' }) });
check(bad.status === 400, `/bag refuses a malformed bag (${bad.status})`);

/* 3 · the order, through the classic checkout form (her live WooCommerce 3.5 has no other), with
   the sandbox test payment, then undone */
const before = Object.fromEntries(await Promise.all([hat.id, pom.id].map(async id => [id, (await admin('products/' + id)).stock_quantity])));
const co = await (await A.b.go(HOST + '/checkout/')).text();
const field = re => (co.match(re) || [])[1] || '';
const form = new URLSearchParams({
  billing_first_name: 'Test', billing_last_name: 'Buyer', billing_country: 'IS', billing_address_1: 'Laugavegur 1',
  billing_city: 'Reykjavík', billing_postcode: '101', billing_email: 'test@example.com', billing_phone: '5555555',
  ship_to_different_address: '0', payment_method: 'cod',
  'shipping_method[0]': field(/name="shipping_method\[0\]"[^>]*value="([^"]+)"/) || field(/value="([^"]+)"[^>]*name="shipping_method\[0\]"/),
  'woocommerce-process-checkout-nonce': field(/name="woocommerce-process-checkout-nonce" value="([a-f0-9]+)"/),
  _wp_http_referer: '/checkout/',
});
if (/name="terms"/.test(co)) form.set('terms', 'on');
const res = await A.b.go(HOST + '/?wc-ajax=checkout', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form });
const out = await res.json().catch(() => ({}));
const placed = { order_id: +((out.redirect || '').match(/order-received\/(\d+)/) || [])[1] || 0 };
check(out.result === 'success' && placed.order_id > 0, `order placed through the classic checkout, sandbox test payment (#${placed.order_id || '?'} ${out.result || res.status} ${(out.messages || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160)})`);
if (placed.order_id) {
  const order = await admin('orders/' + placed.order_id);
  const oPom = order.line_items.find(l => l.product_id === pom.id);
  check(order.line_items.length === 2 && oPom && oPom.meta_data.some(m => m.key === 'Note' && m.value === 'Attach to ' + hat.t), 'the order keeps both lines and the pompom note');
  const itemsTotal = order.line_items.reduce((n, l) => n + +l.total, 0);
  check(Math.abs(itemsTotal - (hat.p + pom.p)) < 0.01, `Woo priced the lines itself: ${itemsTotal} = ${hat.p} + ${pom.p} (order total ${order.total} ${order.currency} with shipping ${order.shipping_total})`);
  await admin('orders/' + placed.order_id, { method: 'PUT', body: JSON.stringify({ status: 'cancelled' }) });
  await admin('orders/' + placed.order_id + '?force=true', { method: 'DELETE' });
  const after = Object.fromEntries(await Promise.all([hat.id, pom.id].map(async id => [id, (await admin('products/' + id)).stock_quantity])));
  check(JSON.stringify(after) === JSON.stringify(before), `order cancelled and deleted, stock back as it was (${JSON.stringify(after)})`);
  const left = await admin('orders?per_page=5&status=any');
  check(Array.isArray(left) && left.length === 0, `the sandbox holds no orders again (${Array.isArray(left) ? left.length : JSON.stringify(left).slice(0, 80)})`);
}

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
