/* Fills the two shop-fields dropdowns (Design, Material) on every product, once, so that on the day
   the plugin goes on her shop nothing moves: each listed piece gets exactly the design and material
   the shop shows today (assets/data.js), and a piece that is not listed (draft, hidden, a variable
   product) gets what the name rules in tools/groups.json give it.

     node tools/shop-fields-fill.mjs --woo http://127.0.0.1:9420     a local stack (test token)
     add --dry to print the plan and write nothing; --overwrite to replace values already chosen

   Only products whose Design is still empty are written, unless --overwrite: running it again
   never undoes a choice she made in WordPress. Her live shop is not a target here: filling it is a
   launch step with her yes and a write key, run the same way against her address. */
import fs from 'node:fs';
import path from 'node:path';
import { G, familyOf, materialOf, groupOfType } from './groups.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const WS = path.resolve(ROOT, '../..');
const args = process.argv.slice(2);
const opt = f => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };
const flag = f => args.includes(f);
const base = (opt('--woo') || '').replace(/\/$/, '');
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base)) { console.error('--woo must be a local stack, e.g. http://127.0.0.1:9420'); process.exit(2); }
const TOKEN = fs.readFileSync(path.join(WS, '04-platform/mjuk-woo-sandbox/local/test.env'), 'utf8').match(/TEST_TOKEN=(\S+)/)[1];
const H = { 'X-SNDR-Test': TOKEN, Cookie: 'playground_auto_login_already_happened=1', 'Content-Type': 'application/json', Accept: 'application/json' };
const api = async (p, init = {}) => {
  // the token goes to the local stack only: a redirect is refused, never followed
  const r = await fetch(base + '/wp-json' + p, { ...init, headers: H, redirect: 'manual' });
  if (r.status >= 300 && r.status < 400) throw new Error(`${init.method || 'GET'} ${p} → ${r.status} redirect refused (${r.headers.get('location') || ''})`);
  const body = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`${init.method || 'GET'} ${p} → ${r.status} ${JSON.stringify(body).slice(0, 300)}`);
  return { body, pages: +r.headers.get('x-wp-totalpages') || 1 };
};

const lists = (await api('/sndr-shop/v1/lists')).body;
const designKeys = new Set(lists.designs.map(d => d.key)), groupKeys = new Set(lists.groups.map(g => g.key)), matKeys = new Set(lists.materials.map(m => m.key));
const famByKey = new Map(G.families.map(f => [f.key, f]));

globalThis.window = {};
new Function('window', fs.readFileSync(path.join(ROOT, 'assets/data.js'), 'utf8'))(globalThis.window);
const shown = new Map(window.CM.all.map(p => [p.id, p]));
const catalogue = (() => { const f = path.join(WS, '04-platform/mjuk-shipping/customs-catalogue.json'); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : {}; })();

const products = [];
for (let page = 1, pages = 1; page <= pages; page++) {
  const r = await api(`/wc/v3/products?per_page=100&page=${page}&status=any&orderby=id&order=asc&_fields=id,name,status,type,categories,short_description,description,sndr_shop`);
  pages = r.pages; products.push(...r.body);
}

const plain = s => String(s || '').replace(/<[^>]+>/g, ' ').replace(/&#8217;|&rsquo;/g, '’').replace(/&amp;/g, '&').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();
// what the fields should hold so the shop shows what it shows now
function choose(p) {
  const s = shown.get(p.id);
  if (s) {
    const fam = s.fam ? famByKey.get(s.fam) : null;
    const design = s.fam || (s.tyk ? 'other-' + s.tyk : '');
    const fromDesign = fam ? (fam.material || '') : null;   // what "From the design" would give
    const material = fam && (fam.said || s.mat === fromDesign) ? '' : (s.mat || '');
    return { design, material, why: 'shown today' };
  }
  const name = plain(p.name), cc = catalogue[p.id] || null;
  const fam = familyOf(name, plain(p.short_description) + ' ' + plain(p.description));
  const group = fam ? fam.group : groupOfType(cc && cc.type);
  const design = fam ? fam.key : (group ? 'other-' + group : '');
  const mat = fam ? (fam.material || fam.said ? '' : materialOf(cc && cc.composition, name, p.categories.map(c => c.slug))) : materialOf(cc && cc.composition, name, p.categories.map(c => c.slug));
  return { design, material: mat || '', why: 'name rules (not listed today)' };
}

const plan = [], skipped = { chosen: 0, same: 0 }, unknown = [], empty = [];
for (const p of products) {
  const cur = p.sndr_shop || { design: '', material: '' };
  const want = choose(p);
  if (want.design && !designKeys.has(want.design) && !(want.design.startsWith('other-') && groupKeys.has(want.design.slice(6)))) { unknown.push(`${p.id} ${want.design}`); continue; }
  if (want.material && !matKeys.has(want.material)) { unknown.push(`${p.id} material ${want.material}`); continue; }
  if (!want.design) empty.push(`${p.id} ${plain(p.name)} (${p.status})`);
  if (cur.design && !flag('--overwrite')) { skipped.chosen++; continue; }
  if (cur.design === want.design && cur.material === want.material) { skipped.same++; continue; }
  if (!want.design && !want.material) { skipped.same++; continue; }
  plan.push({ id: p.id, sndr_shop: { design: want.design, material: want.material }, why: want.why });
}

console.log(`${base}: ${products.length} products (${shown.size} listed in the shop today)`);
console.log(`to write ${plan.length} (${plan.filter(x => x.why === 'shown today').length} from what the shop shows, ${plan.filter(x => x.why !== 'shown today').length} from the name rules); already chosen ${skipped.chosen}; already right ${skipped.same}`);
if (unknown.length) console.log(`NOT written, key unknown to the plugin's lists (${unknown.length}): ${unknown.slice(0, 10).join(', ')}`);
if (empty.length) console.log(`no design found, left "Not chosen" (${empty.length}): ${empty.slice(0, 12).join(' | ')}${empty.length > 12 ? ' …' : ''}`);
if (flag('--dry')) { console.log('--dry: nothing written'); process.exit(0); }

for (let i = 0; i < plan.length; i += 50) {
  const update = plan.slice(i, i + 50).map(({ id, sndr_shop }) => ({ id, sndr_shop }));
  const r = (await api('/wc/v3/products/batch', { method: 'POST', body: JSON.stringify({ update }) })).body;
  const errs = (r.update || []).filter(x => x.error);
  if (errs.length) { console.error('batch errors:', JSON.stringify(errs.slice(0, 3))); process.exit(1); }
  process.stderr.write(`  wrote ${Math.min(i + 50, plan.length)}/${plan.length}\n`);
}
// read back: every planned value must now be on the product
const back = new Map();
for (let page = 1, pages = 1; page <= pages; page++) {
  const r = await api(`/wc/v3/products?per_page=100&page=${page}&status=any&_fields=id,sndr_shop`);
  pages = r.pages; for (const p of r.body) back.set(p.id, p.sndr_shop);
}
const wrong = plan.filter(x => { const b = back.get(x.id) || {}; return b.design !== x.sndr_shop.design || b.material !== x.sndr_shop.material; });
console.log(wrong.length ? `READ-BACK MISMATCH on ${wrong.length}: ${wrong.slice(0, 5).map(x => x.id).join(', ')}` : `read back: all ${plan.length} as written`);
process.exit(wrong.length ? 1 : 0);
