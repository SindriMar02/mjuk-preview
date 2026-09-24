/* The bag in a real browser (headless Chrome): what a shopper does before WooCommerce sees anything.

     node tools/e2e-bag.mjs [replica|sandbox]     storefront :5896 → replica :9420, or :5895 → sandbox :9410

   Two tabs of the shop at once, a browser that refuses storage, the back button from checkout, a
   double click on "Go to checkout", a preview with no checkout behind it, the Icelandic pages, a
   piece that sold since it went in the bag, the one-of-one limit, and coming back after paying. */
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const TARGET = process.argv[2] === 'sandbox' ? 'sandbox' : 'replica';
const STORE = TARGET === 'sandbox' ? 'http://localhost:5895' : 'http://localhost:5896';
const WOO = TARGET === 'sandbox' ? 'http://127.0.0.1:9410' : 'http://127.0.0.1:9420';
globalThis.window = {};
new Function('window', fs.readFileSync(path.join(ROOT, 'assets/data.js'), 'utf8'))(globalThis.window);
const CM = globalThis.window.CM;
const one = CM.all.find(p => p.id === 11646), hat = CM.all.find(p => p.id === 12167);
const other = CM.all.find(p => !p.oos && p.q >= 3 && p.tyk !== 'hats' && p.tyk !== 'pompoms');
const gone = CM.all.find(p => p.oos);

