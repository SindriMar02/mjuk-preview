/* A day of running the shop, end to end: what Anna does in WordPress, then the refresh the site
   runs (.github/workflows/stock.yml: pull → product pages → SEO check), then what a shopper sees.

     node --no-warnings tools/e2e-daily.mjs [replica|upgraded]     her stack :9420, or after the upgrade :9430

   Her actions are done the way she does them: the admin screens in a real browser where the screen
   is the risk (full editor, Quick Edit, Bulk Edit, Add New, Duplicate, Shop designs), and wc/v3
   where it is data. The refresh runs in a throwaway copy of this site, in the scheduled run's own
   mode (no customs catalogue), so the real pages are never touched. Round two undoes the day and
   runs the refresh again. Everything the run changed on the stack is put back in `finally`, and the
   upgraded copy (kept on disk) is left as it was found. A run that is killed leaves a journal; the
   next run restores from it first. The suite owns the stack while it runs: do not edit that stack's
   products in the meantime (a restore puts back the values from before the run).

   Pass = every step below, the SEO check with 0 problems, no layout faults at 320/390/1440, no
   console errors, and nothing she published missing without a reason in reports/shop-health.md. */
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { detect } from './layout-detect.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const WS = path.resolve(ROOT, '../..');
const TARGET = process.argv[2] === 'upgraded' ? 'upgraded' : 'replica';
const WOO = { replica: 'http://127.0.0.1:9420', upgraded: 'http://127.0.0.1:9430' }[TARGET];
const PORT = TARGET === 'replica' ? 5898 : 5899, STORE = `http://127.0.0.1:${PORT}`;
const TOKEN = fs.readFileSync(path.join(WS, '04-platform/mjuk-woo-sandbox/local/test.env'), 'utf8').match(/TEST_TOKEN=(\S+)/)[1];
const H = { 'X-SNDR-Test': TOKEN, Cookie: 'playground_auto_login_already_happened=1', 'Content-Type': 'application/json', Accept: 'application/json' };
const RUN = Date.now().toString(36).slice(-5);
const sleep = ms => new Promise(r => setTimeout(r, ms));

