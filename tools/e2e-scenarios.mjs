/* Every checkout scenario, end to end, on a local WooCommerce only:

     node tools/e2e-scenarios.mjs replica   her stack: WooCommerce 3.5.10, WordPress 6.4.12, her two PayPal
                                            gateways (PayPal sandbox mode), on PHP 7.2   :9420 via :5896
                                            (her host runs PHP 7.0.33; 7.2 is the oldest PHP whose SQLite can hold
                                            WooCommerce in Playground. PHP 7.0 itself: 04-platform/mjuk-woo-sandbox/
                                            tools/lint-php70.mjs, on the real 7.0.33 interpreter.)
     node tools/e2e-scenarios.mjs sandbox   current WooCommerce, PHP 8.3, offline test payment  :9410 via :5895

   The storefront's /bag (functions/bag.js) signs the bag; the host's sndr-bag-handoff fills the cart.
   Set-up and read-back go through the local-only test glue (04-platform/mjuk-woo-sandbox/mu-plugins/
   sndr-test-glue.php, token in local/test.env). Every change it makes (stock, prices, orders, test
   customers) is put back, and the run ends by checking that nothing is left behind.

   What "PayPal" means here: PayPal Standard sends the shopper to PayPal and back; the run follows
   that exactly up to PayPal's door (the order waits, unpaid), then plays PayPal's two answers:
   the shopper cancels (PayPal's cancel link) or pays (PayPal's IPN marks the order paid). */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const WS = path.resolve(ROOT, '../..');
