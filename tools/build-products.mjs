/* A real page for every piece in the shop, at her own address, with its text in the HTML.

     node tools/build-pages.mjs && node tools/build-is.mjs && node tools/build-products.mjs

   Her shop has always served a piece at mjukiceland.com/product/<slug>/ (WordPress, confirmed in
   her wc/v3 data: all 782 published products). Those are the addresses Google has indexed, so the
   storefront keeps them: product/<slug>/index.html (English, mjukiceland.com) and
   is/product/<slug>/index.html (Icelandic, mjukiceland.is). Each page is the product.html shell with
   the breadcrumb, gallery, buying column and both rails already written in (pdp.js, the same code
   the browser runs), plus its own title, description, canonical, hreflang, Open Graph and
   Product + BreadcrumbList JSON-LD (price in USD; availability only as InStock or OutOfStock, never
   a count). A <base> makes every relative link resolve from the site root, so the same files work
   at mjukiceland.com/product/<slug>/ and under the GitHub Pages preview's subpath.

   Also written here, because they come from the same catalogue:
   - shop.html / is/shop.html: "Every piece, A to Z", plain links to all pages, grouped the way she
     groups them, so the whole catalogue is reachable without JavaScript;
   - sitemap.xml / is/sitemap.xml with hreflang alternates (production hosts; the preview is
     noindex and its robots.txt disallows everything, tools/build-production.mjs swaps both);
   - tools/category-map.json: her old category addresses (/product-category/…/) to shop filters, for
     the router's 301s, and product-category/…/index.html redirect pages for the static preview only.

   A piece that leaves the shop loses its page: its folder is moved to .stale/ (gitignored), not
   deleted, and the router sends its address to her WordPress. Pieces she has not published (drafts)
   or has hidden from her catalogue get no page; the build reports how many and why. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import http from 'node:http';
import { createRequire } from 'node:module';

const ROOT = path.resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const SITE = { en: 'https://mjukiceland.com/', is: 'https://mjukiceland.is/' };
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const write = (f, s) => { fs.mkdirSync(path.dirname(path.join(ROOT, f)), { recursive: true }); fs.writeFileSync(path.join(ROOT, f), s); };

// the catalogue exactly as the pages load it
const W = {}; const ctx = vm.createContext({ window: W });
for (const f of ['assets/data.js', 'assets/copy.js', 'assets/i18n-is.js']) vm.runInContext(read(f), ctx);
const CM = W.CM, COPY = W.CMCOPY, I18N = W.CMI18N;
// the image and price helpers are app.js's own lines, so a price or a photo size cannot drift
const APP = read('app.js');
const line = name => { const m = APP.match(new RegExp(`const ${name} = (.+);\\n`)); if (!m) throw new Error(`app.js: const ${name} not found`); return new Function(`return ${m[1]}`)(); };
const px = line('px'), usd = line('usd');
const make = require(path.join(ROOT, 'pdp.js'));
const LANG = {
  en: { V: make({ CM, COPY, t: s => s, isIS: false, px, usd }), tpl: read('product.html'), dir: 'product/', locale: 'en_US' },
  is: { V: make({ CM, COPY, t: s => (s && I18N[s]) || s, isIS: true, px, usd }), tpl: read('is/product.html'), dir: 'is/product/', locale: 'is_IS' },
};
const T = (lang, s) => (lang === 'is' && I18N[s]) || s;

const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// JSON inside <script>: nothing in her text can close the tag or break a parser
const ld = o => JSON.stringify(o).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
const cut = (s, n) => s.length <= n ? s : s.slice(0, s.lastIndexOf(' ', n - 1) > n * 0.6 ? s.lastIndexOf(' ', n - 1) : n - 1).replace(/[\s,.;:–—-]+$/, '') + '…';
const must = (s, re, what) => { if (!re.test(s)) throw new Error('product.html template: ' + what + ' not found'); return s; };
const url = (lang, p) => SITE[lang] + 'product/' + p.h + '/';

for (const p of CM.all) if (!/^[a-z0-9_-]+$/i.test(p.h)) throw new Error('slug is not path-safe: ' + p.h);

/* the rails, as plain cards; pages.js replaces them with the full cards */
const mini = (lang, list) => list.map(x => `<article class="prod"><div class="prod__im"><a class="prod__go" href="product/${x.h}/" aria-label="${esc(x.t)}"></a>${x.img && x.img[0] ? `<img class="main" src="${px(x.img[0], 620)}" alt="${esc(x.t)}" loading="lazy"/>` : ''}</div><div class="prod__meta"><div><div class="prod__name"><a href="product/${x.h}/">${esc(x.t)}</a></div></div><span class="prod__price">${x.cp ? `<s>${usd(x.cp)}</s>` : ''}${usd(x.p)}</span></div></article>`).join('');