// a plain request that survives a connection the server has just closed
async function hit(url, init = {}) { for (let i = 0; ; i++) { try { return await fetch(url, { redirect: 'manual', ...init }); } catch (e) { if (i >= 3) throw e; await sleep(1500); } } }
let fails = 0;
const check = (ok, what) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`); if (!ok) fails++; return ok; };
async function api(p, init = {}) {
  for (let i = 0; ; i++) {
    const r = await hit(WOO + '/wp-json' + p, { ...init, headers: H }).catch(e => ({ ok: false, status: 0, e }));
    if ((r.status === 0 || r.status === 502) && i < 3) { await sleep(1500); continue; } // Playground's instance cap under a burst
    const body = r.json ? await r.json().catch(() => null) : null;
    if (!r.ok) throw new Error(`${init.method || 'GET'} ${p} → ${r.status} ${JSON.stringify(body || r.e && r.e.message).slice(0, 240)}`);
    return body;
  }
}
const put = (id, body) => api(`/wc/v3/products/${id}`, { method: 'PUT', body: JSON.stringify(body) });
const create = body => api('/wc/v3/products', { method: 'POST', body: JSON.stringify({ type: 'simple', status: 'publish', ...body }) });
const glue = (op, id, body) => hit(`${WOO}/?sndr_test=${op}&id=${id}`, { method: 'POST', headers: H, body: JSON.stringify(body || {}) }).then(r => r.json());

/* what is touched is written down first, so it can all be put back */
const SNAP_FIELDS = 'id,name,slug,status,catalog_visibility,regular_price,sale_price,manage_stock,stock_quantity,stock_status,categories,images,description,short_description,sndr_shop';
// ...and journalled to disk before each change, so even a killed run (no finally) is put right:
// the next run finds the journal and restores from it first
const JOURNAL = path.join(WS, `04-platform/mjuk-woo-sandbox/local/e2e-daily-journal-${TARGET}.json`);
const snaps = new Map(), made = { products: [], categories: [], designs: [], duplicates: [] };
// written whole to a side file, then renamed over the journal: a kill mid-write leaves the old one
// startMax: the highest product and category ids before this run touched anything. Recovery only
// ever removes what is newer than that, so it can never take one of her own products (she has her
// own "(Copy)" drafts, sitting next to their originals)
let startMax = null;
const journal = () => { fs.writeFileSync(JOURNAL + '.tmp', JSON.stringify({ run: RUN, startMax, snaps: [...snaps], made })); fs.renameSync(JOURNAL + '.tmp', JOURNAL); };
const track = (kind, id) => { if (id) { made[kind].push(id); journal(); } return id; };
const drop = (kind, id) => { const i = made[kind].indexOf(id); if (i >= 0) made[kind].splice(i, 1); journal(); };
async function snap(id) { if (!snaps.has(id)) { snaps.set(id, await api(`/wc/v3/products/${id}?_fields=${SNAP_FIELDS}`)); journal(); } return snaps.get(id); }

/* ── the throwaway copy of the site, in the scheduled run's mode ── */
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'mjuk-daily-'));
const COPY = path.join(TMP, 'ws/03-prototypes/mjuk-experimental');
fs.mkdirSync(path.dirname(COPY), { recursive: true });
fs.symlinkSync(path.join(WS, '04-platform'), path.join(TMP, 'ws/04-platform')); // read only: the pull's token and her category list
execFileSync('rsync', ['-a', '--exclude', '.git', '--exclude', '.stale', '--exclude', 'dist', '--exclude', 'node_modules', '--exclude', '_serve.cjs', ROOT + '/', COPY + '/']);
const readCM = () => { const W = {}; vm.runInContext(fs.readFileSync(path.join(COPY, 'assets/data.js'), 'utf8'), vm.createContext({ window: W })); return W.CM; };
function refresh(label) {
  const run = (args) => { try { return { ok: true, out: execFileSync('node', ['--no-warnings', ...args], { cwd: COPY, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 << 20 }) }; } catch (e) { return { ok: false, out: String(e.stdout || '') + String(e.stderr || e.message) }; } };
  const pull = run(['tools/pull-woo.mjs', '--woo', WOO, '--catalogue', path.join(TMP, 'no-catalogue.json')]);
  check(pull.ok, `${label}: the pull runs (${pull.ok ? pull.out.match(/Products: [^\n]*/)[0] : pull.out.slice(-300)})`);
  const build = pull.ok && run(['tools/build-products.mjs']);
  check(build && build.ok, `${label}: product pages build${build && !build.ok ? ' ' + build.out.slice(-300) : ''}`);
  const seo = build && build.ok && run(['tools/check-seo.mjs']);
  check(seo && seo.ok, `${label}: SEO check, 0 problems (${seo ? (seo.out.match(/\d+ problems[^\n]*/) || [seo.out.slice(-300)])[0] : 'not run'})${seo && !seo.ok ? '\n' + seo.out.split('\n').filter(l => /FAIL/.test(l)).slice(0, 8).join('\n') : ''}`);
  return { CM: readCM(), report: fs.existsSync(path.join(COPY, 'reports/shop-health.md')) ? fs.readFileSync(path.join(COPY, 'reports/shop-health.md'), 'utf8') : '' };
}
const pageOf = (h, lang = 'en') => path.join(COPY, lang === 'en' ? 'product' : 'is/product', h, 'index.html');

/* ── the copy, served, with /bag handing off to this stack ── */
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2' };
const server = http.createServer(async (req, res) => {
  const u = (req.url || '/').split('?')[0];
  if (u === '/bag') {
    const mod = await import(pathToFileURL(path.join(COPY, 'functions/bag.js')).href + '?t=' + Date.now());
    const env = Object.fromEntries(fs.readFileSync(path.join(COPY, '.dev.vars'), 'utf8').split('\n').map(l => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map(m => [m[1], m[2].trim()]));
    env.CHECKOUT_ORIGIN = WOO;
    let r;
    if (req.method === 'GET') r = mod.onRequestGet({ env });
    else { const c = []; for await (const x of req) c.push(x); r = await mod.onRequestPost({ request: new Request('http://localhost/bag', { method: 'POST', headers: { 'content-type': req.headers['content-type'] || '' }, body: Buffer.concat(c) }), env }); }
    res.writeHead(r.status, Object.fromEntries(r.headers)); return res.end(Buffer.from(await r.arrayBuffer()));
  }
  let f = path.join(COPY, path.normalize(decodeURIComponent(u)).replace(/^(\.\.[/\\])+/, ''));
  if (u.endsWith('/')) f = path.join(f, 'index.html');
  if (!f.startsWith(COPY) || !fs.existsSync(f) || !fs.statSync(f).isFile()) { res.writeHead(404); return res.end('Not found'); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(f).pipe(res);
}).listen(PORT, '127.0.0.1');

const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new' });
const admin = await browser.newPage(); await admin.setViewport({ width: 1440, height: 1000 });
const adminErrors = []; admin.on('pageerror', e => adminErrors.push(e.message));
await admin.setExtraHTTPHeaders({ 'X-SNDR-Test': TOKEN }); await admin.goto(WOO + '/?sndr_test=login'); await admin.setExtraHTTPHeaders({});
const go = (url) => admin.goto(url, { waitUntil: 'load', timeout: 120000 });
const noPhp = async where => { const t = await admin.evaluate(() => document.body.innerText.match(/\b(Warning|Notice|Fatal error|Parse error)\b:? [^\n]{0,140}/g) || []); return check(!t.length, `${where}: no PHP warnings ${t.length ? JSON.stringify(t.slice(0, 2)) : ''}`); };
// the admin list shows her own number per page (Screen Options); find the page a product is on,
// newest first, instead of changing her settings
async function openRow(...ids) {
  const all = [];
  for (let page = 1, pages = 1; page <= pages; page++) {
    const r = await hit(`${WOO}/wp-json/wc/v3/products?status=any&per_page=100&page=${page}&orderby=id&order=desc&_fields=id`, { headers: H });
    pages = +r.headers.get('x-wp-totalpages') || 1; all.push(...(await r.json()).map(x => x.id));
  }
  await go(`${WOO}/wp-admin/edit.php?post_type=product&post_status=all&orderby=ID&order=desc`);
  const per = +(await admin.$eval('#edit_product_per_page', i => i.value).catch(() => 20)) || 20;
  const pages = [...new Set(ids.map(id => Math.floor(all.indexOf(id) / per) + 1))];
  if (pages.length !== 1) throw new Error(`rows ${ids.join(', ')} are on different admin pages (${pages.join(', ')})`);
  await go(`${WOO}/wp-admin/edit.php?post_type=product&post_status=all&orderby=ID&order=desc&paged=${pages[0]}`);
  for (const id of ids) if (!(await admin.$(`#post-${id}`))) throw new Error(`row ${id} not on admin page ${pages[0]}`);
}
// a journal left by a run that was killed: put that right before anything else
if (fs.existsSync(JOURNAL)) {
  const j = JSON.parse(fs.readFileSync(JOURNAL, 'utf8'));
  const left = await restoreAll(new Map(j.snaps), { duplicates: [], ...j.made }, j.run, j.startMax);
  check(!left.length, `a killed earlier run was put right from its journal (${j.snaps.length} pieces, ${j.made.products.length} made)${left.length ? ': ' + left.slice(0, 3).join('; ') : ''}`);
  if (left.length) { await browser.close(); server.close(); process.exit(1); }
  fs.unlinkSync(JOURNAL);
}
const catIds = async id => (await api(`/wc/v3/products/${id}?_fields=categories`)).categories.map(c => c.id).sort((a, b) => a - b).join(',');

