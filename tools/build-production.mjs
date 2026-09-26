/* The launch build: the same site, made indexable, in dist/ (gitignored).

     node tools/build-pages.mjs && node tools/build-is.mjs && node tools/build-products.mjs && node tools/build-production.mjs

   The repository IS the GitHub Pages preview, so every page in it says noindex and robots.txt
   disallows everything; that must never reach mjukiceland.com, and the preview must never lose it.
   So production is a separate output, and the preview stays the default:
   - every page except staff.html (a staff tool) and product.html (it forwards to the real product
     address) loses its noindex;
   - the favicon becomes a crawlable PNG on the site's own host at 96 and 192 px (Google ignores
     data-URI and SVG favicons); the preview keeps the data URI (several prototypes share its origin);
   - robots.txt per host: everything allowed except her checkout, basket, account and admin, the
     staff page and the product.html forwarder; the sitemap of that host; her WordPress sitemap too,
     because her pages that stay on WordPress (shipping, returns, privacy, blog) still need finding;
   - is/robots.txt and is/sitemap.xml are mjukiceland.is's (the router serves is/ at that host's root);
   - tools/, the preview's product-category/ redirect pages (the router 301s those), the docs and
     the local server are left out.
   Fails loudly if a noindex, a Disallow: / or a data-URI icon survives on an indexable page. */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'dist');
const SKIP = new Set(['tools', 'product-category', 'functions', 'dist', 'node_modules', '.git', '.github', '.wrangler', '.stale', 'README.md', 'PRODUCT.md', '_serve.cjs', '.dev.vars', '.gitignore', '.DS_Store', 'robots.txt']);
const NOINDEX = new Set(['staff.html', 'product.html']);
const ICONS = '<link rel="icon" type="image/png" sizes="96x96" href="/assets/favicon-96.png" />\n<link rel="icon" type="image/png" sizes="192x192" href="/assets/favicon-192.png" />\n<link rel="apple-touch-icon" sizes="180x180" href="/assets/favicon.png" />';

// a fresh tree each time; the previous one is moved aside, never deleted in place
if (fs.existsSync(OUT)) { fs.mkdirSync(path.join(ROOT, '.stale'), { recursive: true }); fs.renameSync(OUT, path.join(ROOT, '.stale', 'dist-' + Date.now())); }

