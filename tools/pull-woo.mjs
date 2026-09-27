/* Pulls MJÚK's catalogue from WooCommerce wc/v3 and writes assets/data.js and assets/copy.js,
   the two files every page reads. Product ids are the key everywhere, as in the DHL catalogue.

     node tools/pull-woo.mjs                the sandbox on :9410 (04-platform/mjuk-woo-sandbox)
     node tools/pull-woo.mjs --live         her shop with the read-only key in
                                            ~/.config/sndr/mjuk-woo.env: small pages, a pause
                                            between each, stops at the first 5xx or 429
     node tools/pull-woo.mjs --file <products.json>   a saved wc/v3 pull, no network
                                            (--lists <lists.json> for the shop-fields lists)
     node tools/pull-woo.mjs --woo http://127.0.0.1:9420   a local stack (replica, upgraded) with
                                            the local test token; never a real host
     add --dry to print the report and write nothing

   Where each piece is listed (design, group, material) is Anna's choice in WordPress: the two
   shop-fields dropdowns (04-platform/mjuk-woo-sandbox/mu-plugins/sndr-shop-fields.php), read as
   each product's "sndr_shop" and the lists at /wp-json/sndr-shop/v1/lists. A piece with nothing
   chosen falls back to the name rules below, and says so in reports/shop-health.md, which every
   run rewrites in plain words: what needs her, what is not on the shop and why.

   Facts only where they are true. Composition, piece type and origin come from the customs
   catalogue (04-platform/mjuk-shipping/customs-catalogue.json), which reads them from her own
   product text. Where it says nothing, the page says nothing. Family, material and piece group
   are Anna's (tools/groups.json, her sheet "Product groups"; tools/groups.mjs joins by name).
   Editorial picks the pull cannot derive live in tools/curation.json. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { G, familyOf, materialOf, groupOfType, MATERIALS } from './groups.mjs';
import { version as SHEET_VERSION } from './shop-fields-json.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const WS = path.resolve(ROOT, '../..');
const args = process.argv.slice(2);
const flag = f => args.includes(f);
const opt = f => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };
const CATALOGUE = opt('--catalogue') || path.join(WS, '04-platform/mjuk-shipping/customs-catalogue.json');

const readEnv = file => Object.fromEntries(fs.readFileSync(file, 'utf8').split('\n')
  .map(l => l.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/)).filter(Boolean).map(m => [m[1], m[2].replace(/^["']|["']$/g, '')]));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const FIELDS = 'id,name,slug,type,status,catalog_visibility,description,short_description,price,regular_price,sale_price,manage_stock,stock_quantity,stock_status,categories,images,menu_order,sndr_shop';
const LOCAL = opt('--woo') ? opt('--woo').replace(/\/$/, '') : '';
if (LOCAL && !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(LOCAL)) { console.error('--woo takes a local stack only, e.g. http://127.0.0.1:9420'); process.exit(2); }

/* ── source ─────────────────────────────────────────────────────────────── */
async function pull() {
  if (opt('--file')) return { source: 'file ' + path.relative(WS, path.resolve(opt('--file'))), products: JSON.parse(fs.readFileSync(opt('--file'), 'utf8')),
    lists: opt('--lists') ? JSON.parse(fs.readFileSync(opt('--lists'), 'utf8')) : null, listsWhy: opt('--lists') ? '' : 'no --lists file given' };
  const live = flag('--live');
  // a scheduled run (.github/workflows/stock.yml) passes the read-only key as environment variables
  const env = live ? (process.env.MJUK_WOO_CK ? process.env : readEnv(path.join(os.homedir(), '.config/sndr/mjuk-woo.env')))
                   : readEnv(path.join(WS, '04-platform/mjuk-woo-sandbox/local/sandbox.env'));
  const base = LOCAL || (live ? env.MJUK_WOO_URL : env.SANDBOX_URL).replace(/\/$/, '');
  const auth = LOCAL ? '' : 'Basic ' + Buffer.from(live ? `${env.MJUK_WOO_CK}:${env.MJUK_WOO_CS}` : `${env.SANDBOX_USER}:${env.SANDBOX_APP_PASSWORD}`).toString('base64');
  const token = LOCAL ? readEnv(path.join(WS, '04-platform/mjuk-woo-sandbox/local/test.env')).TEST_TOKEN : '';
  // Playground's --login 302s any cookieless request; her CDN answers non-browser clients with a
  // 307 cookie loop. Both are passed by keeping the cookies they set.
  const jar = new Map(live ? [] : [['playground_auto_login_already_happened', '1']]);
  const perPage = live ? 25 : 100, pause = live ? 4000 : 0;
  const get = async url => {
    for (let hop = 0; hop < 5; hop++) {
      const res = await fetch(url, { redirect: 'manual', headers: {
        ...(auth ? { Authorization: auth } : { 'X-SNDR-Test': token }), Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (SNDR catalogue read)',
        Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') } });
      for (const c of res.headers.getSetCookie()) { const [kv] = c.split(';'); const i = kv.indexOf('='); jar.set(kv.slice(0, i).trim(), kv.slice(i + 1)); }
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        const next = new URL(res.headers.get('location'), url);
        // credentials and cookies go to her host only, never to wherever a redirect points
        if (next.origin !== new URL(base).origin) throw new Error(`${base} redirected to ${next.origin}. Stopped there; credentials not sent.`);
        url = next.href; continue;
      }
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
  // her shipping zones, so every shipping sentence on the site is her settings, not ours
  const zones = [];
  await sleep(pause);
  for (const z of (await get(`${base}/wp-json/wc/v3/shipping/zones`)).list) {
    await sleep(pause);
    const locations = z.id === 0 ? [] : (await get(`${base}/wp-json/wc/v3/shipping/zones/${z.id}/locations`)).list;
    await sleep(pause);
    const methods = (await get(`${base}/wp-json/wc/v3/shipping/zones/${z.id}/methods`)).list.filter(m => m.enabled);
    const setting = (id, k) => { const m = methods.find(x => x.method_id === id); return m && m.settings && m.settings[k] ? m.settings[k].value : ''; };
    zones.push({ id: z.id, codes: locations.filter(l => l.type === 'country').map(l => l.code),
      flat: +setting('flat_rate', 'cost') || null, free: setting('free_shipping', 'requires') === 'min_amount' ? +setting('free_shipping', 'min_amount') || null : null,
      pickup: methods.some(m => m.method_id === 'local_pickup') });
  }
  // her lists (designs she added, the names): public. Without them the designs every product names
  // from her sheet still hold; only a design she added herself needs them.
  let lists = null, listsWhy = '';
  await sleep(pause);
  // the reason is kept short and never carries an address: it goes into the public report
  try { lists = (await get(`${base}/wp-json/sndr-shop/v1/lists`)).list; if (!lists || typeof lists !== 'object' || !Array.isArray(lists.designs)) { lists = null; listsWhy = 'the answer had no list of designs'; } }
  catch (e) { const m = String(e.message).match(/answered (\d{3})|^(\d{3}) /); listsWhy = m ? `it answered ${m[1] || m[2]}` : /redirected/.test(e.message) ? 'it redirected elsewhere' : 'it could not be reached'; }
  return { source: LOCAL ? 'local wc/v3 ' + base : live ? 'live wc/v3 (read-only key)' : 'sandbox wc/v3 ' + base, products, zones, lists, listsWhy };
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

/* ── classification: Anna's own (tools/groups.json) ─────────────────────── */
// Family, material and piece group come from her sheet "Product groups", joined by product name.
// Where her sheet names no material, the product's composition decides (tools/groups.mjs).
// Origin only where her text states it; her words for the place, not ours.
const PLACE = /\b(custom[- ]made|hand[- ]?made|hand[- ]?knitted|manufactured|made|knitted|sewn)\s+in\s+(reykjav[ií]k|iceland)\b/i;
function originOf(p, cc, shortText, longText) {
  if (!cc || cc.originCountry !== 'IS') return '';
  const m = (p.name + ' ' + shortText + ' ' + longText).match(PLACE);
  if (m) { const verb = m[1].toLowerCase().replace(' ', '-'); return verb[0].toUpperCase() + verb.slice(1) + ' in ' + (/^i/i.test(m[2]) ? 'Iceland' : 'Reykjavík'); }
  // capes: her website says they are sewn at Laugavegur 23 (the customs catalogue's source)
  if (/laugavegur 23/i.test(cc.originFrom || '')) return 'Sewn at Laugavegur 23, Reykjavík';
  return '';
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
const { source, products, zones = null, lists = null, listsWhy = '' } = await pull();

/* her designs: the sheet's, plus any she added in WordPress (Products → Shop designs) */
const GROUP_KEYS = new Set(G.groups.map(g => g.key)), MAT_KEYS = new Set(MATERIALS.map(m => m.key));
const str = v => typeof v === 'string' ? v : '';
// a design she added: a real entry, a key that is not one of the sheet's and not a reserved
// "other-<group>" or "none" choice, a name, and one of her groups
const goodAdded = d => d && typeof d === 'object' && d.added === true && /^[a-z0-9-]{1,80}$/.test(str(d.key)) && !/^other-|^none$/.test(d.key)
  && str(d.name).trim() && GROUP_KEYS.has(str(d.group)) && !G.families.some(f => f.key === d.key);
const toFam = d => ({ key: d.key, name: str(d.name).trim(), is: str(d.is).trim() || str(d.name).trim(), isMissing: !str(d.is).trim(), group: d.group, material: MAT_KEYS.has(str(d.material)) ? d.material : '', goes: [], added: true });
let addedFams = (lists ? lists.designs : []).filter(goodAdded).map(toFam);
// her lists unreadable this time: the designs she added keep what the last good read gave them,
// so a passing outage never moves a piece (a design added since then is reported, not guessed)
const prevData = fs.existsSync(path.join(ROOT, 'assets/data.js')) ? new Function('window', fs.readFileSync(path.join(ROOT, 'assets/data.js'), 'utf8') + ';return window.CM;')({}) : null;
const prevAdded = ((prevData && prevData.families) || []).filter(f => f.added && GROUP_KEYS.has(f.group))
  .map(f => ({ key: f.key, name: f.name, is: f.is, isMissing: false, group: f.group, material: f.mat || '', goes: [], added: true }));
const keptFromLast = [];
if (!lists) addedFams = prevAdded;
else {
  // a list that answers but leaves out a design products still name (it cannot be deleted while in
  // use, so that is the list's fault, not hers): keep that design from the last good read
  const named = new Set(products.map(p => p.sndr_shop && typeof p.sndr_shop.design === 'string' ? p.sndr_shop.design : '').filter(Boolean));
  for (const f of prevAdded) if (named.has(f.key) && !addedFams.some(a => a.key === f.key)) { addedFams.push(f); keptFromLast.push(`${f.name} (${f.key})`); }
}
const FAM = new Map([...G.families, ...addedFams].map(f => [f.key, f]));

/* shipping, in words, from her zones: the product page's Delivery row and the bag's note */
const EU = 'AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE'.split(' ');
const region = new Intl.DisplayNames(['en'], { type: 'region' });
const places = codes => { const c = [...new Set(codes)]; const eu = EU.every(x => c.includes(x));
  return [...(eu ? ['the EU'] : []), ...c.filter(x => !(eu && EU.includes(x))).map(x => ({ GB: 'the United Kingdom', US: 'the United States' })[x] || region.of(x))]; };
const and = a => (a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]);
function shipping(zs) {
  if (!zs || !zs.length) return null;
  const withFree = zs.filter(z => z.free);
  const byAmount = {};
  for (const z of withFree) (byAmount[z.free] = byAmount[z.free] || []).push(z);
  const parts = Object.keys(byAmount).map(Number).sort((a, b) => a - b).map(amount => {
    const named = byAmount[amount].filter(z => z.id !== 0).flatMap(z => places(z.codes));
    const rest = byAmount[amount].some(z => z.id === 0);
    return { amount, rest, text: `from $${amount} ${rest && !named.length ? 'everywhere else' : 'to ' + and(named) + (rest ? ' and everywhere else' : '')}` };
  }).sort((a, b) => (a.rest - b.rest) || (a.amount - b.amount));
  const pickup = zs.filter(z => z.pickup && z.id !== 0).flatMap(z => places(z.codes));
  const amounts = withFree.map(z => z.free);
  return {
    // no carrier named: her settings do not say one (DHL is ours to confirm with her first)
    delivery: `Worldwide${pickup.length ? `, with local pickup in ${and(pickup)}` : ''}. ` + (parts.length ? `Free shipping ${parts.map(p => p.text).join('; ')}.` : ''),
    // Woo's free-shipping minimum includes the amount itself, so "once it reaches", not "above"
    bag: amounts.length ? `Shipping is calculated at checkout, and free once your order reaches $${Math.min(...amounts)}${Math.max(...amounts) > Math.min(...amounts) ? `–$${Math.max(...amounts)}` : ''}, depending on where it goes.` : 'Shipping is calculated at checkout.',
  };
}
/* the same facts in Icelandic: country names stay nominative inside parentheses, since
   "til" would need the genitive, which Intl's names do not give */
const regionIs = new Intl.DisplayNames(['is'], { type: 'region' });
const placesIs = codes => { const c = [...new Set(codes)]; const eu = EU.every(x => c.includes(x));
  return [...(eu ? ['ESB'] : []), ...c.filter(x => !(eu && EU.includes(x))).map(x => regionIs.of(x))]; };
function shippingIs(zs) {
  if (!zs || !zs.length) return null;
  const withFree = zs.filter(z => z.free), byAmount = {};
  for (const z of withFree) (byAmount[z.free] = byAmount[z.free] || []).push(z);
  const parts = Object.keys(byAmount).map(Number).map(amount => {
    const named = byAmount[amount].filter(z => z.id !== 0).flatMap(z => placesIs(z.codes));
    const rest = byAmount[amount].some(z => z.id === 0);
    return { amount, rest, text: `frá $${amount} ${named.length ? `(${named.join(', ')})` : ''}${rest ? (named.length ? ' og ' : '') + 'annars staðar' : ''}`.replace(/\s+/g, ' ').trim() };
  }).sort((a, b) => (a.rest - b.rest) || (a.amount - b.amount));
  const pickup = zs.filter(z => z.pickup && z.id !== 0).flatMap(z => z.codes);
  const amounts = withFree.map(z => z.free);
  return {
    deliveryIs: `Um allan heim${pickup.length ? (pickup.length === 1 && pickup[0] === 'IS' ? '; einnig hægt að sækja á Íslandi' : `; einnig hægt að sækja (${pickup.map(x => regionIs.of(x)).join(', ')})`) : ''}. ` + (parts.length ? `Frí sending ${parts.map(p => p.text).join('; ')}.` : ''),
    bagIs: amounts.length ? `Sendingarkostnaður reiknast við greiðslu og er frír frá $${Math.min(...amounts)}${Math.max(...amounts) > Math.min(...amounts) ? `–$${Math.max(...amounts)}` : ''}, eftir áfangastað.` : 'Sendingarkostnaður reiknast við greiðslu.',
  };
}
const ship = zones ? { ...shipping(zones), ...shippingIs(zones) } : null;
/* The customs catalogue lives in a local repository. Where it is not there (the scheduled run on
   GitHub), each product keeps the facts the last full pull gave it, and only price, stock and
   listing are refreshed; a product that is new since then gets no facts until a full pull. */
const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, 'utf8')) : null;
const dataFile = path.join(ROOT, 'assets/data.js');
const old = fs.existsSync(dataFile) ? new Function('window', fs.readFileSync(dataFile, 'utf8') + ';return window.CM;')({}) : null;
const oldById = new Map(((old && old.all) || []).map(p => [p.id, p]));
const curation = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/curation.json'), 'utf8'));

/* What the shop lists: published, visible in her catalogue, a simple product, with a name and a
   price. Anything published that is left out is named in the report with the reason, so nothing
   she publishes can vanish without a word. */
const offShop = [];
const why0 = p => {
  if (!['visible', 'catalog'].includes(p.catalog_visibility)) return 'hidden from her catalogue in WordPress';
  if (p.type !== 'simple') return `a ${p.type} product: the shop sells simple products (one product per size or colour)`;
  if (!String(p.name || '').trim()) return 'it has no name';
  if (p.price === '' || p.price == null || !(+p.price >= 0)) return 'it has no price';
  // its page lives at product/<slug>/; WordPress makes Icelandic letters plain, but a hand-typed
  // emoji or other script arrives percent-encoded and cannot be a folder name safely
  if (!/^[a-z0-9_-]+$/i.test(String(p.slug || ''))) return 'its web address (slug) has characters the shop cannot use: give it a plain one in WordPress';
  return '';
};
const listed = products
  .filter(p => { if (p.status !== 'publish') return false; const w = why0(p); if (w) offShop.push({ id: p.id, name: decode(p.name || '').trim() || '(no name)', why: w }); return !w; })
  .sort((a, b) => (a.menu_order - b.menu_order) || (a.id - b.id));

const texts = [], textIdx = new Map(), map = {}, care = {};
const addText = s => { if (!s) return -1; if (!textIdx.has(s)) { textIdx.set(s, texts.length); texts.push(s); } return textIdx.get(s); };
const why = { mat: {}, missing: [], partial: [], src: {}, notChosen: [], unknownDesign: [] };

const all = listed.map(p => {
  const cc = catalogue ? catalogue[p.id] || null : null;
  const prev = !catalogue ? oldById.get(p.id) || null : null;
  if (!cc && !prev) why.missing.push(p.id);
  const shortText = txt(p.short_description), longText = txt(p.description);
  const name = texturize(decode(p.name).replace(/\s+/g, ' ').trim()), cats = p.categories.map(c => c.slug);
  const comp = prev ? prev.comp : compositionOf(p, cc);
  // her choice in WordPress first (Design, Material); the name rules only where nothing is chosen
  const raw = p.sndr_shop && typeof p.sndr_shop === 'object' ? p.sndr_shop : null;
  // only text is a choice; anything else is reported and treated as not chosen
  // (the report is public: the product, never the stored value itself)
  if (raw && ((raw.design != null && typeof raw.design !== 'string') || (raw.material != null && typeof raw.material !== 'string'))) why.unknownDesign.push(`${p.id} ${name} (a value that is not text)`);
  const sel = raw ? { design: str(raw.design), material: str(raw.material) } : null;
  let fam = null, group = '', from = 'name rules';
  if (sel && sel.design) {
    if (FAM.has(sel.design)) { fam = FAM.get(sel.design); from = 'her choice'; }
    else if (/^other-/.test(sel.design) && GROUP_KEYS.has(sel.design.slice(6))) { group = sel.design.slice(6); from = 'her choice'; }
    else why.unknownDesign.push(`${p.id} ${name} (a design that does not exist)`);
  }
  if (from === 'name rules') { fam = familyOf(name, shortText + ' ' + longText); if (!sel || !sel.design) why.notChosen.push(`${p.id} ${name}`); }
  why.src[from] = (why.src[from] || 0) + 1;
  const chosenMat = sel && sel.material && MAT_KEYS.has(sel.material) ? sel.material : '';
  if (sel && sel.material && !chosenMat) why.unknownDesign.push(`${p.id} ${name} (a material that does not exist)`);
  const mat = chosenMat || (fam ? fam.material || (fam.said ? '' : materialOf(comp, name, cats)) : materialOf(comp, name, cats));
  const matWhy = !mat ? 'none' : chosenMat ? 'her choice' : fam && fam.material ? 'her sheet' : 'composition';
  why.mat[matWhy] = (why.mat[matWhy] || 0) + 1;
  const tyk = fam ? fam.group : group || groupOfType(prev ? prev.tyk : cc && (/\bneck ?warmer/i.test(p.name) ? 'neckwarmers' : cc.type));
  const price = +p.price || 0, regular = +p.regular_price || 0;
  const s = addText(shortText), l = addText(longText);
  map[p.id] = { s, l };
  if (l >= 0 && !(l in care)) { const c = careOf(longText); if (c) care[l] = c; }
  const o = {
    h: p.slug, t: name,
    p: price, cp: p.sale_price !== '' && regular > price ? regular : 0,
    img: [...new Set((p.images || []).map(i => String(i.src).split('?')[0]))].slice(0, 4),
    sz: [], comp, fam: fam ? fam.key : '', mat, tyk, id: p.id, live: true,
    oos: p.stock_status === 'outofstock', cats,
  };
  if (p.manage_stock && Number.isInteger(p.stock_quantity)) o.q = p.stock_quantity;
  const mi = prev ? prev.mi : originOf(p, cc, shortText, longText); if (mi) o.mi = mi;
  return o;
});

// Pools feed the category tiles: in stock, photographed, one per family in turn (hers, else her
// most specific category), in her own shop order.
const catCount = {}; all.forEach(p => p.cats.forEach(c => { catCount[c] = (catCount[c] || 0) + 1; }));
const family = p => p.fam || p.cats.slice().sort((a, b) => catCount[a] - catCount[b])[0] || '';
function pool(items, n = 24) {
  const groups = new Map();
  for (const p of items) if (!p.oos && p.img[0]) { const f = family(p); if (!groups.has(f)) groups.set(f, []); groups.get(f).push(p.h); }
  const out = [], lists = [...groups.values()];
  for (let r = 0; out.length < n && lists.some(l => l.length > r); r++) for (const l of lists) if (l[r] && out.length < n) out.push(l[r]);
  return out;
}
// her nine materials in her ranking, her groups and families in her sheet's order; the ones with
// nothing listed yet stay in, with a count of 0, for the pages to leave out
const materials = MATERIALS.map(({ key, name, is }) => { const items = all.filter(p => p.mat === key); return { key, name, is, count: items.length, pool: pool(items) }; });
const groups = G.groups.map(({ key, name, is }) => { const items = all.filter(p => p.tyk === key); return { key, name, is, count: items.length, pool: pool(items) }; });
const families = [...G.families, ...addedFams].map(f => ({ key: f.key, name: f.name, is: f.is, group: f.group, mat: f.material || '', ...(f.said ? { said: f.said, saidIs: f.saidIs } : {}),
  ...(f.sizes ? { sizes: f.sizes } : {}), goes: f.goes || [], ...(f.added ? { added: true } : {}), count: all.filter(p => p.fam === f.key).length }));
const { _about, ...bespoke } = G.bespoke;

const byId = new Map(all.map(p => [p.id, p]));
const dropped = [];
const picks = ids => ids.filter(id => byId.has(id) || (dropped.push(id), false)).map(id => byId.get(id).h);
const CM = {
  all, featuredNew: picks(curation.featuredNew), own: picks(curation.own), materials, groups, families, bespoke,
  hero: curation.hero, campaign: curation.campaign, wall: curation.wall,
  totalCount: all.length, saleCount: all.filter(p => p.cp > 0 && !p.oos).length,
  retired: dropped, harvestedAt: new Date().toISOString().slice(0, 10), source, ship,
  made: curation.made || null, // made-for-you prices from Anna, per row of her bespoke list; null until she sets them
};

/* ── report, against what the pages show today ──────────────────────────── */
const L = [];
L.push(`Source: ${source}`, `Products: ${products.length} in WooCommerce, ${all.length} listed (published, visible, simple), ${CM.saleCount} on sale, ${all.filter(p => p.oos).length} sold out`);
L.push(`Composition stated: ${all.filter(p => p.comp).length} · type known: ${all.filter(p => p.tyk).length} · origin stated: ${all.filter(p => p.mi).length} · care text: ${Object.keys(care).length} texts`);
L.push(`Design from: ${Object.entries(why.src).map(([k, v]) => `${k} ${v}`).join(', ')}${lists ? `; her lists ${lists.version || '?'} (${addedFams.length} design(s) she added)` : `; her lists not read (${listsWhy})`}`);
L.push(`Her material from: ${Object.entries(why.mat).map(([k, v]) => `${k} ${v}`).join(', ')}`);
L.push(`Her groups: ${groups.map(t => `${t.key} ${t.count}`).join(', ')}; none ${all.filter(p => !p.tyk).length}`);
L.push(`Her materials: ${materials.map(m => `${m.key} ${m.count}`).join(', ')}`);
L.push(`Her families: ${families.filter(f => f.count).length} of ${families.length} have listed pieces; ${all.filter(p => p.fam).length} of ${all.length} pieces joined`);
L.push(`  nothing listed yet: ${families.filter(f => !f.count).map(f => f.name).join(', ')}`);
L.push(`  not in her sheet (${all.filter(p => !p.fam).length}): ${all.filter(p => !p.fam).map(p => `${p.id} ${p.t}`).join(' | ')}`);
if (why.partial.length) L.push(`Composition withheld (does not add up to 100%) for ${why.partial.length}: ${[...new Set(why.partial.map(x => x.replace(/^\d+ /, '')))].join('; ')}`);
if (all.some(p => !p.img.length)) L.push(`No photo in WooCommerce: ${all.filter(p => !p.img.length).map(p => `${p.id} ${p.t}`).join(', ')}`);
if (why.missing.length) L.push(catalogue ? `Not in the customs catalogue (nothing claimed; rebuild it from a newer pull): ${why.missing.join(', ')}` : `New since the last full pull, no facts yet (run a full pull): ${why.missing.join(', ')}`);
if (dropped.length) L.push(`Curated picks no longer listed, dropped: ${dropped.join(', ')}`);
if (!catalogue) L.push(`No customs catalogue here (${path.relative(WS, CATALOGUE)}): facts carried over from the last full pull; prices, stock and listing refreshed.`);
if (old) {
  const added = all.filter(p => !oldById.has(p.id)).map(p => p.id), gone = old.all.filter(p => !byId.has(p.id)).map(p => p.id);
  const changed = { p: [], cp: [], oos: [], fam: [], mat: [], tyk: [], comp: [] };
  for (const p of all) { const o = oldById.get(p.id); if (!o) continue; for (const k of Object.keys(changed)) if (String(o[k]) !== String(p[k])) changed[k].push(p.id); }
  L.push(`Against the current data.js (${old.harvestedAt}): +${added.length} −${gone.length}; changed ${Object.entries(changed).map(([k, v]) => `${k} ${v.length}`).join(', ')}`);
  if (added.length) L.push(`  new: ${added.slice(0, 20).join(', ')}${added.length > 20 ? ' …' : ''}`);
  if (gone.length) L.push(`  gone: ${gone.slice(0, 20).join(', ')}${gone.length > 20 ? ' …' : ''}`);
  for (const k of ['fam', 'mat', 'tyk', 'comp']) for (const id of changed[k].slice(0, 3)) {
    const o = oldById.get(id), n = byId.get(id); L.push(`  ${k} #${id} ${JSON.stringify(o[k])} → ${JSON.stringify(n[k])}  (${n.t})`);
  }
}
console.log(L.join('\n'));

/* ── the shop report, in plain words, for Sindri and Anna ───────────────── */
// No clock in it: the file only changes (and is committed) when what it says changes. It is public
// with the site, so a piece that is not on the site is named by its WordPress id only.
const H = [`# Shop report`, ``, `${source} · ${all.length} pieces on the shop`, ``];
// every line, never a truncated list: the report promises that each piece left off is named
const section = (title, lines, note) => { if (!lines.length) return; H.push(`## ${title} (${lines.length})`, '', ...(note ? [note, ''] : []), ...lines.map(l => `- ${l}`), ''); };
section('Published but not on the shop', offShop.map(x => `#${x.id}: ${x.why}`), 'By WordPress id (Products, then search the id, or open post.php?post=<id>&action=edit). Everything else she publishes is on the shop.');
section('On the shop, but no design chosen', why.notChosen, 'Listed by its name for now. In WordPress: Products, filter "Not chosen", choose a Design.');
section('Design or material that no longer exists', why.unknownDesign, 'Probably a design that was deleted or renamed. Listed by its name for now; choose a design again.');
// only designs a listed piece uses: a planned line she has not published stays out of this public file
section('Designs she added without an Icelandic name', addedFams.filter(f => f.isMissing && all.some(p => p.fam === f.key)).map(f => `${f.name} (${f.key})`), 'The Icelandic shop shows the English name until one is added under Products, Shop designs.');
section('No photo', all.filter(p => !p.img.length).map(p => `${p.t} (#${p.id})`), 'On the shop without a picture; add one in WordPress.');
section('New since the last full read: no composition or origin line yet', why.missing.map(String), 'Shown without those two lines until the next full catalogue read; nothing else is missing.');
if (lists && lists.version && lists.version !== SHEET_VERSION) section('Her WordPress has an older list of designs than the storefront', [`WordPress ${lists.version}, storefront ${SHEET_VERSION}`], 'A design added to tools/groups.json cannot be chosen in WordPress yet: run tools/shop-fields-json.mjs and put the new sndr-shop-fields.json on her site.');
section('Designs kept from the last read', keptFromLast, 'Products still name these designs, but the list from WordPress left them out this time.');
if (!lists) section('Her design lists could not be read', [listsWhy || 'unknown'], 'Designs from her sheet still hold; a design she added herself falls back to the name rules until this is fixed.');
if (H.length === 4) H.push('Nothing needs attention.', '');

if (flag('--dry')) { console.log('\n' + H.join('\n') + '\n--dry: nothing written'); process.exit(0); }
fs.mkdirSync(path.join(ROOT, 'reports'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'reports/shop-health.md'), H.join('\n'));
fs.writeFileSync(dataFile, 'window.CM = ' + JSON.stringify(CM) + ';\n');
fs.writeFileSync(path.join(ROOT, 'assets/copy.js'), 'window.CMCOPY = ' + JSON.stringify({ texts, map, care }) + ';\n');
console.log(`\nWrote assets/data.js (${(fs.statSync(dataFile).size / 1024).toFixed(0)} KB) and assets/copy.js`);