try {
  /* ── set up: the one-time fill, as on launch day ── */
  const top = async path => { const r = await hit(`${WOO}/wp-json/wc/v3/${path}`, { headers: H }); const j = await r.json(); return Array.isArray(j) && j[0] ? j[0].id : 0; };
  startMax = { product: await top('products?status=any&per_page=1&orderby=id&order=desc&_fields=id'), category: await top('products/categories?per_page=1&orderby=id&order=desc') };
  if (!startMax.product) throw new Error('could not read the highest product id: nothing changed');
  journal();
  // the one-time fill changes the whole catalogue on purpose: done here only on the replica (rebuilt
  // on every start); the upgraded copy must have had it already, or the run stops untouched
  const dry = execFileSync('node', ['tools/shop-fields-fill.mjs', '--woo', WOO, '--dry'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const toWrite = +((dry.match(/to write (\d+)/) || [])[1] || 0);
  if (toWrite && TARGET === 'upgraded') throw new Error(`the upgraded copy has not had the one-time fill (${toWrite} to write): run node tools/shop-fields-fill.mjs --woo ${WOO} first`);
  const fill = toWrite ? execFileSync('node', ['tools/shop-fields-fill.mjs', '--woo', WOO], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }) : dry;
  check(/read back|to write 0/.test(fill), `the one-time fill is in place (${(fill.match(/to write \d+[^\n]*/) || [''])[0]})`);
  const lists = await api('/sndr-shop/v1/lists');
  const base = readCM();
  // the pieces the day touches: listed, in stock, with a design, a photo and some categories
  const pool = base.all.filter(p => p.fam && !p.oos && p.img.length && p.cats.length >= 2 && Number.isInteger(p.q) ? true : p.fam && !p.oos && p.img.length && p.cats.length >= 2);
  const pick = n => pool.splice(Math.floor(pool.length / 2), n);
  const [A, B, C, E, F, G, Hh, I, J, K, L, M, N, O, P, Q, R, S, U, V] = pick(20);
  for (const p of [A, B, C, E, F, G, Hh, I, J, K, L, M, N, O, P, Q, R, S, U, V]) await snap(p.id);
  let D = null; // Bulk Edit's second piece: one on the same admin page as C
  const hatDesign = lists.designs.find(d => d.group === 'hats' && !d.added && d.material);

  /* ── round one: a day of her edits ── */
  // 1. full editor, change nothing, Update: the categories bug (sndr-categories-fix) must stay fixed
  const aCats = await catIds(A.id);
  await go(`${WOO}/wp-admin/post.php?post=${A.id}&action=edit`); await noPhp('product screen');
  await Promise.all([admin.waitForNavigation({ waitUntil: 'load', timeout: 120000 }), admin.click('#publish')]);
  check(await catIds(A.id) === aCats, `1. full editor Update keeps the categories (${aCats})`);
  // 2. Quick Edit: a price change
  await openRow(B.id);
  const bNew = String(Math.round(B.p) + 1);
  await admin.evaluate(id => document.querySelector(`#post-${id} .editinline`).click(), B.id);
  await admin.waitForSelector(`#edit-${B.id}`, { visible: true });
  await admin.evaluate((id, v) => { const r = document.querySelector(`#edit-${id}`); const s = r.querySelector('input[name="_sale_price"]'); if (s) s.value = ''; r.querySelector('input[name="_regular_price"]').value = v; r.querySelector('button.save').click(); }, B.id, bNew);
  await sleep(5000);
  // 3. Bulk Edit: two pieces marked out of stock (two on the same admin page)
  await openRow(C.id);
  const onPage = await admin.$$eval('#the-list tr[id^=post-]', r => r.map(x => +x.id.slice(5)));
  const used = new Set([A, B, C, E, F, G, Hh, I, J, K, L, M, N, O, P, Q, R, S, U, V].map(p => p.id));
  D = base.all.find(p => onPage.includes(p.id) && !used.has(p.id) && p.fam && !p.oos);
  if (!D) throw new Error('no second in-stock piece on the admin page of ' + C.id);
  await snap(D.id);
  await admin.evaluate((a, b) => { for (const id of [a, b]) document.querySelector(`#cb-select-${id}`).checked = true; document.querySelector('#bulk-action-selector-top').value = 'edit'; document.querySelector('#doaction').click(); }, C.id, D.id);
  await admin.waitForSelector('#bulk-edit', { visible: true });
  // what she would do for pieces that count their stock: the count to 0 (Woo derives the status from it)
  await admin.evaluate(() => {
    const b = document.querySelector('#bulk-edit'), set = (sel, v) => { const e = b.querySelector(sel); if (e) { e.value = v; e.dispatchEvent(new Event('change', { bubbles: true })); } };
    set('select[name="_stock_status"]', 'outofstock'); set('select[name="change_stock"]', '1'); set('input[name="_stock"]', '0');
  });
  await Promise.all([admin.waitForNavigation({ waitUntil: 'load', timeout: 120000 }), admin.click('#bulk_edit')]);
  // 4. a rename
  const eName = `${E.t.split('.')[0]} renamed ${RUN}`; await put(E.id, { name: eName });
  // 5. a new piece from Add New, with a design chosen on the screen, no photo
  await go(`${WOO}/wp-admin/post-new.php?post_type=product`); await noPhp('Add New');
  await admin.type('#title', `Day test beanie ${RUN}`);
  await admin.evaluate(() => { document.querySelector('#_regular_price').value = '45'; });
  await admin.select('#sndr_design', hatDesign.key); await admin.select('#sndr_material', 'merino');
  // WordPress rewrites this page's address as it works, so the id comes from the form itself
  const NEW1 = track('products', await admin.$eval('#post_ID', i => +i.value));
  await admin.click('#publish');
  // WordPress takes message= back out of the address, so wait for its notice on the saved page
  await admin.waitForFunction(() => /post\.php$/.test(location.pathname) && document.readyState === 'complete' && !!document.querySelector('#message'), { timeout: 120000 });
  check(NEW1 > 0, `5. Add New published a piece (#${NEW1})`);
  // 6. Duplicate an existing piece, then publish the copy under a new name
  await openRow(F.id);
  const dupHref = await admin.$eval(`#post-${F.id} a[href*="duplicate_product"]`, a => a.href).catch(() => null);
  let DUP = 0;
  // written down before the click: Woo's copy is named "<name> (Copy)" and has no run code yet
  if (dupHref) {
    const newest = (await hit(`${WOO}/wp-json/wc/v3/products?status=any&per_page=1&orderby=id&order=desc&_fields=id`, { headers: H }).then(r => r.json()))[0].id;
    made.duplicates.push({ name: (await snap(F.id)).name + ' (Copy)', after: newest }); journal(); await go(dupHref); DUP = track('products', +new URL(admin.url()).searchParams.get('post')); await put(DUP, { name: `Duplicate day ${RUN}`, status: 'publish', slug: `duplicate-day-${RUN}` }); }
  check(DUP > 0, `6. Duplicate made a copy (#${DUP})`);
  // 7. a design she adds herself, with an Icelandic name, used on a new piece
  await go(`${WOO}/wp-admin/edit.php?post_type=product&page=sndr-shop-designs`); await noPhp('Shop designs');
  const addDesign = async (name, is, group, mat) => {
    await admin.type('#sndr-name', name); if (is) await admin.type('#sndr-is', is); await admin.select('#sndr-group', group); await admin.select('#sndr-material', mat);
    await Promise.all([admin.waitForNavigation({ waitUntil: 'load', timeout: 120000 }), admin.click('.sndr-add button[type=submit]')]);
    // the public lists show a design only once a published piece uses it: read the key off the page
    const key = await admin.$$eval('.sndr-edit', (f, n) => { const x = f.find(e => e.querySelector('input[name=name]').value === n); return x ? x.querySelector('input[name=key]').value : ''; }, name);
    if (key) track('designs', key);
    return key ? { key, name, is: is || '', added: true } : null;
  };
  const D1 = await addDesign(`Day scarves ${RUN}`, `Dagtreflar ${RUN}`, 'scarves', 'merino');
  check(D1 && D1.added, `7. Shop designs added "${D1 && D1.name}" (${D1 && D1.key})`);
  check(!(await api('/sndr-shop/v1/lists')).designs.some(d => d.key === D1.key), '7. an added design stays out of the public list until a published piece uses it');
  const NEW2 = track('products', (await create({ name: `Day scarf ${RUN}`, regular_price: '30', sndr_shop: { design: D1.key, material: '' } })).id);
  check((await api('/sndr-shop/v1/lists')).designs.some(d => d.key === D1.key), '7. and appears there once one does');
  // 8. one added with no Icelandic name
  const D2 = await addDesign(`Day mitts ${RUN}`, '', 'gloves', 'cashmere');
  const NEW3 = track('products', (await create({ name: `Day mitt ${RUN}`, regular_price: '28', sndr_shop: { design: D2.key, material: '' } })).id);
  // 9–10. a sale, and stock run down to 0
  const gReg = +G.p || 50; await put(G.id, { regular_price: String(gReg), sale_price: String(gReg - 5) });
  await put(Hh.id, { manage_stock: true, stock_quantity: 0 });
  // 11. draft, private, hidden, trash
  await put(I.id, { status: 'draft' }); await put(J.id, { status: 'private' }); await put(K.id, { catalog_visibility: 'hidden' });
  await api(`/wc/v3/products/${L.id}`, { method: 'DELETE' });
  // 12. a category made, used, then deleted (N is left with no category of its own)
  const cat = await api('/wc/v3/products/categories', { method: 'POST', body: JSON.stringify({ name: `Day cat ${RUN}` }) }); track('categories', cat.id);
  const mSnap = await snap(M.id); await put(M.id, { categories: [...mSnap.categories.map(c => ({ id: c.id })), { id: cat.id }] });
  await put(N.id, { categories: [{ id: cat.id }] });
  await api(`/wc/v3/products/categories/${cat.id}?force=true`, { method: 'DELETE' }); drop('categories', cat.id);
  // 13. every photo taken off a piece
  await put(O.id, { images: [] });
  // 14. a variable product, by habit
  const VAR = track('products', (await create({ name: `Day variable ${RUN}`, type: 'variable', attributes: [{ name: 'Size', options: ['S', 'M'], variation: true, visible: true }] })).id);
  // 15. odd text: quotes, Icelandic, emoji, markup, a very long name, and no description at all
  const oddName = `“Snjó” húfa – Þórsmörk & Ísafjörður 😀 <b>bold</b> ${'a very long name '.repeat(7).trim()} ${RUN}`;
  await put(P.id, { name: oddName, description: '', short_description: '' });
  // 16. two pieces with the same name
  const NEW4 = track('products', (await create({ name: `Day test beanie ${RUN}`, regular_price: '45', sndr_shop: { design: hatDesign.key, material: '' } })).id);
  // 17. a changed address (slug)
  const qOld = Q.h; await put(Q.id, { slug: `${qOld}-moved-${RUN}` });
  // 18. a price with cents
  await put(R.id, { regular_price: '12.5', sale_price: '' });
  // 19–21. nothing chosen and no rule that fits; no name; no price
  const NEW5 = track('products', (await create({ name: `Mystery thing ${RUN}`, regular_price: '19' })).id);
  // (Woo's API names a nameless product "Product", and WordPress will not publish one with neither
  // title nor text; the real case is a description written and the title forgotten)
  await go(`${WOO}/wp-admin/post-new.php?post_type=product`);
  await admin.evaluate(() => {
    document.querySelector('#_regular_price').value = '19';
    const text = 'Soft and warm, knitted for winter.';
    document.querySelector('#content').value = text;
    if (window.tinymce && tinymce.get('content')) tinymce.get('content').setContent(text);
  });
  const NEW6 = track('products', await admin.$eval('#post_ID', i => +i.value));
  await admin.click('#publish');
  await admin.waitForFunction(() => /post\.php$/.test(location.pathname) && document.readyState === 'complete' && !!document.querySelector('#message'), { timeout: 120000 });
  const NEW7 = track('products', (await create({ name: `No price ${RUN}`, regular_price: '' })).id);
  // 22. an emoji typed into a slug (WordPress keeps it, percent-encoded); 23. her own text saying "3 available"
  await put(U.id, { slug: `hufa-${RUN}-😀` });
  await put(V.id, { short_description: 'Comes in 3 available colours, 2 left in the workshop.' });

  /* ── the refresh, and what the shop shows ── */
  const one = refresh('round one');
  const CM = one.CM, by = id => CM.all.find(p => p.id === id), rep = one.report;
  const hasPage = p => p && fs.existsSync(pageOf(p.h)) && fs.existsSync(pageOf(p.h, 'is'));
  check(by(A.id) && by(A.id).fam === A.fam, '1. the piece saved in the full editor is still listed under its design');
  check(by(B.id) && by(B.id).p === +bNew && by(B.id).fam === B.fam, `2. Quick Edit price on the shop ($${by(B.id) && by(B.id).p}), design unchanged`);
  check(by(C.id) && by(C.id).oos && by(D.id) && by(D.id).oos, '3. Bulk Edit: both shown sold out, still listed');
  check(by(E.id) && by(E.id).t.includes(`renamed ${RUN}`) && by(E.id).fam === E.fam, `4. renamed piece keeps its design (${by(E.id) && by(E.id).fam})`);
  const n1 = by(NEW1);
  check(n1 && n1.fam === hatDesign.key && n1.mat === 'merino' && n1.tyk === 'hats' && hasPage(n1), `5. the new piece is listed with its design and material, both language pages built`);
  check(/No photo[\s\S]*Day test beanie/.test(rep), '5. and the report says it has no photo');
  check(by(DUP) && by(DUP).fam === F.fam, `6. the duplicate carries its original's design (${by(DUP) && by(DUP).fam})`);
  const f1 = CM.families.find(f => f.key === D1.key);
  check(by(NEW2) && by(NEW2).fam === D1.key && f1 && f1.is === `Dagtreflar ${RUN}` && f1.count === 1 && by(NEW2).mat === 'merino', `7. her added design is a shop design with its Icelandic name, and its material (${JSON.stringify(f1 && { is: f1.is, count: f1.count })})`);
  const f2 = CM.families.find(f => f.key === D2.key);
  check(f2 && f2.is === f2.name && /without an Icelandic name[\s\S]*Day mitts/.test(rep), '8. without an Icelandic name: English shown, and the report says so');
  check(by(G.id) && by(G.id).cp === gReg && by(G.id).p === gReg - 5, `9. sale: $${by(G.id) && by(G.id).p}, was $${by(G.id) && by(G.id).cp}`);
  check(by(Hh.id) && by(Hh.id).oos, '10. stock at 0: shown sold out');
  check(![I, J, K, L].some(p => by(p.id)) && ![I, J, K, L].some(p => fs.existsSync(pageOf(p.h))), '11. draft, private, hidden and trashed: off the shop, their pages gone');
  check(rep.includes(`#${K.id}: hidden from her catalogue`), '11. the hidden one is in the report (by id)');
  check(by(M.id) && by(M.id).fam === M.fam && by(N.id) && by(N.id).fam === N.fam, '12. deleting a category moves nothing: both keep their design');
  check(by(O.id) && !by(O.id).img.length && hasPage(by(O.id)), '13. no photos: still listed, pages built');
  check(!by(VAR) && rep.includes(`#${VAR}: a variable product`), '14. the variable product is off the shop, with the reason');
  check(by(P.id) && by(P.id).t.includes('Þórsmörk') && hasPage(by(P.id)), '15. odd text: listed, pages built');
  const same = CM.all.filter(p => p.t === `Day test beanie ${RUN}`);
  check(same.length === 2 && same[0].h !== same[1].h && same.every(hasPage), `16. two with the same name: both listed, two addresses (${same.map(p => p.h).join(', ')})`);
  const moved = await hit(`${WOO}/product/${qOld}/`, { headers: { Cookie: H.Cookie } });
  check(by(Q.id) && by(Q.id).h === `${qOld}-moved-${RUN}` && hasPage(by(Q.id)) && [301, 302].includes(moved.status) && (moved.headers.get('location') || '').includes(`${qOld}-moved-${RUN}`),
    `17. new address listed; the old one ${moved.status}s to it on WordPress (what the router forwards)`);
  check(by(R.id) && by(R.id).p === 12.5 && fs.readFileSync(pageOf(by(R.id).h), 'utf8').includes('$12.50'), '18. $12.50 shown with its cents');
  check(by(NEW5) && !by(NEW5).fam && /no design chosen[\s\S]*Mystery thing/.test(rep), '19. nothing chosen, no rule: listed under Everything, and in the report');
  check(!by(NEW6) && rep.includes(`#${NEW6}: it has no name`), '20. no name: off the shop, with the reason');
  check(!by(NEW7) && rep.includes(`#${NEW7}: it has no price`), '21. no price: off the shop, with the reason');
  check(![`No price ${RUN}`, `Day variable ${RUN}`, K.t].some(n => rep.includes(n)), 'the report (public with the site) never names a piece that is not on the site');
  check(!by(U.id) && rep.includes(`#${U.id}: its web address (slug) has characters`), `22. an emoji in the slug: off the shop with the reason, the build goes on (${(await api(`/wc/v3/products/${U.id}?_fields=slug`)).slug})`);
  check(by(V.id) && hasPage(by(V.id)), '23. her text says "3 available colours": listed, pages built, and the SEO check (above) still passes');
  const listedIds = new Set(CM.all.map(p => p.id));
  const published = [];
  for (let page = 1, pages = 1; page <= pages; page++) {
    const r = await hit(`${WOO}/wp-json/wc/v3/products?status=publish&per_page=100&page=${page}&_fields=id`, { headers: H });
    pages = +r.headers.get('x-wp-totalpages') || 1; published.push(...(await r.json()).map(x => x.id));
  }
  const silent = published.filter(id => !listedIds.has(id) && !rep.includes(`#${id}:`));
  check(!silent.length, `nothing published is missing without a reason (${published.length} published, ${CM.all.length} listed${silent.length ? '; silent: ' + silent.slice(0, 5).join(', ') : ''})`);

  /* ── what a shopper sees, in a browser ── */
  const shop = await browser.createBrowserContext(), sp = await shop.newPage();
  const shopErrors = []; sp.on('pageerror', e => shopErrors.push(e.message)); sp.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) shopErrors.push(m.text()); });
  await sp.setCookie({ name: 'playground_auto_login_already_happened', value: '1', domain: '127.0.0.1', path: '/' });
  await sp.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  const faults = [];
  for (const w of [320, 390, 1440]) {
    await sp.setViewport({ width: w, height: 900 });
    for (const u of [`shop.html`, `is/shop.html`, `shop.html?family=${D1.key}`, `is/shop.html?family=${D1.key}`, `product/${n1.h}/`, `product/${by(P.id).h}/`, `is/product/${by(P.id).h}/`, `product/${by(O.id).h}/`, `product/${by(R.id).h}/`]) {
      await sp.goto(`${STORE}/${u}`, { waitUntil: 'load' }); await sleep(250);
      const r = await sp.evaluate(detect, null);
      if (r.issues.length || r.scrollW > w + 1) faults.push(`${w} ${u}: ${r.issues.slice(0, 3).map(i => JSON.stringify(i).slice(0, 220)).join('; ') || 'sideways scroll ' + r.scrollW}`);
    }
  }
  check(!faults.length, `layout: 9 pages × 320/390/1440 clean${faults.length ? '\n  ' + faults.slice(0, 8).join('\n  ') : ''}`);
  // the bag drawer at 320 with the very long name in it
  await sp.setViewport({ width: 320, height: 800 });
  await sp.goto(`${STORE}/product/${by(P.id).h}/`, { waitUntil: 'load' });
  await sp.evaluate(h => { window.CMBag.add(h, ''); window.CMBag.open(true); }, by(P.id).h); await sleep(500);
  const bagR = await sp.evaluate(detect, '#bag');
  check(!bagR.issues.length && bagR.scrollW <= 321, `the bag drawer at 320 with a very long name: clean${bagR.issues.length ? ' ' + JSON.stringify(bagR.issues.slice(0, 2)).slice(0, 200) : ''}`);
  await sp.evaluate(() => { localStorage.removeItem('mjuk_bag'); });
  await sp.setViewport({ width: 1440, height: 900 });
  await sp.goto(`${STORE}/shop.html?family=${D1.key}&all=1`, { waitUntil: 'load' }); await sleep(300);
  const famView = await sp.evaluate(() => ({ h: document.querySelector('#shopTitle')?.textContent.trim(), cards: [...document.querySelectorAll('#pgrid .prod')].map(c => c.textContent) }));
  check(famView.h && famView.h.includes(`Day scarves ${RUN}`) && famView.cards.some(t => t.includes(`Day scarf ${RUN}`)), `her added design as a shop filter: heading "${famView.h}", its piece shown`);
  await sp.goto(`${STORE}/is/shop.html?family=${D1.key}&all=1`, { waitUntil: 'load' }); await sleep(300);
  const famIs = await sp.evaluate(() => document.querySelector('#shopTitle')?.textContent.trim());
  check(famIs && famIs.includes(`Dagtreflar ${RUN}`), `and on the Icelandic shop in Icelandic ("${famIs}")`);
  await sp.goto(`${STORE}/shop.html?all=1`, { waitUntil: 'load' }); await sleep(300);
  const everything = await sp.evaluate(() => document.querySelector('#shopCount')?.textContent || '');
  check(everything.includes(String(CM.all.length)), `Everything counts every listed piece (${everything.trim()})`);
  // the new piece goes in the bag and reaches her checkout
  await sp.goto(`${STORE}/product/${n1.h}/`, { waitUntil: 'load' });
  await sp.evaluate(h => window.CMBag.add(h, ''), n1.h); await sleep(300);
  await Promise.all([sp.waitForNavigation({ waitUntil: 'load', timeout: 120000 }), sp.click('#bagGo')]);
  const onCheckout = await sp.$eval('.woocommerce-checkout-review-order-table', t => t.textContent).catch(() => '');
  check(onCheckout.includes(`Day test beanie ${RUN}`), `the new piece goes from the bag to her checkout (${sp.url().replace(WOO, '')})`);
  check(!shopErrors.length, `no console errors on the shop ${shopErrors.slice(0, 2).join(' | ')}`);
  await shop.close();

  /* ── junk in her data, and her lists out of reach: the refresh still runs and says so ── */
  await glue('shop_meta', S.id, { key: '_sndr_design', value: ['not', 'text'] });
  const sApi = await hit(`${WOO}/wp-json/wc/v3/products/${S.id}?_fields=id,sndr_shop`, { headers: H });
  const sText = await sApi.text(); let sJson = null; try { sJson = JSON.parse(sText); } catch (e) { /* notice in the body */ }
  check(sJson && sJson.sndr_shop && sJson.sndr_shop.design === '', `an array stored as her design reads as not chosen, clean JSON (${sText.slice(0, 80)})`);
  const all = [];
  for (let page = 1, pages = 1; page <= pages; page++) {
    const r = await hit(`${WOO}/wp-json/wc/v3/products?status=any&per_page=100&page=${page}&orderby=id&order=asc&_fields=id,name,slug,type,status,catalog_visibility,description,short_description,price,regular_price,sale_price,manage_stock,stock_quantity,stock_status,categories,images,menu_order,sndr_shop`, { headers: H });
    pages = +r.headers.get('x-wp-totalpages') || 1; all.push(...await r.json());
  }
  const junk = { [A.id]: { design: 42, material: '' }, [C.id]: { design: { a: 1 } }, [E.id]: 'junk', [G.id]: { design: 'ghost-design-x', material: '' }, [M.id]: { design: M.fam, material: ['m'] } };
  for (const p of all) if (p.id in junk) p.sndr_shop = junk[p.id];
  fs.writeFileSync(path.join(TMP, 'junk.json'), JSON.stringify(all));
  let off; try { off = { ok: true, out: execFileSync('node', ['--no-warnings', 'tools/pull-woo.mjs', '--file', path.join(TMP, 'junk.json'), '--catalogue', path.join(TMP, 'none.json')], { cwd: COPY, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) }; } catch (e) { off = { ok: false, out: String(e.stdout || '') + String(e.stderr || '') }; }
  const offCM = off.ok ? readCM() : null, offRep = off.ok ? fs.readFileSync(path.join(COPY, 'reports/shop-health.md'), 'utf8') : '';
  check(off.ok, `junk values and no lists: the pull still runs${off.ok ? '' : ' ' + off.out.slice(-300)}`);
  check(off.ok && offCM.all.find(p => p.id === NEW2)?.fam === D1.key && offCM.families.some(f => f.key === D1.key), 'lists out of reach: her added design is kept from the last good read, its piece does not move');
  check(off.ok && [A, C, E, G, M].every(p => offCM.all.some(x => x.id === p.id)) && /not text/.test(offRep) && offRep.includes(`${G.id} `) && /a design that does not exist/.test(offRep)
    && !/ghost-design-x|"m"|\["m"\]/.test(offRep) && /lists could not be read/.test(offRep),
    'junk: every piece still listed, each bad value named in the report by its piece (never the stored value), the unreadable lists too');

  /* ── round two: the day undone ── */
  await glue('product_set', L.id, { status: 'publish' });                     // out of the trash
  await put(I.id, { status: 'publish' }); await put(K.id, { catalog_visibility: 'visible' });
  await api(`/wc/v3/products/${NEW1}?force=true`, { method: 'DELETE' }); drop('products', NEW1);
  // her design cannot be deleted while a piece uses it (the page offers no Delete); then it can
  await go(`${WOO}/wp-admin/edit.php?post_type=product&page=sndr-shop-designs`);
  const offered = async key => admin.$$eval('.sndr-del input[name=key]', (i, k) => i.some(x => x.value === k), key);
  check(!(await offered(D1.key)), 'round two: a design in use offers no Delete');
  await put(NEW2, { sndr_shop: { design: 'other-scarves', material: '' } });
  await admin.reload({ waitUntil: 'load' });
  const di = await admin.$$eval('.sndr-del', (f, k) => f.findIndex(x => x.querySelector('input[name=key]').value === k), D1.key);
  if (di >= 0) { await Promise.all([admin.waitForNavigation({ waitUntil: 'load' }), admin.evaluate(n => document.querySelectorAll('.sndr-del')[n].querySelector('button').click(), di)]); drop('designs', D1.key); }
  check(di >= 0 && !(await admin.$$eval('.sndr-edit input[name=key]', (i, k) => i.some(x => x.value === k), D1.key)), 'once unused, it deletes');
  const two = refresh('round two');
  const by2 = id => two.CM.all.find(p => p.id === id);
  check([L, I, K].every(p => by2(p.id) && by2(p.id).fam === p.fam && fs.existsSync(pageOf(by2(p.id).h))), 'round two: restored, published and made visible again: back on the shop with their design and pages');
  check(!by2(NEW1) && !fs.existsSync(pageOf(n1.h)), 'deleted for good: gone, page retired');
  check(!two.CM.families.some(f => f.key === D1.key) && by2(NEW2) && by2(NEW2).tyk === 'scarves' && !by2(NEW2).fam, 'her deleted design is gone from the shop; its piece sits under Scarves');
  check(!adminErrors.length, `no JavaScript errors in the admin ${adminErrors.slice(0, 2).join(' | ')}`);
} catch (e) {
  check(false, 'the run stopped: ' + (e && e.stack || e).toString().split('\n').slice(0, 3).join(' '));
} finally {
  const undo = await restoreAll(snaps, made, RUN, startMax);
  check(!undo.length, `the stack is left as it was found (${snaps.size} pieces checked; ${made.products.length} made and removed)${undo.length ? '\n  ' + undo.slice(0, 6).join('\n  ') : ''}`);
  if (!undo.length && fs.existsSync(JOURNAL)) fs.unlinkSync(JOURNAL);
  await browser.close(); server.close();
  if (process.env.KEEP) console.log('kept the built copy at ' + COPY); else fs.rmSync(TMP, { recursive: true, force: true });
}
console.log(fails ? `\n${fails} FAILED (${TARGET})` : `\nALL PASS (${TARGET})`);
process.exit(fails ? 1 : 0);

