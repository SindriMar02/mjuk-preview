/* Pulls MJÚK's catalogue from WooCommerce wc/v3 and writes assets/data.js and assets/copy.js,
   the two files every page reads. Product ids are the key everywhere, as in the DHL catalogue.

     node tools/pull-woo.mjs                the sandbox on :9410 (04-platform/mjuk-woo-sandbox)
     node tools/pull-woo.mjs --live         her shop with the read-only key in
                                            ~/.config/sndr/mjuk-woo.env: small pages, a pause
                                            between each, stops at the first 5xx or 429
     node tools/pull-woo.mjs --file <products.json>   a saved wc/v3 pull, no network
     add --dry to print the report and write nothing

   Facts only where they are true. Composition, piece type and origin come from the customs
   catalogue (04-platform/mjuk-shipping/customs-catalogue.json), which reads them from her own
   product text. Where it says nothing, the page says nothing. The fibre filter falls back to her
   own fibre categories, then to a single fibre word in her name or short text, else stays empty.
   Editorial picks the pull cannot derive live in tools/curation.json. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const WS = path.resolve(ROOT, '../..');
const args = process.argv.slice(2);
const flag = f => args.includes(f);
const opt = f => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };
const CATALOGUE = opt('--catalogue') || path.join(WS, '04-platform/mjuk-shipping/customs-catalogue.json');

const readEnv = file => Object.fromEntries(fs.readFileSync(file, 'utf8').split('\n')
  .map(l => l.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/)).filter(Boolean).map(m => [m[1], m[2].replace(/^["']|["']$/g, '')]));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const FIELDS = 'id,name,slug,type,status,catalog_visibility,description,short_description,price,regular_price,sale_price,manage_stock,stock_quantity,stock_status,categories,images,menu_order';

/* ── source ─────────────────────────────────────────────────────────────── */
async function pull() {
  if (opt('--file')) return { source: 'file ' + path.relative(WS, path.resolve(opt('--file'))), products: JSON.parse(fs.readFileSync(opt('--file'), 'utf8')) };
  const live = flag('--live');
  const env = live ? readEnv(path.join(os.homedir(), '.config/sndr/mjuk-woo.env'))
                   : readEnv(path.join(WS, '04-platform/mjuk-woo-sandbox/local/sandbox.env'));
  const base = (live ? env.MJUK_WOO_URL : env.SANDBOX_URL).replace(/\/$/, '');
  const auth = 'Basic ' + Buffer.from(live ? `${env.MJUK_WOO_CK}:${env.MJUK_WOO_CS}` : `${env.SANDBOX_USER}:${env.SANDBOX_APP_PASSWORD}`).toString('base64');
  // Playground's --login 302s any cookieless request; her CDN answers non-browser clients with a
  // 307 cookie loop. Both are passed by keeping the cookies they set.
  const jar = new Map(live ? [] : [['playground_auto_login_already_happened', '1']]);
  const perPage = live ? 25 : 100, pause = live ? 4000 : 0;
  const get = async url => {
    for (let hop = 0; hop < 5; hop++) {
      const res = await fetch(url, { redirect: 'manual', headers: {
        Authorization: auth, Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (SNDR catalogue read)',
        Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') } });
      for (const c of res.headers.getSetCookie()) { const [kv] = c.split(';'); const i = kv.indexOf('='); jar.set(kv.slice(0, i).trim(), kv.slice(i + 1)); }
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) { url = new URL(res.headers.get('location'), url).href; continue; }
      if (res.status >= 500 || res.status === 429) throw new Error(`${base} answered ${res.status}. Stopped there, nothing written. Try again later, gently.`);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}\n${(await res.text()).slice(0, 300)}`);
      return { list: await res.json(), pages: +res.headers.get('x-wp-totalpages') || 1 };
    }
    throw new Error('redirect loop at ' + url);
  };
  const products = [];
  for (let page = 1, pages = 1; page <= pages; page++) {
    if (page > 1) await sleep(pause);
    const r = await get(`${base}/wp-json/wc/v3/products?per_page=${perPage}&page=${page}&orderby=id&order=asc&_fields=${FIELDS}`);
    pages = r.pages; products.push(...r.list);
    process.stderr.write(`  page ${page}/${pages}: ${products.length} products\n`);
  }
  return { source: live ? 'live wc/v3 (read-only key)' : 'sandbox wc/v3 ' + base, products };
}

/* ── her text, cleaned the way the pages show it ────────────────────────── */
const ENT = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", ndash: '–', mdash: '—', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', deg: '°' };
const decode = s => String(s || '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => e[0] === '#'
  ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1)) : (ENT[e.toLowerCase()] ?? m));
// Her shop runs every text through WordPress's texturize: curly quotes, en dashes, primes, ×.
// The API returns the raw post, so the same pass is applied here to show what she shows.
const texturize = s => s
  .replace(/\b(\d[\d.,]*)x(\d[\d.,]*)\b/g, '$1×$2').replace(/ --? /g, m => m.length === 4 ? ' — ' : ' – ')
  .replace(/(\d)'/g, '$1′').replace(/(\d)"/g, '$1″').replace(/(\w)'(\w)/g, '$1’$2')
  .replace(/(^|[\s([{])"/g, '$1“').replace(/"/g, '”').replace(/(^|[\s([{])'/g, '$1‘').replace(/'/g, '’');
// A bare link to one of her own pages renders there as that page's title; the URL would die with
// the old site anyway.
// Uploaded media links and the old video player's script and shortcodes are not text.
const ownLink = s => s
  .replace(/https?:\/\/(?:www\.)?mjukiceland\.(?:com|is)\/wp-content\/\S+/gi, '')
  .replace(/https?:\/\/(?:www\.)?mjukiceland\.(?:com|is)\/([a-z0-9-]+)\/?(?=[\s,.;)]|$)/gi,
    (m, slug) => { const t = slug.replace(/-/g, ' '); return t.charAt(0).toUpperCase() + t.slice(1); });
const strip = h => String(h || '').replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/\[\/?[a-z_]+[^\]]*\]/gi, ' ').replace(/<[^>]+>/g, ' ');
const txt = h => texturize(ownLink(decode(strip(h))).replace(/\s+/g, ' ').trim());

// Care is her own sentences: from the first washing phrase while the sentences keep talking
// about washing or drying. Starts at the label when one sits just before it ("Wash Instructions:").
const CARE = /(machine|hand)[- ]?wash|dry[- ]clean/i;
function careOf(long) {
  let i = long.search(CARE); if (i < 0) return '';
  const label = long.slice(Math.max(0, i - 25), i).match(/[:.✓]\s*([A-Za-z][A-Za-z ]*)$/);
  if (label) i -= label[1].length;
  // her lines often run on without a full stop, so the next paragraph's first words end it too
  const rest = long.slice(i).split(/\s(?=About |Please|Pair |Video|Check |Size|Dimensions|Available|Can be |Perfect |§|✓|\d+\s?[x×]\s?\d+|https?:)/)[0];
  const out = [];
  for (const s of rest.trim().split(/(?<=\.)\s+/)) {
    if (out.length && !/wash|dry|detergent|iron|bleach|tumble/i.test(s)) break;
    out.push(s); if (out.length === 3) break;
  }
  const c = out.join(' ').slice(0, 280).trim();
  return c.charAt(0).toUpperCase() + c.slice(1);
}

/* ── classification ─────────────────────────────────────────────────────── */
const FIBRES = [['angora', 'Angora'], ['merino', 'Merino'], ['cashmere', 'Cashmere'], ['icelandic-wool', 'Icelandic wool'], ['alpaca-silk', 'Alpaca & silk']];
const FIB_NAME = Object.fromEntries(FIBRES);
const FROM_MATERIAL = { 'angora': 'angora', 'merino wool': 'merino', 'cashmere': 'cashmere', 'Icelandic wool': 'icelandic-wool', 'alpaca': 'alpaca-silk' };
const FROM_CATEGORY = { 'angora-wool': 'angora', 'merino-wool': 'merino', 'cashmere': 'cashmere', 'icelandic-wool': 'icelandic-wool', 'alpaca-and-silk': 'alpaca-silk', 'alpaca': 'alpaca-silk' };
const FROM_WORD = [['angora', /\bangora\b/i], ['merino', /\bmerino\b/i], ['cashmere', /\bcashmere\b/i], ['icelandic-wool', /\bicelandic (sheep )?wool\b/i], ['alpaca-silk', /\balpaca\b/i]];
const one = keys => { const u = [...new Set(keys)]; return u.length === 1 ? u[0] : ''; };
function fibreOf(p, cc, shortText) {
  if (cc && FROM_MATERIAL[cc.material]) return [FROM_MATERIAL[cc.material], 'composition'];
  const byCat = one(p.categories.map(c => FROM_CATEGORY[c.slug]).filter(Boolean));
  if (byCat) return [byCat, 'her category'];
  const byWord = one(FROM_WORD.filter(([, re]) => re.test(p.name + ' ' + shortText)).map(([k]) => k));
  return byWord ? [byWord, 'her wording'] : ['', null];
}

// The storefront's seven piece types; the customs catalogue's types refined for shopping.
const TYPES = { hats: 'Beanies & hats', scarves: 'Scarves', headbands: 'Headbands', mittens: 'Mittens & gloves', blankets: 'Blankets', neckwarmers: 'Neckwarmers', capes: 'Capes & ponchos' };
function typeOf(p, cc) {
  if (!cc || !cc.type) return '';
  if (/\bneck ?warmer/i.test(p.name)) return 'neckwarmers';
  if (cc.type === 'gloves') return 'mittens';
  return cc.type; // hats, scarves, headbands, blankets, capes, pompoms, collars
}

// Origin only where her text states it; her words for the place, not ours.
const PLACE = /\b(custom[- ]made|hand[- ]?made|hand[- ]?knitted|manufactured|made|knitted|sewn)\s+in\s+(reykjav[ií]k|iceland)\b/i;
function originOf(p, cc, shortText, longText) {
  if (!cc || cc.originCountry !== 'IS') return '';
  const m = (p.name + ' ' + shortText + ' ' + longText).match(PLACE);
  if (m) { const verb = m[1].toLowerCase().replace(' ', '-'); return verb[0].toUpperCase() + verb.slice(1) + ' in ' + (/^i/i.test(m[2]) ? 'Iceland' : 'Reykjavík'); }
  if (/laugavegur 23/i.test(cc.originFrom || '')) return 'Sewn at Laugavegur 23, Reykjavík';
  return 'Made in Iceland';
}

// The customs catalogue's composition, shown only when it accounts for the whole piece. A list
// that does not reach 100% has lost a fibre her text names. A double-sided piece whose text
// states each side already has no composition there (its sides are in compositionNote), and one
// that states a single composition for both colourways (the Konungur blankets) is shown.
function compositionOf(p, cc) {
  const c = (cc && cc.composition) || ''; if (!c) return '';
  const sum = (c.match(/\d+(?:\.\d+)?(?=%)/g) || []).reduce((a, n) => a + +n, 0);
  if (Math.round(sum) !== 100) { why.partial.push(`${p.id} "${c}"`); return ''; }
  return c;
}

/* ── build ──────────────────────────────────────────────────────────────── */
const { source, products } = await pull();
const catalogue = JSON.parse(fs.readFileSync(CATALOGUE, 'utf8'));
const curation = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/curation.json'), 'utf8'));

const listed = products
  .filter(p => p.status === 'publish' && ['visible', 'catalog'].includes(p.catalog_visibility) && p.type === 'simple')
  .sort((a, b) => (a.menu_order - b.menu_order) || (a.id - b.id));

const texts = [], textIdx = new Map(), map = {}, care = {};
const addText = s => { if (!s) return -1; if (!textIdx.has(s)) { textIdx.set(s, texts.length); texts.push(s); } return textIdx.get(s); };
const why = { fib: {}, missing: [], partial: [] };

const all = listed.map(p => {
  const cc = catalogue[p.id] || null;
  if (!cc) why.missing.push(p.id);
  const shortText = txt(p.short_description), longText = txt(p.description);
  const [fib, fibFrom] = fibreOf(p, cc, shortText);
  if (fibFrom) why.fib[fibFrom] = (why.fib[fibFrom] || 0) + 1;
  const tyk = typeOf(p, cc);
  const price = +p.price || 0, regular = +p.regular_price || 0;
  const s = addText(shortText), l = addText(longText);
  map[p.id] = { s, l };
  if (l >= 0 && !(l in care)) { const c = careOf(longText); if (c) care[l] = c; }
  const o = {
    h: p.slug, t: texturize(decode(p.name).replace(/\s+/g, ' ').trim()), v: FIB_NAME[fib] || '', ty: TYPES[tyk] || '',
    p: price, cp: p.sale_price !== '' && regular > price ? regular : 0,
    img: [...new Set((p.images || []).map(i => String(i.src).split('?')[0]))].slice(0, 4),
    sz: [], comp: compositionOf(p, cc), fib, tyk, id: p.id, live: true,
    oos: p.stock_status === 'outofstock', cats: p.categories.map(c => c.slug),
  };
  if (p.manage_stock && Number.isInteger(p.stock_quantity)) o.q = p.stock_quantity;
  const mi = originOf(p, cc, shortText, longText); if (mi) o.mi = mi;
  return o;
});

// Pools feed the category tiles: in stock, photographed, one per family in turn (her most
// specific category), in her own shop order.
const catCount = {}; all.forEach(p => p.cats.forEach(c => { catCount[c] = (catCount[c] || 0) + 1; }));
const family = p => p.cats.slice().sort((a, b) => catCount[a] - catCount[b])[0] || '';
function pool(items, n = 24) {
  const groups = new Map();
  for (const p of items) if (!p.oos && p.img[0]) { const f = family(p); if (!groups.has(f)) groups.set(f, []); groups.get(f).push(p.h); }
  const out = [], lists = [...groups.values()];
  for (let r = 0; out.length < n && lists.some(l => l.length > r); r++) for (const l of lists) if (l[r] && out.length < n) out.push(l[r]);
  return out;
}
const cats = FIBRES.map(([key, name]) => { const items = all.filter(p => p.fib === key); return { key, name, count: items.length, pool: pool(items) }; });
const types = Object.entries(TYPES).map(([key, name]) => { const items = all.filter(p => p.tyk === key); return { key, name, count: items.length, pool: pool(items) }; })
  .filter(t => t.count).sort((a, b) => b.count - a.count);

const byId = new Map(all.map(p => [p.id, p]));
const dropped = [];
const picks = ids => ids.filter(id => byId.has(id) || (dropped.push(id), false)).map(id => byId.get(id).h);
const CM = {
  all, featuredNew: picks(curation.featuredNew), own: picks(curation.own), cats, types,
  hero: curation.hero, campaign: curation.campaign, wall: curation.wall,
  totalCount: all.length, saleCount: all.filter(p => p.cp > 0 && !p.oos).length,
  retired: dropped, harvestedAt: new Date().toISOString().slice(0, 10), source,
};

/* ── report, against what the pages show today ──────────────────────────── */
const L = [];
L.push(`Source: ${source}`, `Products: ${products.length} in WooCommerce, ${all.length} listed (published, visible, simple), ${CM.saleCount} on sale, ${all.filter(p => p.oos).length} sold out`);
L.push(`Composition stated: ${all.filter(p => p.comp).length} · type known: ${all.filter(p => p.tyk).length} · origin stated: ${all.filter(p => p.mi).length} · care text: ${Object.keys(care).length} texts`);
L.push(`Fibre filter from: ${Object.entries(why.fib).map(([k, v]) => `${k} ${v}`).join(', ')}; none ${all.filter(p => !p.fib).length}`);
L.push(`Types: ${types.map(t => `${t.key} ${t.count}`).join(', ')}; also ${[...new Set(all.map(p => p.tyk).filter(k => k && !TYPES[k]))].map(k => `${k} ${all.filter(p => p.tyk === k).length}`).join(', ') || 'none'}`);
if (why.partial.length) L.push(`Composition withheld (does not add up to 100%) for ${why.partial.length}: ${[...new Set(why.partial.map(x => x.replace(/^\d+ /, '')))].join('; ')}`);
if (all.some(p => !p.img.length)) L.push(`No photo in WooCommerce: ${all.filter(p => !p.img.length).map(p => `${p.id} ${p.t}`).join(', ')}`);
if (why.missing.length) L.push(`Not in the customs catalogue (nothing claimed; rebuild it from a newer pull): ${why.missing.join(', ')}`);
if (dropped.length) L.push(`Curated picks no longer listed, dropped: ${dropped.join(', ')}`);
const dataFile = path.join(ROOT, 'assets/data.js');
if (fs.existsSync(dataFile)) {
  const old = new Function('window', fs.readFileSync(dataFile, 'utf8') + ';return window.CM;')({});
  const oldById = new Map(old.all.map(p => [p.id, p]));
  const added = all.filter(p => !oldById.has(p.id)).map(p => p.id), gone = old.all.filter(p => !byId.has(p.id)).map(p => p.id);
  const changed = { p: [], cp: [], oos: [], fib: [], tyk: [], comp: [] };
  for (const p of all) { const o = oldById.get(p.id); if (!o) continue; for (const k of Object.keys(changed)) if (String(o[k]) !== String(p[k])) changed[k].push(p.id); }
  L.push(`Against the current data.js (${old.harvestedAt}): +${added.length} −${gone.length}; changed ${Object.entries(changed).map(([k, v]) => `${k} ${v.length}`).join(', ')}`);
  if (added.length) L.push(`  new: ${added.slice(0, 20).join(', ')}${added.length > 20 ? ' …' : ''}`);
  if (gone.length) L.push(`  gone: ${gone.slice(0, 20).join(', ')}${gone.length > 20 ? ' …' : ''}`);
  for (const k of ['fib', 'tyk', 'comp']) for (const id of changed[k].slice(0, 3)) {
    const o = oldById.get(id), n = byId.get(id); L.push(`  ${k} #${id} ${JSON.stringify(o[k])} → ${JSON.stringify(n[k])}  (${n.t})`);
  }
}
console.log(L.join('\n'));

if (flag('--dry')) { console.log('\n--dry: nothing written'); process.exit(0); }
fs.writeFileSync(dataFile, 'window.CM = ' + JSON.stringify(CM) + ';\n');
fs.writeFileSync(path.join(ROOT, 'assets/copy.js'), 'window.CMCOPY = ' + JSON.stringify({ texts, map, care }) + ';\n');
console.log(`\nWrote assets/data.js (${(fs.statSync(dataFile).size / 1024).toFixed(0)} KB) and assets/copy.js`);
