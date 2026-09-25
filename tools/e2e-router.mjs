/* Launch-day rehearsal of the one-address router (edge/router.js), locally, never live.

     node tools/build-production.mjs && node --no-warnings tools/e2e-router.mjs [replica|upgraded|sandbox|<origin>]

   The router runs in workerd (the installed wrangler's unstable_dev, wrangler.jsonc, assets = dist/)
   on http://localhost:8787, in front of a local WooCommerce (default the replica of her stack,
   :9420). One hostname, as it will be live: the shopper's cookies, WordPress's own links, PayPal's
   return and notify URLs all say localhost:8787. (Live the router keeps the Host header; locally
   it says X-SNDR-Rehearsal-Host and the local test glue makes WordPress answer as that host.)
   127.0.0.1:8787 plays mjukiceland.is.

   Checks the route table (ours, hers, the 301s for her old addresses, never-cached paths), then a
   shopper end to end through the router: product page → bag → hand-off → basket cookie → basket →
   checkout → shipping recalculated by wc-ajax → PayPal order → PayPal's return and IPN addresses on
   this host → order-received page; then wp-admin sign-in and wp-json. The order is cancelled and
   deleted again and stock checked back. */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const ROOT = path.resolve(import.meta.dirname, '..');
const WS = path.resolve(ROOT, '../..');
const arg = process.argv[2] || 'replica';
const WOO = { sandbox: 'http://127.0.0.1:9410', replica: 'http://127.0.0.1:9420', upgraded: 'http://127.0.0.1:9430' }[arg] || arg.replace(/\/$/, '');
const PORT = 8787, SHOP = `http://localhost:${PORT}`, ISHOST = `127.0.0.1:${PORT}`;
const env = f => Object.fromEntries(fs.readFileSync(f, 'utf8').split('\n').map(l => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map(m => [m[1], m[2].trim()]));
const DEV = env(path.join(ROOT, '.dev.vars'));
const TOKEN = env(path.join(WS, '04-platform/mjuk-woo-sandbox/local/test.env')).TEST_TOKEN;
if (!fs.existsSync(path.join(ROOT, 'dist/index.html'))) throw new Error('no dist/: run node tools/build-production.mjs first');

globalThis.window = {};
new Function('window', fs.readFileSync(path.join(ROOT, 'assets/data.js'), 'utf8'))(globalThis.window);
const CM = globalThis.window.CM;
const CATS = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/category-map.json'), 'utf8')).map;
const PULL = path.join(WS, '04-platform/mjuk-shipping/data/products-2026-09-24.json');
const hidden = fs.existsSync(PULL) ? JSON.parse(fs.readFileSync(PULL, 'utf8')).find(p => p.status === 'publish' && p.catalog_visibility !== 'visible') : null;

let fails = 0;
const check = (ok, what) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`); if (!ok) fails++; };
const head = s => console.log(`\n── ${s}`);

const require = createRequire('/Users/sindri/.npm-global/lib/node_modules/wrangler/package.json');
const { unstable_dev } = require('wrangler');
// the real wrangler.jsonc minus its live routes: with routes, wrangler dev rewrites every request's URL
// to the first route's host, and the router could not tell the two hosts apart
const CFG = path.join(ROOT, '.wrangler', 'rehearsal.jsonc');
fs.mkdirSync(path.dirname(CFG), { recursive: true });
{ const c = JSON.parse(fs.readFileSync(path.join(ROOT, 'wrangler.jsonc'), 'utf8').replace(/^\s*\/\/.*$/gm, ''));
  delete c.routes; c.main = path.join(ROOT, c.main); c.assets.directory = path.join(ROOT, c.assets.directory);
  fs.writeFileSync(CFG, JSON.stringify(c, null, 1)); }
const worker = await unstable_dev(path.join(ROOT, 'edge/router.js'), {
  config: CFG, port: PORT, ip: '127.0.0.1', logLevel: 'error', experimental: { disableExperimentalWarning: true },
  vars: { ORIGIN: WOO, EN_HOST: `localhost:${PORT}`, IS_HOST: ISHOST, CHECKOUT_ORIGIN: SHOP, BAG_SECRET: DEV.BAG_SECRET },
});

/* one shopper's browser on the one hostname: cookies kept, each hop visible */
function browser() {
  const jar = new Map([['playground_auto_login_already_happened', '1']]);
  const go = async (url, init = {}) => {
    const res = await fetch(url, { ...init, redirect: 'manual', headers: { ...(init.headers || {}), Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') } });
    for (const c of res.headers.getSetCookie()) { const [kv] = c.split(';'); const i = kv.indexOf('='); const k = kv.slice(0, i).trim(), v = kv.slice(i + 1);
      if (/expires=Thu, 01 Jan 1970|max-age=0/i.test(c) || v === 'deleted') jar.delete(k); else jar.set(k, v); }
    return res;
  };
  const follow = async (url, init = {}) => {
    let res = await go(url, init), at = url, hops = 0; const route = [];
    while ([301, 302, 303, 307, 308].includes(res.status) && hops++ < 8) { route.push(res.headers.get('x-mjuk-route')); at = new URL(res.headers.get('location'), at).href; if (!at.startsWith(SHOP)) break; res = await go(at); }
    route.push(res.headers.get('x-mjuk-route'));
    return { res, at, route, html: res.status === 200 ? await res.text() : '' };
  };
  return { go, follow, jar };
}
// the test glue, straight on the Woo host; a shopper's session is read as the router's host (WordPress
// names its cookies after its own address)
const glue = async (op, { id, body, cookies } = {}) => (await fetch(`${WOO}/?sndr_test=${op}${id ? '&id=' + id : ''}`, { method: body ? 'POST' : 'GET', body: body ? JSON.stringify(body) : undefined,
  headers: { 'X-SNDR-Test': TOKEN, Cookie: cookies || 'playground_auto_login_already_happened=1', 'Content-Type': 'application/json', ...(cookies ? { 'X-SNDR-Rehearsal-Host': `localhost:${PORT}` } : {}) } })).json();
const form = (html, name) => (html.match(new RegExp(`name="${name.replace(/[[\]]/g, '\\$&')}"[^>]*value="([^"]*)"`)) || html.match(new RegExp(`value="([^"]*)"[^>]*name="${name.replace(/[[\]]/g, '\\$&')}"`)) || [])[1] || '';
const param = (html, key) => (html.match(new RegExp(`"${key}":"([^"]+)"`)) || [])[1] || '';
const req = (u, init) => fetch(u, { redirect: 'manual', ...init });
const route = r => r.headers.get('x-mjuk-route') || '';