function page(p, lang) {
  const L = LANG[lang], V = L.V, v = V.view(p);
  const canon = url(lang, p);
  const plain = V.text(v.c.short) || V.text(v.c.long);
  const mat = V.matWords(p);
  const desc = plain ? cut(plain, 158) : [p.t, mat].filter(Boolean).join('. ');
  const img = v.imgs[0] ? px(v.imgs[0], 1200) : '';
  const crumbs = [[T(lang, 'Shop'), SITE[lang] + 'shop.html']];
  if (V.GRP[p.tyk]) crumbs.push([V.typeName(p.tyk), SITE[lang] + 'shop.html?type=' + p.tyk]);
  if (V.FAM[p.fam]) crumbs.push([V.famName(p.fam), SITE[lang] + 'shop.html?family=' + p.fam]);
  crumbs.push([p.t, canon]);
  const product = {
    '@context': 'https://schema.org', '@type': 'Product', '@id': canon + '#product', name: p.t, url: canon,
    ...(v.imgs.length ? { image: v.imgs.map(u => px(u, 1200)) } : {}),
    ...(plain ? { description: cut(plain, 5000) } : {}),
    brand: { '@type': 'Brand', name: 'MJÚK Iceland' },
    ...(mat ? { material: mat } : {}),
    // an Offer is read as a merchant listing, which needs a photo: none without one
    ...(v.imgs.length ? { offers: { '@type': 'Offer', url: canon, price: p.p.toFixed(2), priceCurrency: 'USD', availability: p.oos ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock' } } : {}),
  };
  const bread = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c[0], item: c[1] })) };
  const head = `<link rel="canonical" href="${canon}" />
<link rel="alternate" hreflang="en" href="${url('en', p)}" />
<link rel="alternate" hreflang="is" href="${url('is', p)}" />
<link rel="alternate" hreflang="x-default" href="${url('en', p)}" />
<meta property="og:type" content="product" />
<meta property="og:site_name" content="MJÚK Iceland" />
<meta property="og:locale" content="${L.locale}" />
<meta property="og:title" content="${esc(p.t)}" />
<meta property="og:description" content="${esc(desc)}" />
<meta property="og:url" content="${canon}" />
${img ? `<meta property="og:image" content="${esc(img)}" />\n<meta name="twitter:card" content="summary_large_image" />\n` : ''}<script type="application/ld+json">${ld(product)}</script>
<script type="application/ld+json">${ld(bread)}</script>
`;
  let h = L.tpl;
  h = must(h, /<meta charset="UTF-8" \/>\n/, 'charset').replace('<meta charset="UTF-8" />\n', '<meta charset="UTF-8" />\n<base href="../../" />\n');
  h = must(h, /<title>[\s\S]*?<\/title>/, 'title').replace(/<title>[\s\S]*?<\/title>/, () => `<title>${esc(p.t)} &mdash; MJ&Uacute;K Iceland</title>`);
  h = must(h, /<meta name="description" content="[^"]*" \/>/, 'description').replace(/<meta name="description" content="[^"]*" \/>/, () => `<meta name="description" content="${esc(desc)}" />`);
  h = h.replace(/<link rel="alternate" hreflang[^>]*\/>\n/g, '').replace('</head>', () => head + '</head>');
  h = must(h, /<body data-page="product">/, 'body').replace('<body data-page="product">', () => `<body data-page="product" data-p="${p.h}">`);
  h = must(h, /<a class="nav__lang" id="langBtn" href="[^"]*"/, 'language link')
    .replace(/(<a class="nav__lang" id="langBtn" href=")[^"]*"/, (m, a) => `${a}${lang === 'en' ? 'is/product/' : '../product/'}${p.h}/"`);
  h = must(h, /(<nav class="crumb mono" id="crumb"[^>]*>)<\/nav>/, 'crumb').replace(/(<nav class="crumb mono" id="crumb"[^>]*>)<\/nav>/, (m, a) => `${a}${v.crumb}</nav>`);
  h = must(h, /<div class="pdp__gal" id="gal"><\/div>/, 'gallery').replace('<div class="pdp__gal" id="gal"></div>', () => `<div class="pdp__gal${v.imgs.length > 1 ? ' two' : ''}" id="gal">${v.gal}</div>`);
  h = must(h, /<div class="pdp__info" id="info"><\/div>/, 'info').replace('<div class="pdp__info" id="info"></div>', () => `<div class="pdp__info" id="info">${v.info}</div>`);
  // the rails: filled, or hidden when there is nothing to show (pages.js then removes them)
  h = v.sib.length
    ? h.replace(/(id="famName">)[^<]*</, (m, a) => `${a}${esc(v.famTitle)}<`).replace('<div class="rail__t" id="famT"></div>', () => `<div class="rail__t" id="famT">${mini(lang, v.sib)}</div>`)
    : h.replace('<section class="pg" id="family">', '<section class="pg" id="family" hidden>');
  h = v.withL.length
    ? h.replace(/(id="withName">)[^<]*</, (m, a) => `${a}${esc(v.withTitle)}<`).replace(/(id="withNote">)[^<]*</, (m, a) => `${a}${esc(v.withNote)}<`).replace('<div class="rail__t" id="withT"></div>', () => `<div class="rail__t" id="withT">${mini(lang, v.withL)}</div>`)
    : h.replace('<section class="pg" id="with">', '<section class="pg" id="with" hidden>');
  return h;
}

/* ── the pages ── */
const want = new Set(CM.all.map(p => p.h));
let n = 0;
for (const p of CM.all) for (const lang of ['en', 'is']) { write(LANG[lang].dir + p.h + '/index.html', page(p, lang)); n++; }
// pieces no longer in the shop: out of the site, into .stale/ (gitignored), never deleted
let stale = 0;
for (const lang of ['en', 'is']) {
  const dir = path.join(ROOT, LANG[lang].dir);
  for (const d of fs.readdirSync(dir)) {
    if (want.has(d) || !fs.statSync(path.join(dir, d)).isDirectory()) continue;
    const to = path.join(ROOT, '.stale', new Date().toISOString().slice(0, 10), LANG[lang].dir, d);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.renameSync(path.join(dir, d), fs.existsSync(to) ? to + '-' + Date.now() : to);
    stale++;
  }
}

/* ── the shop's plain catalogue: every page linked, grouped as she groups them ── */
function catalogue(lang) {
  const V = LANG[lang].V;
  const groups = (CM.groups || []).map(g => ({ key: g.key, name: V.nm(g), list: CM.all.filter(p => p.tyk === g.key) }));
  const rest = CM.all.filter(p => !V.GRP[p.tyk]);
  if (rest.length) groups.push({ key: 'other', name: T(lang, 'Other pieces'), list: rest });
  const byName = (a, b) => a.t.localeCompare(b.t, lang === 'is' ? 'is' : 'en');
  const soldOut = T(lang, 'sold out');
  return `<!-- CATALOGUE -->
    <details class="idx" id="every">
      <summary class="idx__s"><span class="mono">${lang === 'is' ? 'Allar flíkurnar, A til Ö' : 'Every piece, A to Z'}</span><span class="mono idx__n">${CM.all.length}</span></summary>
${groups.filter(g => g.list.length).map(g => `      <section class="idx__g"><h3 class="mono">${esc(g.name)} <small>${g.list.length}</small></h3><ul>${g.list.sort(byName).map(p => `<li${p.oos ? ' class="oos"' : ''}><a href="product/${p.h}/">${esc(p.t)}</a>${p.oos ? ` <small>${soldOut}</small>` : ''}</li>`).join('')}</ul></section>`).join('\n')}
    </details>
    <!-- /CATALOGUE -->`;
}
/* The shop builds its cards from script, and the script waits for the animation libraries, so on a slow
   phone the first row's photos were not even requested until ~1.7 s after the page arrived. This asks for
   them from the very top of the head instead, for the plain shop only (a filtered view shows other pieces).
   Same order as pages.js list() for the default view (her featured order, in stock only) and the same
   srcset and sizes as the card, so the browser reuses the preloaded file. Runs before the stylesheets:
   an inline script placed after them waits for them. */
const firstRow = (() => {
  const rank = {}; (CM.featuredNew || []).concat(CM.own || []).forEach((h, i) => { if (!(h in rank)) rank[h] = i; });
  return CM.all.filter(p => !p.oos && p.img && p.img[0])
    .sort((a, b) => ((a.h in rank ? rank[a.h] : 1e6) - (b.h in rank ? rank[b.h] : 1e6))).slice(0, 4).map(p => p.img[0]);
})();
const PRELOAD = `<!-- PRELOAD -->
<script>(function(){if(location.search)return;var s='(max-width:640px) 46vw, (max-width:1024px) 31vw, 24vw',p=function(u,w){return u+'?w='+w+'&ssl=1'};${JSON.stringify(firstRow)}.forEach(function(u,i){var l=document.createElement('link');l.rel='preload';l.as='image';l.href=p(u,620);l.setAttribute('imagesrcset',p(u,380)+' 380w, '+p(u,620)+' 620w, '+p(u,940)+' 940w');l.setAttribute('imagesizes',s);if(i<2)l.setAttribute('fetchpriority','high');document.head.appendChild(l)})})()</script>
<!-- /PRELOAD -->
`;
/* The shop's first 24 cards, built into the page. They are made by script, and on a slow phone the script
   was the last thing to arrive (the largest image on the page appeared ~4.4 s in). So the build lets the
   REAL page build them in a headless browser and embeds that markup, which cannot drift from the script's
   own (a second copy of the card template would). pages.js keeps them only when they are exactly the
   cards it would have built (key below), else it rebuilds as before. If there is no Chrome, nothing is
   embedded and the page works as it always did. */
const GRID_RE = /<div class="pgrid" id="pgrid"[^>]*>(?:<!-- GRID -->[\s\S]*?<!-- \/GRID -->)?<\/div>/;
const EMPTY_GRID = '<div class="pgrid" id="pgrid" data-wait></div>';
const rowKey = hrefs => { let h = 0x811c9dc5; for (const c of hrefs.join('|')) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0; return h.toString(16); };   // same as pages.js rowKey
async function snapshotGrids(files) {
  const chrome = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  let puppeteer; try { puppeteer = (await import('puppeteer-core')).default; } catch { return { why: 'puppeteer-core is not installed' }; }
  if (!fs.existsSync(chrome)) return { why: 'no Chrome at ' + chrome + ' (set CHROME_BIN)' };
  const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.txt': 'text/plain', '.xml': 'application/xml' };
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
    const f = path.join(ROOT, p);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port, out = {};
  let browser;
  try {
    browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', args: ['--no-sandbox'] });
    for (const file of files) {
      const page = await browser.newPage();
      await page.setViewport({ width: 412, height: 900, deviceScaleFactor: 2 });
      await page.setRequestInterception(true);   // photos and fonts are not needed to read the markup: no network, no waiting on them
      page.on('request', rq => (['image', 'font', 'media'].includes(rq.resourceType()) ? rq.abort() : rq.continue()));
      await page.goto(`http://127.0.0.1:${port}/${file}`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.querySelectorAll('#pgrid > .prod').length > 0, { timeout: 30000 });
      out[file] = await page.evaluate(() => {
        const kids = [...document.getElementById('pgrid').children]; kids.forEach(k => k.classList.add('in'));   // shown at once: no reveal to wait for
        return { html: kids.map(k => k.outerHTML).join(''), hrefs: kids.map(k => k.querySelector('.prod__go').getAttribute('href')) };
      });
      await page.close();
    }
  } catch (e) { return { why: e.message }; }
  finally { if (browser) await browser.close(); server.close(); }
  return out;
}
for (const [file, lang] of [['shop.html', 'en'], ['is/shop.html', 'is']]) {
  let s = read(file);
  s = s.replace(GRID_RE, EMPTY_GRID);   // start from the plain page: the browser must see what a visitor without the row sees
  s = s.replace(/\s*<!-- CATALOGUE -->[\s\S]*?<!-- \/CATALOGUE -->/, '');
  s = s.replace(/<!-- PRELOAD -->[\s\S]*?<!-- \/PRELOAD -->\n?/, '');
  const css = s.indexOf('<link rel="stylesheet"'); if (css < 0) throw new Error(file + ': no stylesheet link to place the photo hint before');
  s = s.slice(0, css) + PRELOAD + s.slice(css);
  const anchor = '<div class="pg__more"><button class="link" id="more" hidden>';
  const i = s.indexOf(anchor); if (i < 0) throw new Error(file + ': shop "more" button not found');
  const j = s.indexOf('</div>', i) + '</div>'.length;
  s = s.slice(0, j) + '\n    ' + catalogue(lang) + s.slice(j);
  write(file, s);
}
{
  const files = ['shop.html', 'is/shop.html'];
  const snaps = await snapshotGrids(files);
  for (const file of files) {
    const g = snaps[file];
    if (!g || g.hrefs.length < 24) { console.warn(`  ! ${file}: first row NOT embedded (${snaps.why || 'only ' + (g && g.hrefs.length) + ' cards'}); the page builds it from script as before`); continue; }
    let s = read(file);
    if (!GRID_RE.test(s)) throw new Error(file + ': shop grid not found');
    s = s.replace(GRID_RE, () => `<div class="pgrid" id="pgrid" data-static="${rowKey(g.hrefs)}"><!-- GRID -->${g.html}<!-- /GRID --></div>`);
    s = s.replace(/<!-- PRELOAD -->[\s\S]*?<!-- \/PRELOAD -->\n?/, '');   // the photos are in the HTML now: the browser finds them by itself
    write(file, s);
    console.log(`  ${file}: first ${g.hrefs.length} cards embedded (key ${rowKey(g.hrefs)}, ${Math.round(g.html.length / 1024)} KB)`);
  }
}