let fails = 0;
const check = (ok, what) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`); if (!ok) fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new' });
const fresh = () => browser.createBrowserContext();
const open = async (ctx, url) => { const p = await ctx.newPage(); await p.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await p.setCookie({ name: 'playground_auto_login_already_happened', value: '1', domain: '127.0.0.1', path: '/' });
  await p.goto(url, { waitUntil: 'load' }); return p; };
const bag = p => p.evaluate(() => JSON.parse(localStorage.getItem('mjuk_bag') || '[]').map(l => `${l.h}×${l.q}`).join(', '));
const drawer = p => p.evaluate(() => [...document.querySelectorAll('#bagItems .bag__it .bag__n')].map(n => n.textContent.trim()));
const add = (p, h) => p.evaluate(h => window.CMBag.add(h, ''), h);

try {
  /* two tabs: neither may write back a bag it read before the other changed it */
  { const ctx = await fresh(); const a = await open(ctx, STORE + '/shop.html'), b = await open(ctx, STORE + '/shop.html');
    await add(a, one.h); await sleep(300);
    const seenInB = await drawer(b);
    await add(b, other.h); await sleep(300);
    check((await bag(a)) === `${one.h}×1, ${other.h}×1` && seenInB.includes(one.t), `two tabs share one bag: added in each, both kept (${await bag(a)})`);
    check((await drawer(a)).length === 2, 'the first tab shows what the second added, without a reload');
    await ctx.close(); }

  /* the real button on a product page, and the one-of-one limit */
  { const ctx = await fresh(); const p = await open(ctx, `${STORE}/product.html?p=${encodeURIComponent(one.h)}`);
    await p.click('.sz--solo'); await sleep(400);
    check((await bag(p)) === `${one.h}×1`, `the product page's button puts the piece in the bag (${await bag(p)})`);
    check(await p.$eval('#bagItems [data-q="1"]', b => b.disabled), 'a one-of-one: the + in the drawer is off, she has one');
    await p.evaluate(() => window.CMBag.open(false)); await p.click('.sz--solo'); await sleep(400);
    check((await bag(p)) === `${one.h}×1`, 'pressing add again does not put a second one in');
    await ctx.close(); }

  /* a piece that sold since it went in the bag */
  { const ctx = await fresh(); const p = await open(ctx, STORE + '/shop.html');
    await p.evaluate((g, o) => localStorage.setItem('mjuk_bag', JSON.stringify([
      { k: g.h + '|', h: g.h, t: g.t, s: '', p: g.p, img: g.img[0], q: 1, x: null }, { k: o.h + '|', h: o.h, t: o.t, s: '', p: o.p, img: o.img[0], q: 1, x: null }])), gone, other);
    await p.reload({ waitUntil: 'load' }); await p.evaluate(() => window.CMBag.open(true)); await sleep(300);
    const txt = await p.$eval('#bagItems', e => e.textContent), total = await p.$eval('#bagTotal', e => e.textContent);
    check(/Sold since you added it/.test(txt) && total.includes(String(other.p)), `a piece sold since: marked in the drawer, left out of the total (${total})`);
    await ctx.close(); }

  /* a preview with no checkout behind it (GitHub Pages) */
  { const ctx = await fresh(); const p = await open(ctx, STORE + '/shop.html'); await add(p, other.h);
    await p.setRequestInterception(true);
    p.on('request', r => (r.url() === STORE + '/bag' && r.method() === 'GET') ? r.respond({ status: 404, body: 'Not found' }) : r.continue());
    await p.click('#bagGo'); await sleep(600);
    check(p.url().startsWith(STORE) && /not connected in this preview/.test(await p.$eval('#bagItems', e => e.textContent)) && (await p.$eval('#bagGo', b => b.textContent.trim())) === 'Go to checkout',
      'a static preview says checkout is not connected, and the button comes back');
    await ctx.close(); }

  /* storage refused (strict privacy settings): the bag still works for the visit, and checks out */
  { const ctx = await fresh(); const p = await ctx.newPage();
    await p.evaluateOnNewDocument(() => { Storage.prototype.setItem = () => { throw new Error('denied'); }; });
    await p.setCookie({ name: 'playground_auto_login_already_happened', value: '1', domain: '127.0.0.1', path: '/' });
    await p.goto(STORE + '/shop.html', { waitUntil: 'load' }); await add(p, other.h); await sleep(300);
    check((await drawer(p)).includes(other.t), 'with storage refused, the piece is still in the drawer');
    await Promise.all([p.waitForNavigation({ waitUntil: 'load' }), p.click('#bagGo')]);
    check(p.url().startsWith(WOO) && /\/checkout\/$/.test(new URL(p.url()).pathname), `and still reaches checkout (${p.url()})`);
    await ctx.close(); }

  /* checkout for real: one click, a double click, back, and coming back after paying */
  { const ctx = await fresh(); const p = await open(ctx, STORE + '/shop.html'); await add(p, other.h);
    let posts = 0; p.on('request', r => { if (r.url() === STORE + '/bag' && r.method() === 'POST') posts++; });
    await Promise.all([p.waitForNavigation({ waitUntil: 'load' }), p.evaluate(() => { const b = document.querySelector('#bagGo'); b.click(); b.click(); })]);
    const onCheckout = await p.$eval('.woocommerce-checkout-review-order-table', t => t.textContent).catch(() => '');
    check(posts === 1, `a double click on "Go to checkout" sends the bag once (${posts})`);
    const plain = s => s.replace(/[“”"‘’']/g, ''); // the storefront curls her quotes, Woo prints them straight
    check(plain(onCheckout).includes(plain(other.t)), `the piece is in her checkout (${p.url()})`);
    await p.goBack({ waitUntil: 'load' }); await sleep(500); await p.evaluate(() => window.CMBag.open(true)); await sleep(300);
    const went = await p.$eval('#bagItems', e => e.textContent), btn = await p.$eval('#bagGo', b => ({ t: b.textContent.trim(), d: b.disabled }));
    check(/went to checkout at/.test(went) && btn.t === 'Go to checkout' && !btn.d, 'back from checkout: the bag is kept, asks if she ordered, and the button works again');
    await p.goto(STORE + '/shop.html?ordered=1', { waitUntil: 'load' });
    check((await bag(p)) === '', 'coming back from her order page (?ordered=1) empties the bag');
    await ctx.close(); }

  /* Icelandic: the bag goes out from /is/, and her checkout points back to /is/ */
  { const ctx = await fresh(); const p = await open(ctx, STORE + '/is/shop.html'); await add(p, other.h);
    await Promise.all([p.waitForNavigation({ waitUntil: 'load' }), p.click('#bagGo')]);
    const back = await p.$eval('.nav__back', a => a.href).catch(() => '');
    check(back === `${STORE}/is/shop.html`, `from the Icelandic shop, checkout's way back is the Icelandic shop (${back})`);
    await ctx.close(); }
} finally {
  await browser.close();
}
console.log(fails ? `\n${fails} FAILED (${TARGET})` : `\nALL PASS (${TARGET})`);
process.exit(fails ? 1 : 0);