let pages = 0, indexable = 0;
const bad = [];
function copy(rel) {
  const from = path.join(ROOT, rel), to = path.join(OUT, rel);
  const st = fs.statSync(from);
  if (st.isDirectory()) { for (const f of fs.readdirSync(from)) if (!(rel === '' && SKIP.has(f)) && f !== '.DS_Store') copy(path.join(rel, f)); return; }
  fs.mkdirSync(path.dirname(to), { recursive: true });
  if (!rel.endsWith('.html')) return void fs.copyFileSync(from, to);
  let h = fs.readFileSync(from, 'utf8');
  pages++;
  // one favicon set, on the site's own host
  h = h.replace(/<!-- Inlined as a data URI on purpose:[\s\S]*?-->\n/, '');
  h = h.replace(/<link rel="icon"[^>]*href="data:[^>]*\/>\n?/g, '').replace(/<link rel="apple-touch-icon"[^>]*href="data:[^>]*\/>\n?/g, '');
  h = h.replace(/(<meta name="theme-color"[^>]*\/>\n)/, (m, a) => a + ICONS + '\n');
  // two hosts at launch: the language switch goes to the other host, not to a path on this one
  if (rel.startsWith('is/')) h = h.replace(/(<a class="nav__lang" id="langBtn" href=")\.\.\/([^"]*)"/, (m, a, x) => `${a}https://mjukiceland.com/${x.replace(/index\.html$/, '')}"`);
  else h = h.replace(/(<a class="nav__lang" id="langBtn" href=")is\/([^"]*)"/, (m, a, x) => `${a}https://mjukiceland.is/${x.replace(/index\.html$/, '')}"`);
  if (!/<a class="nav__lang" id="langBtn" href="https:\/\/mjukiceland\.(?:com|is)\//.test(h) && h.includes('id="langBtn"')) bad.push(rel + ': language switch not pointed at the other host');
  const hidden = NOINDEX.has(path.basename(rel));
  if (hidden) h = h.replace(/<meta name="robots" content="[^"]*" \/>/, '<meta name="robots" content="noindex, follow" />');
  else { h = h.replace(/<meta name="robots" content="[^"]*" \/>\n?/, ''); indexable++; }
  if (!hidden) {
    if (/noindex/i.test(h)) bad.push(rel + ': noindex left');
    if (/rel="(?:icon|apple-touch-icon)"[^>]*href="data:/.test(h)) bad.push(rel + ': data-URI icon left');
    if (!h.includes('sizes="96x96" href="/assets/favicon-96.png"')) bad.push(rel + ': no PNG favicon');
  }
  fs.writeFileSync(to, h);
}
copy('');

const robots = host => `# ${host}: the storefront, with her WordPress behind it for checkout, account and her own pages
User-agent: *
Disallow: /wp-admin/
Allow: /wp-admin/admin-ajax.php
Disallow: /basket/
Disallow: /checkout/
Disallow: /my-account/
Disallow: /*?add-to-cart=
Disallow: /*?wc-ajax=
Disallow: /staff.html
Disallow: /product.html

# the AI crawlers, named, so a hosting preset cannot silently block them
User-agent: GPTBot
User-agent: OAI-SearchBot
User-agent: ChatGPT-User
User-agent: PerplexityBot
User-agent: Perplexity-User
User-agent: ClaudeBot
User-agent: Claude-User
User-agent: Google-Extended
User-agent: Applebot-Extended
User-agent: Bingbot
Disallow: /wp-admin/
Disallow: /basket/
Disallow: /checkout/
Disallow: /my-account/
Disallow: /staff.html

Sitemap: https://${host}/sitemap.xml
${host === 'mjukiceland.com' ? 'Sitemap: https://mjukiceland.com/wp-sitemap.xml\n' : ''}`;
fs.writeFileSync(path.join(OUT, 'robots.txt'), robots('mjukiceland.com'));
fs.writeFileSync(path.join(OUT, 'is/robots.txt'), robots('mjukiceland.is'));
for (const f of ['robots.txt', 'is/robots.txt']) if (/^Disallow:\s*\/\s*$/m.test(fs.readFileSync(path.join(OUT, f), 'utf8'))) bad.push(f + ': Disallow: /');
for (const f of ['sitemap.xml', 'is/sitemap.xml']) if (!fs.existsSync(path.join(OUT, f))) bad.push(f + ' missing (run tools/build-products.mjs first)');

/* A release is built from her live catalogue, pulled at most two days ago, and from pages generated
   after that pull: the file checks above compare pages only with each other, so stale or sandbox
   data would otherwise ship clean (Codex 2026-09-26). --rehearsal lets a local test build through. */
if (!process.argv.includes('--rehearsal')) {
  globalThis.window = {};
  new Function('window', fs.readFileSync(path.join(ROOT, 'assets/data.js'), 'utf8'))(globalThis.window);
  const { harvestedAt, source } = globalThis.window.CM;
  if (!/^live /.test(source || '')) bad.push(`assets/data.js comes from "${source}", not her live shop: node tools/pull-woo.mjs --live, then rebuild (or --rehearsal for a test build)`);
  if (!((Date.now() - Date.parse(harvestedAt)) / 864e5 <= 2)) bad.push(`assets/data.js was pulled ${harvestedAt}: pull her catalogue again before a release (two days at most)`);
  const mt = f => fs.statSync(path.join(ROOT, f)).mtimeMs;
  if (mt('sitemap.xml') < mt('assets/data.js') || mt('assets/i18n-is.js') < mt('tools/is.json')) bad.push('the pages are older than their data: run build-pages, build-is and build-products after the pull');
}

if (bad.length) { console.error('production build FAILED:\n  ' + bad.slice(0, 20).join('\n  ') + (bad.length > 20 ? `\n  … ${bad.length - 20} more` : '')); process.exit(1); }
console.log(`dist/: ${pages} pages (${indexable} indexable, ${pages - indexable} noindex: staff and the product.html forwarder), robots.txt + sitemap.xml for mjukiceland.com and mjukiceland.is`);
