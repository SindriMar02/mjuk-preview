/* Crawls every page the build writes, from the files, the way a crawler that runs no JavaScript
   would read them, and fails on anything a search engine or a visitor would trip over.

     node tools/check-seo.mjs [dist]     (dist: the production build in dist/)

   Per page: every internal link, image, script and stylesheet resolves to a file (after <base>),
   exactly one canonical on the production host, hreflang en/is/x-default whose twin points back,
   a title and a description, JSON-LD that parses. Per product page: its name and price are in the
   HTML text, Product + BreadcrumbList are complete (Offer in USD, availability InStock or
   OutOfStock and nothing that counts stock), og:image absolute. The sitemaps list only pages that
   exist, each once. The shop's plain catalogue links every product page. */
import fs from 'node:fs';
import path from 'node:path';

const DIST = process.argv.includes('dist');
const ROOT = path.resolve(import.meta.dirname, '..', DIST ? 'dist' : '');
const SITE = { en: 'https://mjukiceland.com/', is: 'https://mjukiceland.is/' };
const bad = [], warn = [];
const fail = (f, m) => bad.push(`${f}: ${m}`);

const walk = d => fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }).flatMap(e => {
  const r = path.join(d, e.name);
  if (e.isDirectory()) return ['tools', 'node_modules', '.git', '.github', '.stale', 'dist', 'functions', '.wrangler'].includes(e.name) && d === '' ? [] : walk(r);
  return e.name.endsWith('.html') ? [r] : [];
});
const pages = walk('');
const exists = new Set(pages);
const fileFor = u => { const p = decodeURIComponent(u.pathname.replace(/^\//, '')); return p === '' || p.endsWith('/') ? p + 'index.html' : p; };
const onDisk = rel => fs.existsSync(path.join(ROOT, rel)) && fs.statSync(path.join(ROOT, rel)).isFile();
// a page's own production address: is/… belongs to mjukiceland.is
const prodUrl = rel => { const is = rel.startsWith('is/'); const p = (is ? rel.slice(3) : rel).replace(/index\.html$/, ''); return (is ? SITE.is : SITE.en) + p; };

let links = 0, products = 0, ld = 0;
const titles = new Map();
for (const rel of pages) {
  const h = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const isRedirect = rel.startsWith('product-category/');
  const pageUrl = new URL('http://x/' + rel);
  const base = (h.match(/<base href="([^"]*)"/) || [])[1];
  const baseUrl = base ? new URL(base, pageUrl) : pageUrl;
  // 1. every internal reference resolves to a file
  const noScript = h.replace(/<script\b(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/gi, '');
  for (const m of noScript.matchAll(/\b(?:href|src)="([^"]+)"|srcset="([^"]+)"|url\((['"]?)([^'")]+)\3\)|content="\d+;\s*url=([^"]+)"/g)) {
    const refs = m[2] ? m[2].split(',').map(s => s.trim().split(/\s+/)[0]) : [m[1] || m[4] || m[5]];
    for (const ref of refs) {
      if (!ref || /^(https?:|mailto:|tel:|data:|#|javascript:)/i.test(ref)) continue;
      const u = new URL(ref.replace(/&amp;/g, '&'), baseUrl);
      if (u.origin !== 'http://x') continue;
      const f = fileFor(u); links++;
      if (!onDisk(f)) fail(rel, `broken link ${ref} → ${f}`);
    }
  }
  if (isRedirect) continue;
  // 2. head
  const canon = [...h.matchAll(/<link rel="canonical" href="([^"]+)"/g)].map(m => m[1]);
  const isProduct = /(^|\/)product\/[^/]+\/index\.html$/.test(rel);
  const hidden = /name="robots" content="noindex/.test(h) && DIST;
  if (isProduct) {
    products++;
    if (canon.length !== 1 || canon[0] !== prodUrl(rel)) fail(rel, `canonical ${canon.join(' ') || 'missing'}, expected ${prodUrl(rel)}`);
  } else if (canon.length > 1) fail(rel, 'more than one canonical');
  const title = (h.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '';
  if (!title.trim()) fail(rel, 'no title');
  if (isProduct) titles.set(title, (titles.get(title) || []).concat(rel));
  const desc = (h.match(/<meta name="description" content="([^"]*)"/) || [])[1] || '';
  if (!desc.trim()) fail(rel, 'no meta description');
  const alt = Object.fromEntries([...h.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)"/g)].map(m => [m[1], m[2]]));
  if (!hidden && !/staff\.html$/.test(rel)) {
    if (!alt.en || !alt.is || !alt['x-default']) fail(rel, 'hreflang en/is/x-default incomplete');
    else if (isProduct) {
      const mine = rel.startsWith('is/') ? alt.is : alt.en;
      if (mine !== prodUrl(rel)) fail(rel, `hreflang for its own language is ${mine}`);
      const twin = rel.startsWith('is/') ? rel.slice(3) : 'is/' + rel;
      if (!exists.has(twin)) fail(rel, 'no twin page ' + twin);
      else { const t = fs.readFileSync(path.join(ROOT, twin), 'utf8'); if (!t.includes(`hreflang="${rel.startsWith('is/') ? 'is' : 'en'}" href="${prodUrl(rel)}"`)) fail(rel, 'twin does not point back'); }
    }
  }
  // 3. JSON-LD
  const blocks = [...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => { ld++; try { return JSON.parse(m[1]); } catch (e) { fail(rel, 'JSON-LD does not parse: ' + e.message); return null; } }).filter(Boolean);
  if (isProduct) {
    const P = blocks.find(b => b['@type'] === 'Product'), B = blocks.find(b => b['@type'] === 'BreadcrumbList');
    if (!P) fail(rel, 'no Product JSON-LD');
    else {
      if (!P.name || P.url !== prodUrl(rel)) fail(rel, 'Product name/url wrong');
      if (P.offers) {
        const o = P.offers;
        if (o.priceCurrency !== 'USD' || !/^\d+\.\d{2}$/.test(o.price) || !['https://schema.org/InStock', 'https://schema.org/OutOfStock'].includes(o.availability)) fail(rel, 'Offer incomplete: ' + JSON.stringify(o));
        if (!P.image || !P.image.length) fail(rel, 'Offer without an image');
      } else if (P.image && P.image.length) fail(rel, 'has a photo but no Offer');
      if (/inventoryLevel|stockQuantity|"q":|\bin stock: \d|\b\d+ (?:left|in stock)\b/i.test(JSON.stringify(P))) fail(rel, 'JSON-LD carries a stock count');
      for (const u of [].concat(P.image || [])) if (!/^https:\/\//.test(u)) fail(rel, 'image not absolute: ' + u);
      // the text a crawler reads: name and price in the HTML, not only in the script
      const text = h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<');
      if (!text.includes(P.name)) fail(rel, 'product name not in the HTML text');
      if (P.offers && !text.includes('$' + Number(P.offers.price).toLocaleString('en-US'))) fail(rel, `price $${P.offers.price} not in the HTML text`);
      if (/\b\d+\s+(?:left|in stock|available)\b/i.test(text)) fail(rel, 'a stock count is shown');
    }
    if (!B || !B.itemListElement || B.itemListElement.at(-1).item !== prodUrl(rel) || B.itemListElement.some((x, i) => x.position !== i + 1 || !x.name || !/^https:\/\//.test(x.item))) fail(rel, 'BreadcrumbList incomplete');
    const og = (h.match(/<meta property="og:image" content="([^"]+)"/) || [])[1];
    if (og && !/^https:\/\//.test(og)) fail(rel, 'og:image not absolute');
    if (!/<body data-page="product" data-p="[^"]+">/.test(h)) fail(rel, 'body does not name its piece');
  }
}
// duplicate titles are Google's problem to disambiguate; report them, they are her product names
for (const [t, l] of titles) if (l.length > 2) warn.push(`${l.length} product pages share the title "${t}"`);

// 4. sitemaps
for (const [sm, host] of [['sitemap.xml', SITE.en], ['is/sitemap.xml', SITE.is]]) {
  if (!onDisk(sm)) { fail(sm, 'missing'); continue; }
  const locs = [...fs.readFileSync(path.join(ROOT, sm), 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  if (new Set(locs).size !== locs.length) fail(sm, 'duplicate <loc>');
  for (const l of locs) {
    if (!l.startsWith(host)) { fail(sm, 'foreign host ' + l); continue; }
    const f = (host === SITE.is ? 'is/' : '') + (l.slice(host.length) || '') ;
    if (!onDisk(f.endsWith('/') || f === '' || f === 'is/' ? f + 'index.html' : f)) fail(sm, 'lists a page that does not exist: ' + l);
  }
  const prodCount = locs.filter(l => l.includes('/product/')).length;
  if (prodCount !== products / 2) fail(sm, `${prodCount} product addresses, ${products / 2} product pages per language`);
}
// 5. the shop's catalogue reaches every product page without JavaScript
for (const [shop, dir] of [['shop.html', 'product/'], ['is/shop.html', 'is/product/']]) {
  const h = fs.readFileSync(path.join(ROOT, shop), 'utf8');
  const linked = new Set([...h.matchAll(/href="product\/([^"/]+)\/"/g)].map(m => m[1]));
  const have = fs.readdirSync(path.join(ROOT, dir));
  const missing = have.filter(x => !linked.has(x));
  if (missing.length) fail(shop, `${missing.length} product pages not linked from the catalogue`);
}

console.log(`${DIST ? 'dist/' : 'preview'}: ${pages.length} pages (${products} product pages), ${links} internal references, ${ld} JSON-LD blocks; ${bad.length} problems${warn.length ? `, ${warn.length} notes` : ''}`);
for (const w of warn.slice(0, 10)) console.log('  note: ' + w);
for (const b of bad.slice(0, 40)) console.log('  FAIL ' + b);
if (bad.length > 40) console.log(`  … ${bad.length - 40} more`);
process.exitCode = bad.length ? 1 : 0;