/* everything back as it was: made things removed, touched products restored and compared */
async function restoreAll(snaps, made, run, startMax) {
  const undo = [];
  const newer = (id, kind) => startMax && id > startMax[kind];
  // anything this run made carries its code in the name, journalled or not (a kill can land between
  // making a product and writing it down); and any product still on one of this run's own designs
  const stray = new Set();
  if (run) {
    for (let page = 1, pages = 1; page <= pages; page++) {
      const r = await hit(`${WOO}/wp-json/wc/v3/products?status=any&search=${encodeURIComponent(run)}&per_page=100&page=${page}&_fields=id,name`, { headers: H });
      pages = +r.headers.get('x-wp-totalpages') || 1;
      for (const p of await r.json()) if (p.name.endsWith(' ' + run) && newer(p.id, 'product') && !snaps.has(p.id)) stray.add(p.id);
    }
  }
  // Woo's copy from an interrupted Duplicate, still under its "(Copy)" name: removed only when it is
  // the one copy made after the click; anything ambiguous is left and reported for a person
  for (const d of made.duplicates || []) {
    if (!d || typeof d !== 'object') continue;
    const r = await hit(`${WOO}/wp-json/wc/v3/products?status=any&search=${encodeURIComponent(d.name.replace(/ \(Copy\)$/, ''))}&per_page=100&_fields=id,name`, { headers: H });
    const hits = (await r.json()).filter(p => p.name === d.name && p.id > d.after && !snaps.has(p.id) && !made.products.includes(p.id));
    if (hits.length === 1) stray.add(hits[0].id); else if (hits.length > 1) undo.push(`more than one "${d.name}" made after the Duplicate click (${hits.map(p => p.id).join(', ')}): left for a person to check`);
  }
  // categories and designs this run made carry its code in their names too
  if (run) {
    const cats = await (await hit(`${WOO}/wp-json/wc/v3/products/categories?search=${encodeURIComponent(run)}&per_page=100`, { headers: H })).json();
    for (const c of Array.isArray(cats) ? cats : []) if (c.name.endsWith(' ' + run) && newer(c.id, 'category') && !made.categories.includes(c.id)) made.categories.push(c.id);
    // every design she added is on this page (the public lists hide unused ones)
    await go(`${WOO}/wp-admin/edit.php?post_type=product&page=sndr-shop-designs`);
    const mine = await admin.$$eval('.sndr-edit', (f, r) => f.map(e => [e.querySelector('input[name=name]').value, e.querySelector('input[name=key]').value]).filter(([n]) => n.endsWith(' ' + r)).map(([, k]) => k), run);
    for (const k of mine) if (!made.designs.includes(k)) made.designs.push(k);
  }
  for (const id of stray) if (!made.products.includes(id)) made.products.push(id);
  // already gone (a 404) is as good as removed: an earlier recovery may have got there first
  const gone = what => e => { if (!/→ 404 /.test(e.message)) undo.push(`${what}: ${e.message}`); };
  for (const id of made.products) await api(`/wc/v3/products/${id}?force=true`, { method: 'DELETE' }).catch(gone(`product ${id}`));
  for (const id of made.categories) await api(`/wc/v3/products/categories/${id}?force=true`, { method: 'DELETE' }).catch(gone(`category ${id}`));
  for (const [id, s] of snaps) {
    try {
      if ((await glue('product', id)).status === 'trash') await glue('product_set', id, { status: s.status });
      const { id: _, ...back } = s;
      back.categories = s.categories.map(c => ({ id: c.id }));
      // photos: put back only when the run changed them, and by their media id, so nothing is ever
      // downloaded again into the media library; a photo without an id cannot be put back by src safely
      const nowImgs = ((await api(`/wc/v3/products/${id}?_fields=images`)).images || []).map(i => i.id).join();
      if (nowImgs === s.images.map(i => i.id).join()) delete back.images;
      else if (s.images.every(i => i.id > 0)) back.images = s.images.map(i => ({ id: i.id }));
      else { delete back.images; undo.push(`product ${id}: its photos have no media id and were not put back`); }
      if (!s.manage_stock) delete back.stock_quantity;
      await put(id, back);
    } catch (e) { undo.push(`product ${id}: ${e.message}`); }
  }
  if (made.designs.length) {
    try {
      await go(`${WOO}/wp-admin/edit.php?post_type=product&page=sndr-shop-designs`);
      const still = new Set(await admin.$$eval('.sndr-edit input[name=key]', i => i.map(x => x.value)));
      for (const key of made.designs) {
        if (!still.has(key)) continue; // already gone
        const i = await admin.$$eval('.sndr-del', (f, k) => f.findIndex(x => x.querySelector('input[name=key]').value === k), key);
        if (i >= 0) await Promise.all([admin.waitForNavigation({ waitUntil: 'load' }), admin.evaluate(n => document.querySelectorAll('.sndr-del')[n].querySelector('button').click(), i)]);
        else undo.push(`design ${key} still in use or missing`);
      }
    } catch (e) { undo.push('designs: ' + e.message); }
  }
  let same = 0;
  for (const [id, s] of snaps) { const now = await api(`/wc/v3/products/${id}?_fields=name,slug,status,regular_price,sale_price,stock_status,catalog_visibility,categories,images,sndr_shop`).catch(() => null);
    if (now && now.name === s.name && now.slug === s.slug && now.status === s.status && now.regular_price === s.regular_price && now.sale_price === s.sale_price && now.stock_status === s.stock_status && now.catalog_visibility === s.catalog_visibility
      && now.categories.map(c => c.id).join() === s.categories.map(c => c.id).join() && now.images.map(i => i.id).join() === s.images.map(i => i.id).join() && JSON.stringify(now.sndr_shop) === JSON.stringify(s.sndr_shop)) same++; else undo.push(`product ${id} differs after restore`); }
  return undo;
}