/* ── sitemaps, one per host, each page with its twin ── */
const PAGES = ['', 'shop.html', 'fibres.html', 'store.html', 'story.html'];
const pairs = [...PAGES.map(f => [SITE.en + f, SITE.is + f]), ...CM.all.map(p => [url('en', p), url('is', p)])];
const sitemap = lang => `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${pairs.map(([en, is]) => `  <url><loc>${lang === 'en' ? en : is}</loc><xhtml:link rel="alternate" hreflang="en" href="${en}"/><xhtml:link rel="alternate" hreflang="is" href="${is}"/><xhtml:link rel="alternate" hreflang="x-default" href="${en}"/></url>`).join('\n')}
</urlset>
`;
write('sitemap.xml', sitemap('en'));
write('is/sitemap.xml', sitemap('is'));

/* ── her old category addresses → the shop's filters ──
   Derived from which pieces each category holds today (with its sub-categories): one design they
   all share becomes ?family=, else one piece group and material, else one of either. The map is
   committed, because her category list (mjuk-shipping/data) is not on GitHub. */
const CATS = path.resolve(ROOT, '../../04-platform/mjuk-shipping/data/categories-2026-09-24.json');
const MAPF = 'tools/category-map.json';
if (fs.existsSync(CATS)) {
  const cats = JSON.parse(fs.readFileSync(CATS, 'utf8'));
  const bySlug = Object.fromEntries(cats.map(c => [c.slug, c])), byId = Object.fromEntries(cats.map(c => [c.id, c]));
  const kids = id => cats.filter(c => c.parent === id).flatMap(c => [c.slug, ...kids(c.id)]);
  const full = c => (c.parent && byId[c.parent] ? full(byId[c.parent]) + '/' : '') + c.slug;
  // the most common value, and how many of the pieces have it
  const top = (list, f) => { const k = {}; list.forEach(p => { const x = f(p); if (x) k[x] = (k[x] || 0) + 1; }); return (Object.entries(k).sort((a, b) => b[1] - a[1])[0] || [''])[0]; };
  const map = {};
  for (const c of cats) {
    const slugs = new Set([c.slug, ...kids(c.id)]);
    const list = CM.all.filter(p => (p.cats || []).some(s => slugs.has(s)));
    let to = 'shop.html', why;
    if (c.slug === 'sales') { to = 'shop.html?sale=1'; why = 'her sale category'; }
    else if (c.slug === 'new') { to = 'shop.html?new=1'; why = 'her new-in category'; }
    else if (LANG.en.V.GRP[c.slug]) { to = 'shop.html?type=' + c.slug; why = 'named after her piece group'; }
    else if (!list.length) why = 'no piece in the shop today';
    else {
      /* Of the filters that show at least 90% of the category's pieces (counted on the filter as a
         whole: type and material could each pass alone yet together drop the angora mittens and
         gloves from her angora category, Codex 2026-09-26), the one that best matches it: most of
         its pieces, fewest others (F1 of the two). */
      const fam = top(list, p => p.fam), tyk = top(list, p => p.tyk), mat = top(list, p => p.mat);
      const shows = keep => list.filter(keep).length;
      const enough = n => n >= list.length * 0.9;
      const cands = [
        fam && ['shop.html?family=' + fam, p => p.fam === fam, `her design "${fam}"`],
        tyk && mat && [`shop.html?type=${tyk}&material=${mat}`, p => p.tyk === tyk && p.mat === mat, `${tyk} in ${mat}`],
        mat && ['shop.html?material=' + mat, p => p.mat === mat, mat],
        tyk && ['shop.html?type=' + tyk, p => p.tyk === tyk, tyk],
      ].filter(Boolean);
      const score = keep => { const n = shows(keep), all = CM.all.filter(keep).length, rec = n / list.length, prec = all ? n / all : 0; return rec + prec ? 2 * rec * prec / (rec + prec) : 0; };
      const best = cands.map((c, i) => ({ c, i, n: shows(c[1]), f: score(c[1]) })).filter(x => enough(x.n)).sort((x, y) => y.f - x.f || x.i - y.i)[0];
      const hit = best && enough(best.n) ? best.c : null;
      if (hit) { to = hit[0]; why = `${shows(hit[1])} of its ${list.length} pieces are ${hit[2]}`; }
      else why = `its ${list.length} pieces share no single design, group or material`;
    }
    map[c.slug] = { path: full(c), to, why, n: list.length };
  }
  write(MAPF, JSON.stringify({ note: 'Her /product-category/<path>/ addresses (her WordPress, wc/v3 categories 2026-09-24) to shop filters. Written by tools/build-products.mjs; the router 301s on the last path segment.', map }, null, 1) + '\n');
}
const catmap = JSON.parse(read(MAPF)).map;
// the static preview has no router: a redirect page at each old address (noindex; the router's 301 is the real one)
let redirects = 0;
for (const [slug, c] of Object.entries(catmap)) {
  const dir = 'product-category/' + c.path + '/';
  const up = '../'.repeat(dir.split('/').filter(Boolean).length);
  write(dir + 'index.html', `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8" /><meta name="robots" content="noindex" /><title>MJ&Uacute;K Iceland</title>
<link rel="canonical" href="${SITE.en}${c.to}" /><meta http-equiv="refresh" content="0; url=${up}${esc(c.to)}" /></head>
<body><p><a href="${up}${esc(c.to)}">MJ&Uacute;K Iceland &mdash; Shop</a></p></body></html>
`);
  redirects++;
}

/* ── the report: what has no page, and why ── */
const PULL = path.resolve(ROOT, '../../04-platform/mjuk-shipping/data/products-2026-09-24.json');
let why = '';
if (fs.existsSync(PULL)) {
  const all = JSON.parse(fs.readFileSync(PULL, 'utf8'));
  const none = all.filter(p => !want.has(p.slug));
  const k = {}; none.forEach(p => { const r = p.status !== 'publish' ? p.status : p.catalog_visibility !== 'visible' ? 'published, hidden from her catalogue' : 'published and visible, but not listed by pull-woo'; k[r] = (k[r] || 0) + 1; });
  why = `; of her ${all.length} products, ${none.length} have no page: ` + Object.entries(k).map(([r, c]) => `${c} ${r}`).join(', ');
}
console.log(`wrote ${n} product pages (${CM.all.length} pieces × 2 languages), 2 catalogues, 2 sitemaps (${pairs.length} addresses each), ${redirects} preview redirects for her old categories; moved ${stale} stale page(s) to .stale/${why}`);
