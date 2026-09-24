/* Layout sweep: every page of the storefront in both languages, and the checkout pages the
   sandbox serves in the storefront's look, at phone, tablet and desktop widths, with touch and
   with a mouse. Fails on text over text, text escaping its card/button/chip/panel, text cut off
   sideways, text past the screen edge, and sideways page scroll (tools/layout-detect.mjs).
   Also opens the bag drawer and, on touch, the menu; with a mouse it hovers the first cards.

     node tools/e2e-layout.mjs [--quick]

   Needs the storefront preview (:5895) and the sandbox (:9410). Headless Chrome, reduced
   motion so reveals start visible. The iOS Simulator pass is separate: Chrome cannot show
   Safari's collapsing bar or its viewport units. */
import puppeteer from 'puppeteer-core';
import { detect } from './layout-detect.mjs';

const STORE = 'http://localhost:5895', WOO = 'http://127.0.0.1:9410';
const QUICK = process.argv.includes('--quick');
const MODES = QUICK
  ? [{ w: 375, touch: true }, { w: 1280, touch: false }]
  : [{ w: 320, touch: true }, { w: 360, touch: true }, { w: 375, touch: true }, { w: 390, touch: true }, { w: 414, touch: true },
     { w: 768, touch: true }, { w: 375, touch: false }, { w: 600, touch: false }, { w: 1024, touch: false }, { w: 1280, touch: false }, { w: 1440, touch: false }];
const SITE = ['index.html', 'shop.html', 'product.html?p=79-beanie-black-with-matching-raccoon-pompom', 'product.html?p=slouchy-hat-light-grey', 'fibres.html', 'store.html', 'story.html', 'staff.html'];
const PAGES = [...SITE.map(p => `${STORE}/${p}`), ...SITE.map(p => `${STORE}/is/${p}`), `${WOO}/cart/`, `${WOO}/checkout/`, `${WOO}/my-account/`];

const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', protocolTimeout: 90000,
  args: ['--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'] });
const page = await browser.newPage();
await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
page.setDefaultTimeout(60000);
// a guest on the sandbox, not Playground's auto-admin; then a real basket, handed off as a shopper would
await page.setCookie({ name: 'playground_auto_login_already_happened', value: '1', domain: '127.0.0.1', path: '/' });
await page.goto(`${STORE}/shop.html`, { waitUntil: 'load' });
await page.evaluate(() => {
  const hat = CM.all.find(p => p.id === 12167), pom = CM.all.find(p => p.id === 4249), one = CM.all.find(p => p.id === 11646);
  localStorage.setItem('mjuk_bag', JSON.stringify([
    { k: hat.h + '|x', h: hat.h, t: hat.t, s: '', p: hat.p + pom.p, img: hat.img[0], q: 1, x: { k: pom.h, label: '', price: pom.p, pompoms: [{ h: pom.h, name: 'Orange' }] } },
    { k: one.h + '|', h: one.h, t: one.t, s: '', p: one.p, img: one.img[0], q: 1, x: null }]));
});
await page.goto(`${STORE}/shop.html`, { waitUntil: 'load' });
await Promise.all([page.waitForNavigation({ waitUntil: 'load' }), page.evaluate(() => { window.CMBag.open(true); document.querySelector('#bagGo').click(); })]);
if (!page.url().includes('/checkout/')) throw new Error('hand-off did not reach checkout: ' + page.url());

const found = new Map();
const add = (url, mode, list) => {
  for (const it of list) {
    const key = `${url} | ${it.kind} | ${it.what} | ${it.with || it.box || it.by || ''}`;
    if (!found.has(key)) found.set(key, { ...it, url, modes: [] });
    found.get(key).modes.push(`${mode.w}${mode.touch ? 't' : 'm'}`);
  }
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
let views = 0;
for (const mode of MODES) {
  await page.setViewport({ width: mode.w, height: mode.w < 700 ? 800 : 900, isMobile: mode.touch, hasTouch: mode.touch, deviceScaleFactor: 1 });
  for (const url of PAGES) {
    const short = url.replace(STORE, '').replace(WOO, 'woo').replace(/\?p=.*$/, '?p=…');
    await page.goto(url, { waitUntil: 'load', timeout: 60000 });
    await page.evaluate(() => Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 3000))]));
    await sleep(url.startsWith(WOO) ? 900 : 350);
    const r = await page.evaluate(detect, null);
    if (r.scrollW > 1) r.issues.push({ kind: 'offscreen', what: `page scrolls sideways by ${r.scrollW}px` });
    add(short, mode, r.issues); views++;
    if (url.startsWith(STORE) && /\/(is\/)?index\.html$/.test(url)) {
      await page.evaluate(() => window.CMBag && window.CMBag.open(true)); await sleep(700);
      add(short, mode, (await page.evaluate(detect, '.bag__panel')).issues.map(x => ({ ...x, what: 'bag: ' + x.what })));
      await page.evaluate(() => window.CMBag.open(false)); await sleep(400);
      if (mode.touch && await page.$('#burger') && await page.$eval('#burger', b => getComputedStyle(b).display !== 'none')) {
        await page.click('#burger'); await sleep(900);
        add(short, mode, (await page.evaluate(detect, '#menu')).issues.map(x => ({ ...x, what: 'menu: ' + x.what })));
        await page.click('#burger'); await sleep(500);
      }
    }
    if (!mode.touch && url.startsWith(STORE)) {
      const n = await page.$$eval('.prod', c => c.length);
      for (let i = 0; i < Math.min(n, 6); i++) {
        const card = (await page.$$('.prod'))[i];
        await card.evaluate((c, k) => { c.scrollIntoView({ block: 'center' }); c.dataset.sweep = k; }, String(i));
        if (!(await card.boundingBox())) continue; // a card in a closed rail or panel: nothing to hover
        try { await card.hover(); } catch (e) { continue; }
        await sleep(220);
        add(short, mode, (await page.evaluate(detect, `.prod[data-sweep="${i}"]`)).issues.map(x => ({ ...x, what: 'hover: ' + x.what })));
      }
      await page.mouse.move(0, 0);
    }
  }
  console.log(`${mode.w}${mode.touch ? ' touch' : ' mouse'}: ${PAGES.length} pages, ${found.size} issues so far`);
}
await browser.close();
const byKind = {};
for (const f of found.values()) (byKind[f.kind] = byKind[f.kind] || []).push(f);
console.log(`checked ${views} page views`);
for (const [k, list] of Object.entries(byKind)) {
  console.log(`\n${k.toUpperCase()} (${list.length})`);
  for (const f of list) console.log(`  ${f.url}  ${f.what}${f.with ? '  ×  ' + f.with : ''}${f.box ? '  in ' + f.box : ''}${f.by ? '  cut by ' + f.by : ''}${f.px ? '  ' + f.px + 'px' : ''}  [${f.modes.join(' ')}]`);
}
console.log(found.size ? `\n${found.size} ISSUES` : '\nCLEAN');
process.exit(found.size ? 1 : 0);