let orderId = 0, stockBefore = null;
// orders already there (the upgraded copy carries seeded ones); the rehearsal must add none
const KEEP = new Set(await glue('orders'));
const one = CM.all.find(p => !p.oos && p.q === 1 && p.tyk !== 'hats' && p.id !== 11646) || CM.all.find(p => !p.oos);
try {
  head('route table: ours');
  { const r = await req(SHOP + '/'); const h = await r.text();
    check(r.status === 200 && route(r) === 'storefront' && h.includes('"@type":"WebSite"') && !/noindex/.test(h), `/ is the storefront's homepage, indexable (${r.status} ${route(r)})`); }
  { const r = await req(`${SHOP}/product/${one.h}/`); const h = await r.text();
    check(r.status === 200 && route(r) === 'storefront' && h.includes(`<link rel="canonical" href="https://mjukiceland.com/product/${one.h}/"`), `her product address /product/${one.h}/ is our page`); }
  for (const p of ['/shop.html', '/fibres.html', '/assets/logo.png', '/pdp.js', '/sitemap.xml']) { const r = await req(SHOP + p); check(r.status === 200 && route(r) === 'storefront', `${p} → storefront (${r.status})`); }
  { const r = await req(SHOP + '/robots.txt'); const t = await r.text(); check(r.status === 200 && /Sitemap: https:\/\/mjukiceland\.com\/sitemap\.xml/.test(t) && !/^Disallow: \/\s*$/m.test(t), 'robots.txt is the production one, with the sitemap'); }
  { const r = await req(SHOP + '/?utm_source=newsletter&fbclid=x'); check(r.status === 200 && route(r) === 'storefront', 'the homepage with tracking tags stays ours'); }

  head('route table: hers, Host unchanged');
  for (const [p, want] of [['/basket/', 200], ['/checkout/', null], ['/my-account/', 200], ['/wp-json/', 200], ['/wp-sitemap.xml', null], ['/wp-login.php', 200], ['/?s=hat', null], ['/?p=1', null]]) {
    const r = await req(SHOP + p); check(route(r).startsWith('wordpress') && (!want || r.status === want) && r.status < 500, `${p} → her WordPress (${r.status} ${route(r)})`);
  }
  { const r = await req(SHOP + '/wp-json/wc/v3/products'); check(route(r).startsWith('wordpress') && r.status === 401, `wc/v3 reaches her REST API, which asks for its key (${r.status})`); }
  if (hidden) { const r = await req(`${SHOP}/product/${hidden.slug}/`); check(route(r) === 'wordpress:fallback' && r.status === 200, `a piece she hid (no page of ours): her own page answers (${r.status})`); }
  { const r = await req(SHOP + '/contact-us/'); check(route(r) === 'wordpress:fallback', `her own pages (contact, shipping, blog) stay hers (${r.status})`); }
  for (const p of ['/basket/', '/checkout/', '/my-account/', '/wp-admin/', '/?wc-ajax=get_refreshed_fragments', '/?add-to-cart=' + one.id, '/?wc-api=WC_Gateway_Paypal']) {
    const r = await req(SHOP + p, p.includes('wc-ajax') ? { method: 'POST' } : {}); const cc = r.headers.get('cache-control') || '';
    check(/no-store/.test(cc) && /private/.test(cc), `${p}: never cached (${cc})`);
  }
  // her old add-to-cart links carry the action on any page: WordPress must get it, uncached (Codex finding)
  for (const p of [`/product/${one.h}/?add-to-cart=${one.id}`, `/shop/?add-to-cart=${one.id}`, `/shop.html?wc-ajax=get_refreshed_fragments`]) {
    const r = await req(SHOP + p); check(route(r) === 'wordpress:action' && /no-store/.test(r.headers.get('cache-control') || ''), `${p} → her WordPress, uncached (${r.status} ${route(r)})`);
  }
  { const r = await req(SHOP + '/shop.html', { headers: { Cookie: 'wp_woocommerce_session_abc=1' } }); check(route(r) === 'storefront', 'a WooCommerce session cookie does not take the storefront away'); }
  { const r = await req(SHOP + '/wp-content/themes/mjuk-checkout/style.css', { headers: { Cookie: 'woocommerce_items_in_cart=1' } }); check(route(r).startsWith('wordpress') && /no-store/.test(r.headers.get('cache-control') || ''), 'with a cart cookie, even her files are fetched uncached'); }

  head('her old addresses → ours (301)');
  const cat = Object.entries(CATS).find(([, c]) => c.path.includes('/') && c.to.includes('family='));
  for (const [from, to] of [['/shop/', '/shop.html'], ['/shop/page/3/', '/shop.html'], ['/index.html', '/'], [`/product.html?p=${one.h}`, `/product/${one.h}/`], [`/product/${one.h}`, `/product/${one.h}/`],
    [`/product-category/${cat[1].path}/`, '/' + cat[1].to], [`/product-category/${cat[1].path}/page/2/`, '/' + cat[1].to], [`/product-category/${cat[0]}/`, '/' + cat[1].to], ['/product-category/hats/', '/shop.html?type=hats']]) {
    const r = await req(SHOP + from); check(r.status === 301 && r.headers.get('location') === to, `${from} → ${to} (${r.status} ${r.headers.get('location')})`);
  }
  { const r = await req(SHOP + '/is/shop.html'); check(r.status === 301 && r.headers.get('location') === `https://${ISHOST}/shop.html`, `/is/… on .com → the Icelandic host (${r.headers.get('location')})`); }
  { const r = await req(SHOP + '/product-category/no-such-category/'); check(route(r).startsWith('wordpress'), 'a category she no longer has: WordPress answers for it'); }
  { const r = await req(`http://www.localhost:${PORT}/shop.html`, { headers: { Host: `www.localhost:${PORT}` } }).catch(() => null); if (r) check(r.status === 301, 'www. → the bare host'); }

  head('mjukiceland.is (played by 127.0.0.1:8787)');
  { const r = await req(`http://${ISHOST}/`); const h = await r.text(); check(r.status === 200 && /<html lang="is"/.test(h) && h.includes('"url":"https://mjukiceland.is/"'), 'the Icelandic homepage at the root of its host, with its own site name'); }
  { const r = await req(`http://${ISHOST}/product/${one.h}/`); const h = await r.text(); check(r.status === 200 && /<html lang="is"/.test(h) && h.includes(`href="https://mjukiceland.com/product/${one.h}/"`), 'an Icelandic product page, its language switch to the English host'); }
  for (const p of ['/assets/logo.png', '/styles.css', '/app.js', '/robots.txt', '/sitemap.xml']) { const r = await req(`http://${ISHOST}${p}`); check(r.status === 200, `${p} on the Icelandic host (${r.status})`); }
  { const r = await req(`http://${ISHOST}/robots.txt`); check((await r.text()).includes('Sitemap: https://mjukiceland.is/sitemap.xml'), 'its robots.txt names its own sitemap'); }
  { const r = await req(`http://${ISHOST}/wp-admin/`); check(r.status === 404, 'no WordPress behind the Icelandic host'); }
  { const r = await req(`http://${ISHOST}/bag`); check(r.status === 204, '/bag is there too (checkout is on .com)'); }

  head('a shopper, one hostname, end to end');
  const b = browser();
  stockBefore = (await glue('product', { id: one.id })).stock;
  { const r = await b.go(`${SHOP}/product/${one.h}/`); check(r.status === 200, 'opens the product page'); }
  const bag = [{ id: one.id, q: 1, p: one.p }];
  const post = await b.go(SHOP + '/bag', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ bag: JSON.stringify(bag) }) });
  const handoff = post.headers.get('location') || '';
  check(post.status === 303 && handoff.startsWith(SHOP + '/?sndr_bag='), `the bag is signed and sent to the same host (${post.status} ${handoff.slice(0, 60)}…)`);
  const land = await b.follow(handoff);
  check(new URL(land.at).pathname === '/checkout/' && land.route.every(x => (x || '').startsWith('wordpress')), `the hand-off opens checkout through the router (${new URL(land.at).pathname}, ${land.route.join(' → ')})`);
  const session = [...b.jar.keys()].find(k => k.startsWith('wp_woocommerce_session_'));
  check(!!session && b.jar.has('woocommerce_items_in_cart'), `her basket cookie is set on this host (${session || 'none'})`);
  const cart = await glue('cart', { cookies: [...b.jar].map(([k, v]) => `${k}=${v}`).join('; ') });
  check(cart.items && cart.items.some(i => i.id === one.id), `the cart holds the piece (${(cart.items || []).map(i => i.id + '×' + i.q).join(', ')})`);
  { const r = await b.follow(SHOP + '/basket/'); check(r.res.status === 200 && r.html.includes(`/product/${one.h}/`), 'the basket, through the router, links the piece to its product address'); }
  const co = land.html || (await b.follow(SHOP + '/checkout/')).html;
  const recalc = async country => { const body = new URLSearchParams({ security: param(co, 'update_order_review_nonce'), payment_method: '', country, state: '', postcode: '101', city: 'Town', address: 'Street 1', address_2: '', s_country: country, s_state: '', s_postcode: '101', s_city: 'Town', s_address: 'Street 1', s_address_2: '', has_full_address: 'true', post_data: new URLSearchParams({ billing_country: country }).toString() });
    const r = await b.go(SHOP + '/?wc-ajax=update_order_review', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
    const j = await r.json().catch(() => ({})); const t = (j.fragments && j.fragments['.woocommerce-checkout-review-order-table']) || '';
    return { route: route(r), cc: r.headers.get('cache-control') || '', methods: [...t.matchAll(/name="shipping_method\[0\]"[^>]*value="([^"]+)"|value="([^"]+)"[^>]*name="shipping_method\[0\]"/g)].map(m => (m[1] || m[2]).split(':')[0]).join(','), total: (t.match(/<tr class="order-total">[\s\S]*?<\/tr>/) || [''])[0].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() }; };
  const is = await recalc('IS'), de = await recalc('DE');
  check(is.route.startsWith('wordpress') && /no-store/.test(is.cc) && is.methods && de.methods && (is.methods !== de.methods || is.total !== de.total), `wc-ajax recalculates shipping through the router: Iceland [${is.methods}] ${is.total} / Germany [${de.methods}] ${de.total}`);
  { const co2 = (await b.follow(SHOP + '/checkout/')).html;
    const body = new URLSearchParams({ billing_first_name: 'Router', billing_last_name: 'Rehearsal', billing_country: 'IS', billing_address_1: 'Laugavegur 1', billing_city: 'Reykjavík', billing_postcode: '101', billing_email: 'router@example.com', billing_phone: '5555555', ship_to_different_address: '0', payment_method: 'paypal',
      'shipping_method[0]': form(co2, 'shipping_method[0]'), 'woocommerce-process-checkout-nonce': form(co2, 'woocommerce-process-checkout-nonce'), _wp_http_referer: '/checkout/' });
    if (/name="terms"/.test(co2)) body.set('terms', 'on');
    const r = await b.go(SHOP + '/?wc-ajax=checkout', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
    const out = await r.json().catch(() => ({}));
    const to = new URL(out.redirect || 'about:blank');
    orderId = +(to.searchParams.get('invoice') || '').replace(/\D/g, '') || +((decodeURIComponent(out.redirect || '').match(/order_id%22%3A(\d+)|"order_id":(\d+)/) || []).slice(1).find(Boolean) || 0);
    const ret = to.searchParams.get('return') || '', notify = to.searchParams.get('notify_url') || '';
    check(out.result === 'success' && /paypal\.com$/.test(to.hostname), `the order goes to PayPal (${out.result}, ${to.hostname})`);
    check(ret.startsWith(SHOP + '/checkout/order-received/'), `PayPal's return address is this host (${ret.slice(0, 70)})`);
    // WooCommerce 3.5 with pretty permalinks: /wc-api/WC_Gateway_Paypal/ (otherwise /?wc-api=…); both are hers
    check(notify === SHOP + '/wc-api/WC_Gateway_Paypal/' || notify === SHOP + '/?wc-api=WC_Gateway_Paypal', `PayPal's IPN address is this host (${notify})`);
    if (!orderId) orderId = +((ret.match(/order-received\/(\d+)/) || [])[1] || 0);
    if (ret) { const back = await b.follow(ret); check(back.res.status === 200 && back.route.every(x => (x || '').startsWith('wordpress')) && new RegExp(`\\b${orderId}\\b`).test(back.html), `back from PayPal: her order-received page answers through the router (order ${orderId})`); }
    const ipn = await req(notify || SHOP + '/wc-api/WC_Gateway_Paypal/'); const t = await ipn.text();
    // WooCommerce's PayPal handler answers a request without PayPal's data with a 500 and these words
    check(route(ipn).startsWith('wordpress') && t.includes('PayPal IPN Request Failure'), `the IPN address reaches WooCommerce's PayPal handler (${ipn.status}, "PayPal IPN Request Failure")`);
  }

  head('wp-admin and wp-json through the router');
  { const a = browser();
    await a.go(SHOP + '/wp-login.php');
    const r = await a.go(SHOP + '/wp-login.php', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ log: 'admin', pwd: 'password', testcookie: '1', redirect_to: SHOP + '/wp-admin/', 'wp-submit': 'Log In' }) });
    const loc = r.headers.get('location') || '';
    check(r.status === 302 && loc.startsWith(SHOP + '/wp-admin') && [...a.jar.keys()].some(k => k.startsWith('wordpress_logged_in_')), `wp-admin sign-in works on this host (${r.status} → ${loc})`);
    const d = await a.follow(SHOP + '/wp-admin/');
    check(d.res.status === 200 && /Dashboard/.test(d.html), `the dashboard opens through the router (${d.res.status})`);
    const s = await a.go(SHOP + '/shop.html'); check(route(s) === 'storefront', 'signed in, the storefront is still the storefront');
    const j = await a.go(SHOP + '/wp-json/wp/v2/types/product'); check(route(j).startsWith('wordpress') && j.status < 500, `wp-json answers (${j.status})`); }
} finally {
  if (orderId) { await glue('order_set', { id: orderId, body: { status: 'cancelled' } }); await glue('order_delete', { id: orderId }); }
  const left = await glue('orders').catch(() => []);
  check(Array.isArray(left) && left.filter(id => !KEEP.has(id)).length === 0, `the rehearsal leaves no orders behind (${Array.isArray(left) ? left.filter(id => !KEEP.has(id)).length : '?'}${KEEP.size ? `, ${KEEP.size} already there kept` : ''})`);
  if (stockBefore !== null) { const st = await glue('product', { id: one.id }).catch(() => ({})); check(st.stock === stockBefore, `stock back as it was (${st.stock} = ${stockBefore})`); }
  await worker.stop();
}
console.log(fails ? `\n${fails} FAILED (${arg})` : `\nALL PASS (${arg})`);
process.exitCode = fails ? 1 : 0;