const TARGET = process.argv[2] === 'sandbox' ? 'sandbox' : 'replica';
const STORE = TARGET === 'sandbox' ? 'http://localhost:5895' : 'http://localhost:5896';
const WOO = TARGET === 'sandbox' ? 'http://127.0.0.1:9410' : 'http://127.0.0.1:9420';
const env = f => Object.fromEntries(fs.readFileSync(f, 'utf8').split('\n').map(l => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map(m => [m[1], m[2].trim()]));
const TOKEN = env(path.join(WS, '04-platform/mjuk-woo-sandbox/local/test.env')).TEST_TOKEN;
const MAIL = path.join(WS, '04-platform/mjuk-woo-sandbox/local/mail');

globalThis.window = {};
new Function('window', fs.readFileSync(path.join(ROOT, 'assets/data.js'), 'utf8'))(globalThis.window);
const CM = globalThis.window.CM;

let fails = 0, section = '';
const check = (ok, what) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`); if (!ok) fails++; };
const head = s => { section = s; console.log(`\n── ${s}`); };
const money = s => +String(s).replace(/<[^>]+>/g, '').replace(/&#36;|\$|,|&nbsp;/g, '').trim();

/* a shopper's browser: cookies kept, redirects followed by hand so each hop can be checked */
function browser() {
  const jar = new Map([['playground_auto_login_already_happened', '1']]);
  const go = async (url, init = {}) => {
    const res = await fetch(url, { ...init, redirect: 'manual', headers: { ...(init.headers || {}), Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') } });
    for (const c of res.headers.getSetCookie()) { const [kv] = c.split(';'); const i = kv.indexOf('='); const k = kv.slice(0, i).trim(), v = kv.slice(i + 1);
      if (/expires=Thu, 01 Jan 1970|max-age=0/i.test(c) || v === 'deleted') jar.delete(k); else jar.set(k, v); }
    return res;
  };
  // follow redirects on the Woo host, as a browser would; returns the final response and its path
  const follow = async (url, init = {}) => {
    let res = await go(url, init), hops = 0, at = url;
    while ([301, 302, 303, 307].includes(res.status) && hops++ < 8) { at = new URL(res.headers.get('location'), at).href;
      if (!at.startsWith(WOO)) break; res = await go(at); }
    return { res, at, html: res.status === 200 ? await res.text() : '' };
  };
  const cart = async () => (await go(WOO + '/?sndr_test=cart', { headers: { 'X-SNDR-Test': TOKEN } })).json();
  return { go, follow, cart, jar };
}
const glue = async (op, { id, body } = {}) => {
  const r = await fetch(`${WOO}/?sndr_test=${op}${id ? '&id=' + id : ''}`, { method: body ? 'POST' : 'GET', body: body ? JSON.stringify(body) : undefined,
    headers: { 'X-SNDR-Test': TOKEN, Cookie: 'playground_auto_login_already_happened=1', 'Content-Type': 'application/json' } });
  return r.json();
};
const form = (html, name) => (html.match(new RegExp(`name="${name.replace(/[[\]]/g, '\\$&')}"[^>]*value="([^"]*)"`)) || html.match(new RegExp(`value="([^"]*)"[^>]*name="${name.replace(/[[\]]/g, '\\$&')}"`)) || [])[1] || '';
const param = (html, key) => (html.match(new RegExp(`"${key}":"([^"]+)"`)) || [])[1] || '';
const notices = html => [...html.matchAll(/<(?:ul|div)[^>]*class="woocommerce-(?:error|message|info)"[^>]*>([\s\S]*?)<\/(?:ul|div)>/g)].map(m => m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
  .filter(t => !/^Have a coupon\?/.test(t)).join(' | '); // Woo's coupon toggle is an info box too, not a notice
const lines = c => c.items.map(i => `${i.id}×${i.q}`).join(', ') || 'empty';
const phpNoise = html => /<b>(Warning|Notice|Deprecated|Fatal error|Parse error)<\/b>:/.test(html);

/* storefront bag → /bag (signed) → Woo host → wherever Woo lands the shopper */
async function handoff(items, { lang = '', b = browser() } = {}) {
  const body = new URLSearchParams({ bag: JSON.stringify(items) }); if (lang) body.set('lang', lang);
  const r = await b.go(STORE + '/bag', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  if (r.status !== 303) throw new Error(`/bag answered ${r.status}: ${await r.text()}`);
  const to = r.headers.get('location');
  const f = await b.follow(to);
  return { b, to, landed: new URL(f.at).pathname, page: f.html, cart: await b.cart() };
}

/* the checkout's own AJAX: country and shipping choice → the review table WooCommerce draws */
async function review(b, page, { country, method, postcode = '101' } = {}) {
  const body = new URLSearchParams({ security: param(page, 'update_order_review_nonce'), payment_method: '', country, state: '', postcode, city: 'Town', address: 'Street 1', address_2: '',
    s_country: country, s_state: '', s_postcode: postcode, s_city: 'Town', s_address: 'Street 1', s_address_2: '', has_full_address: 'true',
    post_data: new URLSearchParams({ billing_country: country, billing_postcode: postcode }).toString() });
  if (method) body.set('shipping_method[0]', method);
  const r = await b.go(WOO + '/?wc-ajax=update_order_review', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const j = await r.json();
  const table = j.fragments && j.fragments['.woocommerce-checkout-review-order-table'] || '';
  const inputs = [...table.matchAll(/<input[^>]*name="shipping_method\[0\]"[^>]*>/g)].map(m => m[0]);
  const values = inputs.map(t => (t.match(/value="([^"]+)"/) || [])[1]);
  const chosen = (inputs.find(t => /checked/.test(t) || /type="hidden"/.test(t)) || '').match(/value="([^"]+)"/);
  const total = money((table.match(/<tr class="order-total">[\s\S]*?<\/tr>/) || [''])[0].replace(/<th>[\s\S]*?<\/th>/, ''));
  return { methods: values.map(v => v.split(':')[0]), chosen: chosen ? chosen[1] : '', total, values };
}

async function placeOrder(b, { pay }) {
  const co = (await b.follow(WOO + '/checkout/')).html;
  const body = new URLSearchParams({ billing_first_name: 'Test', billing_last_name: 'Buyer', billing_country: 'IS', billing_address_1: 'Laugavegur 1', billing_city: 'Reykjavík',
    billing_postcode: '101', billing_email: 'buyer@example.com', billing_phone: '5555555', ship_to_different_address: '0', payment_method: pay,
    'shipping_method[0]': form(co, 'shipping_method[0]'), 'woocommerce-process-checkout-nonce': form(co, 'woocommerce-process-checkout-nonce'), _wp_http_referer: '/checkout/' });
  if (/name="terms"/.test(co)) body.set('terms', 'on');
  const r = await b.go(WOO + '/?wc-ajax=checkout', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const out = await r.json().catch(() => ({}));
  const id = +((out.redirect || '').match(/order-received\/(\d+)/) || (decodeURIComponent(out.redirect || '').match(/order_id=(\d+)/)) || (decodeURIComponent(out.redirect || '').match(/custom=[^&]*order_id%22%3A(\d+)/)) || [])[1] || 0;
  return { out, id, messages: (out.messages || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() };
}
// signs in with WooCommerce's own form: the one on checkout when her settings show it, else the account page's (same handler)
async function login(b, page, user, pass) {
  let at = '/checkout/', nonce = form(page, 'woocommerce-login-nonce');
  if (!nonce) { at = '/my-account/'; nonce = form((await b.follow(WOO + at)).html, 'woocommerce-login-nonce'); }
  const body = new URLSearchParams({ username: user, password: pass, 'woocommerce-login-nonce': nonce, _wp_http_referer: at, redirect: WOO + '/checkout/', login: 'Login' });
  return b.follow(WOO + at, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
}

const restore = []; // put back whatever a scenario changed, even if it fails
const setProduct = async (id, change) => { const was = await glue('product', { id }); restore.push(() => glue('product_set', { id, body: { regular: was.regular, sale: was.sale, stock: was.stock, stock_status: was.stock_status, status: was.status } }));
  await glue('product_set', { id, body: change }); return was; };

try {
  /* ════════════════════════════════════════════════════════════════════════ */
  head(`the stack (${TARGET})`);
  const info = await glue('info');
  console.log(`      PHP ${info.php} · WordPress ${info.wp} · WooCommerce ${info.woocommerce} · theme ${info.theme} · payments ${info.gateways.join(', ')}`);
  if (TARGET === 'replica') check(/^7\.2\./.test(info.php) && info.woocommerce === '3.5.10' && /^6\.4\./.test(info.wp), 'the replica runs her WooCommerce 3.5.10 and WordPress 6.4, on PHP 7.2');
  check(info.theme === 'mjuk-checkout' && info.manage_stock === 'yes', `checkout theme on, stock managed (${info.theme}, ${info.manage_stock})`);
  if (TARGET === 'replica') check(info.gateways.join() === 'paypal,ppec_paypal', `her two PayPal gateways are offered, as on her shop (${info.gateways})`);
  const CART = new URL(info.cart).pathname, PAY = TARGET === 'replica' ? 'paypal' : 'cod';
  check((await glue('orders')).length === 0, 'no orders before the run');

  const hat = CM.all.find(p => p.id === 12167), pom = CM.all.find(p => p.id === 4249), one = CM.all.find(p => p.id === 11646);
  const gone = CM.all.find(p => p.oos);
  const spare = CM.all.find(p => !p.oos && p.q >= 3 && ![hat.id, pom.id, one.id].includes(p.id) && !/pom ?pom/i.test(p.t)); // price is set per case
  const w = x => ({ id: x.id, q: 1, p: x.p });
  console.log(`      hat #${hat.id} $${hat.p} · pompom #${pom.id} $${pom.p} · one-of-one #${one.id} · sold out #${gone.id} · spare #${spare.id}`);

  /* ════════════════════════════════════════════════════════════════════════ */
  head('hand-off');
  const bag = [w(hat), { ...w(pom), note: 'Attach to ' + hat.t, for: hat.id }];
  const A = await handoff(bag);
  check(A.landed === '/checkout/', `a bag lands on checkout (${A.landed})`);
  check(lines(A.cart) === `${hat.id}×1, ${pom.id}×1`, `the cart holds the hat and its pompom (${lines(A.cart)})`);
  check(A.cart.items.find(i => i.id === pom.id).note === 'Attach to ' + hat.t && A.page.includes('Attach to ' + hat.t), 'the pompom carries "Attach to …" into the cart and the checkout page');
  check(!/price has changed/i.test(notices(A.page)) && !notices(A.page), `no notice when nothing changed (${notices(A.page) || 'none'})`);
  check(!phpNoise(A.page), 'the checkout page prints no PHP warning');
  { const t = await handoff(bag); const b = browser(); const f = await b.follow(t.to); // the same link a second time
    check(new URL(f.at).pathname === CART && /already been opened/i.test(notices(f.html)) && !(await b.cart()).items.length, 'a used link fills nothing and says so'); }
  { const b = browser(); const f = await b.follow(A.to.replace(/.$/, c => (c === 'A' ? 'B' : 'A')));
    check(new URL(f.at).pathname === CART && /could not be opened/i.test(notices(f.html)), 'a tampered link fills nothing and says so'); }
  { const { sign } = await import('../functions/bag.js'); const dev = env(path.join(ROOT, '.dev.vars'));
    const s = await sign(bag, dev.BAG_SECRET, Date.now() - 11 * 60 * 1000); const b = browser(); const f = await b.follow(`${WOO}/?sndr_bag=${s.payload}&sig=${s.sig}`);
    check(/expired/i.test(notices(f.html)) && !(await b.cart()).items.length, 'an 11-minute-old link is refused as expired'); }
  { const r = await fetch(WOO + '/?sndr_bag=ping', { redirect: 'manual', headers: { Cookie: 'playground_auto_login_already_happened=1' } });
    check(r.status === 204 && r.headers.get('x-sndr-bag') === 'ready', `the deploy ping answers 204 ready (${r.status})`); }
  check((await fetch(STORE + '/bag')).status === 204, 'the storefront knows checkout is connected (GET /bag 204)');
  for (const [what, body, type] of [['a malformed bag', new URLSearchParams({ bag: '[{"id":"x","q":1}]' }), undefined], ['a bag with a negative price', new URLSearchParams({ bag: '[{"id":1,"q":1,"p":-1}]' }), undefined], ['a non-form post', '{}', 'application/json']])
    check((await fetch(STORE + '/bag', { method: 'POST', body, headers: type ? { 'Content-Type': type } : {} })).status === 400, `/bag refuses ${what} with 400`);

  /* ════════════════════════════════════════════════════════════════════════ */
  head('Woo is the final word on stock and availability');
  { await setProduct(hat.id, { stock: 0, stock_status: 'outofstock' });
    const S = await handoff([w(hat), { ...w(pom), note: 'Attach to ' + hat.t, for: hat.id }, w(one)]);
    check(lines(S.cart) === `${one.id}×1` && /no longer available/i.test(notices(S.page)), `sold at her shop since the pull: the hat and its pompom stay out, said once (${lines(S.cart)}; ${notices(S.page)})`);
    await restore.pop()(); }
  { await setProduct(hat.id, { stock: 2 });
    const F = await handoff([{ ...w(hat), q: 3 }]);
    check(lines(F.cart) === `${hat.id}×2` && /Fewer were left/i.test(notices(F.page)), `three asked, two left: two go in and the basket says so (${lines(F.cart)})`);
    await restore.pop()(); }
  { await setProduct(one.id, { status: 'draft' });
    const D = await handoff([w(one), w(hat)]);
    check(lines(D.cart) === `${hat.id}×1` && /no longer available/i.test(notices(D.page)), `taken off her shop (draft): left out and said (${lines(D.cart)})`);
    await restore.pop()(); }
  { const hidden = 6048; const h = await glue('product', { id: hidden }); // her Explorer Hat, black: published but hidden from her catalogue
    const V = await handoff([{ id: hidden, q: 1 }, w(one)]);
    check(h && h.status === 'publish' && lines(V.cart) === `${one.id}×1` && /no longer available/i.test(notices(V.page)), `a product she hides from her catalogue never goes in, even from a bag built by hand (${lines(V.cart)})`);
    const draft = 6049; const D2 = await handoff([{ id: draft, q: 1 }, w(one)]); // a draft of hers, untouched
    check(lines(D2.cart) === `${one.id}×1`, `one of her drafts never goes in either (${lines(D2.cart)})`); }
  { const P = await handoff([{ ...w(one), q: 5 }, { ...w(pom), q: 3, note: 'Attach to ' + one.t, for: one.id }]);
    check(lines(P.cart) === `${one.id}×1, ${pom.id}×1`, `pompoms never outnumber the hats that went in (${lines(P.cart)})`); }
  { const O = await handoff([{ id: gone.id, q: 1, p: gone.p }]);
    check(O.landed === CART && !O.cart.items.length && /no longer available/i.test(notices(O.page)), `a bag of only sold-out pieces opens the basket, empty, with the reason (${O.landed})`); }

  /* ════════════════════════════════════════════════════════════════════════ */
  head('prices');
  { await setProduct(hat.id, { regular: String(hat.p + 7), sale: '' });
    const C = await handoff([w(hat)]);
    check(new RegExp(`price has changed.*${hat.t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} is now \\$${(hat.p + 7).toFixed(2)}`, 'i').test(notices(C.page)), `her price changed since the pull: the basket says so, with the new price (${notices(C.page)})`);
    const r = await review(C.b, C.page, { country: 'IS' });
    check(Math.abs(r.total - (hat.p + 7 + 15)) < 0.01, `and charges her price, not the bag's ($${r.total} = ${hat.p + 7} + 15 shipping)`);
    await restore.pop()(); }

  /* ════════════════════════════════════════════════════════════════════════ */
  head('one cart per shopper');
  { const b = browser(); await handoff([w(hat)], { b }); const second = await handoff([w(one)], { b });
    check(lines(second.cart) === `${one.id}×1`, `a second checkout from the same browser replaces the first basket, never adds to it (${lines(second.cart)})`); }
  const users = [];
  { const u = `replica_${Date.now()}`, pass = 'Test-pass-' + Date.now();
    const c = await glue('customer', { body: { email: `${u}@example.com`, username: u, password: pass, saved: [spare.id] } }); users.push(c.id);
    const L = await handoff([w(hat)]);
    const after = await login(L.b, L.page, u, pass); const cart = await L.b.cart();
    check(cart.user > 0, `a returning customer can sign in on the checkout page (user #${cart.user}, at ${new URL(after.at).pathname})`);
    check(lines(cart) === `${hat.id}×1`, `signing in does not pour an old saved basket into this one (${lines(cart)}; saved was #${spare.id})`); }
  { const u = `replica_b_${Date.now()}`, pass = 'Test-pass-' + Date.now();
    const c = await glue('customer', { body: { email: `${u}@example.com`, username: u, password: pass, saved: [spare.id] } }); users.push(c.id);
    const b = browser(); const acc = await b.follow(WOO + '/my-account/');
    await b.follow(WOO + '/my-account/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ username: u, password: pass, 'woocommerce-login-nonce': form(acc.html, 'woocommerce-login-nonce'), _wp_http_referer: '/my-account/', login: 'Login' }) });
    const H = await handoff([w(one)], { b });
    check(H.cart.user > 0 && lines(H.cart) === `${one.id}×1` && H.landed === '/checkout/', `already signed in: the bag replaces the saved basket (${lines(H.cart)}, user #${H.cart.user})`);
    const acct = await b.follow(WOO + '/my-account/');
    check(/<h1 class="head__t">Your account</.test(acct.html) && !phpNoise(acct.html), 'the account page greets a signed-in customer in the checkout theme'); }
  for (const id of users) await glue('customer_delete', { id });

  /* ════════════════════════════════════════════════════════════════════════ */
  head('shipping, as her zones say');
  const ship = async (price, country, qty = 1) => { await glue('product_set', { id: spare.id, body: { regular: String(price), sale: '', stock: 10 } });
    const H = await handoff([{ id: spare.id, q: qty, p: price }]); return { H, r: await review(H.b, H.page, { country }) }; };
  await setProduct(spare.id, {});
  const cases = [
    ['IS', 149.99, 'flat_rate', 15, 'Iceland under $150: flat $15 (pickup offered too)'], ['IS', 150, 'free_shipping', 0, 'Iceland from $150: free, chosen for her'],
    ['DE', 149.99, 'flat_rate', 50, 'Germany under $150: $50'], ['DE', 150, 'free_shipping', 0, 'Germany from $150: free'],
    ['GB', 150, 'free_shipping', 0, 'UK from $150: free'], ['CH', 150, 'free_shipping', 0, 'Switzerland from $150: free'],
    ['NO', 150, 'flat_rate', 50, 'Norway at $150: $50, because her EU zone leaves Norway out (for Anna)'], ['NO', 250, 'free_shipping', 0, 'Norway from $250: free, the everywhere-else rule'],
    ['US', 249.99, 'flat_rate', 50, 'USA under $250: $50'], ['US', 250, 'free_shipping', 0, 'USA from $250: free'],
    ['AU', 299.99, 'flat_rate', 70, 'Australia under $300: $70'], ['AU', 300, 'free_shipping', 0, 'Australia from $300: free'],
  ];
  for (const [country, price, method, cost, what] of cases) {
    const { r } = await ship(price, country);
    check(r.chosen.startsWith(method + ':') && Math.abs(r.total - (price + cost)) < 0.01, `${what} (chose ${r.chosen || 'nothing'} of ${r.methods.join('/')}, total $${r.total})`);
  }
  { const { H, r } = await ship(200, 'US'); const r2 = await review(H.b, H.page, { country: 'DE' });
    check(r.chosen.startsWith('flat_rate') && r2.chosen.startsWith('free_shipping'), `changing country on the form re-chooses: USA $200 pays $50, Germany $200 ships free (${r.chosen} → ${r2.chosen})`);
    const pick = r2.values.length ? (await review(H.b, H.page, { country: 'IS' })).values.find(v => v.startsWith('local_pickup')) : '';
    const r3 = await review(H.b, H.page, { country: 'IS', method: pick }); const r4 = await review(H.b, H.page, { country: 'IS' });
    check(!!pick && r3.chosen === pick && r4.chosen === pick, `a shopper who picks pickup in Iceland keeps it when the form updates (${r3.chosen}, then ${r4.chosen})`); }
  { const { H, r } = await ship(100, 'IS');
    const basket = (await H.b.follow(WOO + CART)).html; const key = (basket.match(/name="cart\[([a-f0-9]+)\]\[qty\]"/) || [])[1];
    await H.b.follow(WOO + CART, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ [`cart[${key}][qty]`]: '2', update_cart: 'Update basket', 'woocommerce-cart-nonce': form(basket, 'woocommerce-cart-nonce'), _wp_http_referer: CART }) });
    const co = (await H.b.follow(WOO + '/checkout/')).html; const r2 = await review(H.b, co, { country: 'IS' });
    check(r.chosen.startsWith('flat_rate') && r2.chosen.startsWith('free_shipping') && Math.abs(r2.total - 200) < 0.01, `raising the quantity in the basket past $150 switches Iceland to free shipping (${r.chosen} → ${r2.chosen}, $${r2.total})`); }
  await restore.pop()();

  /* ════════════════════════════════════════════════════════════════════════ */
  head('basket page and coupons');
  { const B = await handoff([w(hat)]); const basket = (await B.b.follow(WOO + CART)).html;
    check(basket.includes(`${STORE}/product.html?p=${encodeURIComponent(hat.h)}`), 'a basket line links to the piece on the storefront, not her old product page');
    check(/<h1 class="head__t">Your bag</.test(basket) && basket.includes(`${STORE}/shop.html`) && !phpNoise(basket), 'the basket is dressed as the storefront, with the way back to the shop');
    const co = (await B.b.follow(WOO + '/checkout/')).html;
    const bad = await (await B.b.go(WOO + '/?wc-ajax=apply_coupon', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ security: param(co, 'apply_coupon_nonce'), coupon_code: 'nosuchcode' }) })).text();
    check(/does not exist/i.test(bad), 'an unknown coupon code is refused in words');
    if (TARGET === 'replica') { const ok = await (await B.b.go(WOO + '/?wc-ajax=apply_coupon', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ security: param(co, 'apply_coupon_nonce'), coupon_code: 'replica10' }) })).text();
      const r = await review(B.b, co, { country: 'IS' });
      check(/applied successfully/i.test(ok) && Math.abs(r.total - (hat.p * 0.9 + 15)) < 0.01, `a real coupon applies (10% off: $${r.total})`); } }
  { const b = browser(); const empty = await b.follow(WOO + CART);
    check(empty.html.includes(`${STORE}/shop.html`) && !phpNoise(empty.html), 'an empty basket sends the shopper back to the storefront shop'); }

  /* ════════════════════════════════════════════════════════════════════════ */
  head(TARGET === 'replica' ? 'paying with PayPal (her PayPal Standard, sandbox mode)' : 'paying (sandbox test payment)');
  const stockBefore = (await glue('product', { id: hat.id })).stock;
  const mailBefore = new Set(fs.existsSync(MAIL) ? fs.readdirSync(MAIL) : []);
  if (TARGET === 'replica') {
    const X = await handoff(bag); const first = await placeOrder(X.b, { pay: PAY });
    const to = first.out.redirect ? new URL(first.out.redirect) : null;
    check(first.out.result === 'success' && to && to.host === 'www.sandbox.paypal.com', `placing the order sends the shopper to PayPal (${to ? to.host : first.messages})`);
    const o1 = await glue('order', { id: first.id });
    check(o1 && o1.status === 'pending' && lines(await X.b.cart()) === `${hat.id}×1, ${pom.id}×1`, `the order waits unpaid and the basket is kept while she is at PayPal (${o1 && o1.status})`);
    check(o1 && o1.lines.find(l => l.id === pom.id).note === 'Attach to ' + hat.t, 'the order line keeps "Attach to …"');
    // PayPal's cancel button: back to her shop, order cancelled, basket still full
    const cancel = to.searchParams.get('cancel_return'); const back = await X.b.follow(cancel);
    check((await glue('order', { id: first.id })).status === 'cancelled' && new URL(back.at).pathname === CART && /cancelled/i.test(notices(back.html)) && lines(await X.b.cart()) === `${hat.id}×1, ${pom.id}×1`,
      `cancelling at PayPal: the order is cancelled, the basket still holds the bag, and she is told (${notices(back.html)})`);
    // she tries again and pays
    const again = await placeOrder(X.b, { pay: PAY }); const to2 = new URL(again.out.redirect);
    const ret = await X.b.follow(to2.searchParams.get('return'));
    check(/<h1 class="head__t">Thank you</.test(ret.html) && ret.html.includes(`${STORE}/shop.html?ordered=1`) && !phpNoise(ret.html), 'back from PayPal before its confirmation arrives: Thank you, and the link empties the storefront bag');
    await glue('order_set', { id: again.id, body: { pay: true } }); // PayPal's IPN: paid
    const paid = await glue('order', { id: again.id });
    check(paid.status === 'processing' && (await glue('product', { id: hat.id })).stock === stockBefore - 1, `PayPal confirms: the order is paid and her stock goes down by one (${paid.status}, stock ${stockBefore} → ${stockBefore - 1})`);
    await new Promise(r => setTimeout(r, 400));
    const mails = fs.existsSync(MAIL) ? fs.readdirSync(MAIL).filter(f => !mailBefore.has(f)).map(f => JSON.parse(fs.readFileSync(path.join(MAIL, f), 'utf8'))) : [];
    const toHer = mails.find(m => /new.*order/i.test(m.subject)), toBuyer = mails.find(m => [].concat(m.to).includes('buyer@example.com') && !/cancel/i.test(m.subject));
    check(!!toHer && toHer.message.includes('Attach to ' + hat.t), `her new-order email says which hat the pompom goes on (${toHer ? toHer.subject : 'no email'})`);
    check(!!toBuyer, `the buyer gets WooCommerce's order email (${toBuyer ? toBuyer.subject : 'none'})`);
    await glue('order_set', { id: again.id, body: { status: 'failed' } });
    const failed = await X.b.follow(to2.searchParams.get('return'));
    const payLink = (failed.html.match(/href="([^"]*order-pay[^"]*)"/) || [])[1];
    check(/<h1 class="head__t">Not paid yet</.test(failed.html) && !failed.html.includes('ordered=1'), 'a payment PayPal turns down: Not paid yet, and the way back keeps the bag');
    const payPage = payLink ? await X.b.follow(payLink.replace(/&(amp|#038);/g, '&')) : { html: '' }; // WordPress writes & as &#038; in links
    check(/<h1 class="head__t">Checkout</.test(payPage.html) && /name="payment_method"/.test(payPage.html) && !phpNoise(payPage.html), 'her "Pay" link opens the order again in the checkout theme, ready to pay');
    for (const id of [first.id, again.id]) { await glue('order_set', { id, body: { status: 'cancelled' } }); await glue('order_delete', { id }); }
  } else {
    const X = await handoff(bag); const o = await placeOrder(X.b, { pay: PAY });
    check(o.out.result === 'success' && o.id > 0, `the order goes through with the test payment (#${o.id} ${o.messages})`);
    const thanks = await X.b.follow(o.out.redirect);
    check(/<h1 class="head__t">Thank you</.test(thanks.html) && thanks.html.includes(`${STORE}/shop.html?ordered=1`), 'Thank you, and the link empties the storefront bag');
    await glue('order_set', { id: o.id, body: { status: 'failed' } });
    const failed = await X.b.follow(o.out.redirect);
    check(/<h1 class="head__t">Not paid yet</.test(failed.html) && !failed.html.includes('ordered=1'), 'a failed payment: Not paid yet, the bag is kept');
    await glue('order_set', { id: o.id, body: { status: 'cancelled' } }); await glue('order_delete', { id: o.id });
  }
  check((await glue('product', { id: hat.id })).stock === stockBefore, `orders undone: stock back to ${stockBefore}`);

  /* ════════════════════════════════════════════════════════════════════════ */
  head('Icelandic');
  { const I = await handoff([w(hat)], { lang: 'is' });
    const basket = (await I.b.follow(WOO + CART)).html;
    check(I.cart.lang === 'is' && I.page.includes(`${STORE}/is/shop.html`) && basket.includes(`${STORE}/is/product.html?p=`), 'a bag from the Icelandic shop: the ways back from checkout and basket lead to the Icelandic pages');
    const E = await handoff([w(hat)], { b: I.b });
    check(E.cart.lang === '' && E.page.includes(`${STORE}/shop.html`) && !E.page.includes('/is/shop.html'), 'the same browser checking out from the English shop later goes back to English'); }
} finally {
  while (restore.length) await restore.pop()();
  const left = await glue('orders').catch(() => null);
  console.log('');
  check(Array.isArray(left) && left.length === 0, `nothing left behind: no orders (${Array.isArray(left) ? left.length : '?'})`);
}
console.log(fails ? `\n${fails} FAILED (${TARGET})` : `\nALL PASS (${TARGET})`);
process.exit(fails ? 1 : 0);
