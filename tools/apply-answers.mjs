/* Applies Anna's questions file (tools/answers-2026-09-25.json) to a local WooCommerce: the names
   customers see, the pieces that leave the web shop, the private listings she said to delete, two
   typing slips, and her shipping wishes. Her own words for each change are in that file.

     node tools/apply-answers.mjs --woo http://127.0.0.1:9410      a local stack (test token)
     add --dry to print the plan and write nothing

   Running it again changes nothing that is already right. Every value it replaces is written
   first to 04-platform/mjuk-woo-sandbox/local/ (a journal, private), so each step can be undone by
   hand. Never her live shop: there, each part is a launch step with her yes. Only published pieces
   are renamed or taken off the web shop, so her own drafts and "(Copy)" products stay as they are. */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const WS = path.resolve(ROOT, '../..');
const args = process.argv.slice(2);
const opt = f => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };
const dry = args.includes('--dry');
const base = (opt('--woo') || '').replace(/\/$/, '');
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base)) { console.error('--woo must be a local stack, e.g. http://127.0.0.1:9410'); process.exit(2); }
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

const A = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/answers-2026-09-25.json'), 'utf8'));
const plain = s => String(s || '').replace(/<[^>]+>/g, ' ').replace(/&#8217;|&rsquo;/g, '’').replace(/&#8220;|&ldquo;/g, '“').replace(/&#8221;|&rdquo;/g, '”')
  .replace(/&amp;/g, '&').replace(/&#8211;/g, '–').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();

const products = [];
for (let page = 1, pages = 1; page <= pages; page++) {
  const r = await api(`/wc/v3/products?per_page=100&page=${page}&status=any&orderby=id&order=asc&_fields=id,name,status,short_description,description,sndr_shop`);
  pages = r.pages; products.push(...r.body);
}
const byId = new Map(products.map(p => [p.id, p]));
const journal = { stack: base, at: new Date().toISOString(), products: [], zones: [] };
const plan = new Map();   // id → { changes, why[] }
const want = (p, key, value, why) => {
  const e = plan.get(p.id) || { id: p.id, name: plain(p.name), set: {}, why: [] };
  e.set[key] = value; e.why.push(why); plan.set(p.id, e);
};

// 1. names (published pieces only); a rename that would change nothing is skipped
const RENAMES = A.renames.map(r => ({ ...r, re: new RegExp(r.find, 'i') }));
for (const p of products) {
  if (p.status !== 'publish') continue;
  let name = plain(p.name);
  const hits = [];
  for (const r of RENAMES) if (r.re.test(name)) { name = name.replace(r.re, r.to).replace(/\s+/g, ' ').trim(); hits.push(r.q); }
  if (hits.length && name !== plain(p.name)) want(p, 'name', name, `${hits.join('+')} rename`);
}
// 2. design (the shop-fields Design dropdown) where her answer names it
for (const d of A.design) {
  const re = new RegExp(d.find, 'i');
  for (const p of products) if (p.status === 'publish' && re.test(plain(p.name)) && (!p.sndr_shop || p.sndr_shop.design !== d.design))
    want(p, 'sndr_shop', { design: d.design, material: '' }, `${d.q} design`);
}
// 3. off the web shop: published → draft (the page goes, the product stays in WordPress)
for (const o of A.offWeb) {
  const nre = new RegExp(o.name, 'i'), tre = o.text ? new RegExp(o.text, 'i') : null;
  for (const p of products) if (p.status === 'publish' && nre.test(plain(p.name)) && (!tre || tre.test(plain(p.short_description) + ' ' + plain(p.description))))
    want(p, 'status', 'draft', `${o.q} off the web shop`);
}
// 4. the private listings: into WooCommerce's bin (undoable), never deleted for good
const trash = A.trash.ids.filter(id => byId.has(id) && byId.get(id).status !== 'trash');
const missing = A.trash.ids.filter(id => !byId.has(id));

// 5. shipping zones
const zones = (await api('/wc/v3/shipping/zones')).body;
const zplan = [];
for (const z of zones) {
  // zone 0 is "Locations not covered by your other zones": her rest of the world (Q1 names it too)
  const methods = (await api(`/wc/v3/shipping/zones/${z.id}/methods`)).body;
  const free = methods.find(m => m.method_id === 'free_shipping');
  if (free) {
    // free shipping first: WooCommerce ticks the first rate a customer qualifies for (Q1)
    const order = [free, ...methods.filter(m => m !== free).sort((a, b) => a.order - b.order)];
    order.forEach((m, i) => { if (m.order !== i + 1) zplan.push({ zone: z.name, z: z.id, m, set: { order: i + 1 }, before: { order: m.order }, why: 'Q1 free shipping first' }); });
  }
  if (z.name === A.shipping.iceland.zone && free) {
    const s = free.settings || {};
    const cur = { requires: s.requires && s.requires.value, min_amount: s.min_amount && s.min_amount.value };
    if (cur.requires !== 'min_amount' || +cur.min_amount !== A.shipping.iceland.freeFrom)
      zplan.push({ zone: z.name, z: z.id, m: free, set: { settings: { requires: 'min_amount', min_amount: String(A.shipping.iceland.freeFrom) } }, before: { settings: cur }, why: 'Q17 Iceland free from $100' });
  }
  if (z.id && z.name === A.shipping.norway.zone) {
    const locs = (await api(`/wc/v3/shipping/zones/${z.id}/locations`)).body;
    if (!locs.some(l => l.type === 'country' && l.code === A.shipping.norway.add))
      zplan.push({ zone: z.name, z: z.id, locations: [...locs.map(l => ({ code: l.code, type: l.type })), { code: A.shipping.norway.add, type: 'country' }], before: { locations: locs }, why: 'Q2 Norway in the European zone' });
  }
}
const zoneNames = new Set(zones.map(z => z.name));
for (const k of ['norway', 'iceland']) if (!zoneNames.has(A.shipping[k].zone)) console.log(`NOTE: no zone named "${A.shipping[k].zone}" on this stack (${k})`);

const P = [...plan.values()];
const count = k => P.filter(e => k in e.set).length;
console.log(`${base}: ${products.length} products`);
console.log(`rename ${count('name')}, design ${count('sndr_shop')}, off the web shop ${count('status')}, to the bin ${trash.length}${missing.length ? ` (already in the bin, or not on this stack: ${missing.join(', ')})` : ''}, shipping ${zplan.length}`);
for (const e of P) console.log(`  ${e.id} ${e.name}${e.set.name ? ` → ${e.set.name}` : ''}${e.set.status ? ' → draft' : ''}${e.set.sndr_shop ? ` → design ${e.set.sndr_shop.design}` : ''}  [${e.why.join(', ')}]`);
for (const id of trash) console.log(`  ${id} ${plain(byId.get(id).name)} → bin  [${A.trash.q}]`);
for (const z of zplan) console.log(`  zone "${z.zone}": ${z.locations ? 'add Norway' : z.m.method_id + ' ' + JSON.stringify(z.set)}  [${z.why}]`);
if (dry) { console.log('--dry: nothing written'); process.exit(0); }

// the journal first: what each value was before
for (const e of P) { const p = byId.get(e.id); journal.products.push({ id: e.id, before: { name: p.name, status: p.status, sndr_shop: p.sndr_shop }, after: e.set }); }
for (const id of trash) journal.products.push({ id, before: { status: byId.get(id).status }, after: { status: 'trash' } });
for (const z of zplan) journal.zones.push({ zone: z.zone, id: z.z, method: z.m ? z.m.instance_id : null, before: z.before, after: z.set || { locations: z.locations } });
const jdir = path.join(WS, '04-platform/mjuk-woo-sandbox/local');
const jfile = path.join(jdir, `answers-journal-${base.replace(/\D+/g, '-').replace(/^-|-$/g, '')}-${journal.at.replace(/[:.]/g, '-')}.json`);
fs.writeFileSync(jfile, JSON.stringify(journal, null, 1));
console.log(`journal: ${path.relative(WS, jfile)}`);

for (let i = 0; i < P.length; i += 50) {
  const update = P.slice(i, i + 50).map(e => ({ id: e.id, ...e.set }));
  const r = (await api('/wc/v3/products/batch', { method: 'POST', body: JSON.stringify({ update }) })).body;
  const errs = (r.update || []).filter(x => x.error);
  if (errs.length) { console.error('batch errors:', JSON.stringify(errs.slice(0, 3))); process.exit(1); }
}
for (const id of trash) await api(`/wc/v3/products/${id}`, { method: 'DELETE' });   // no force: the bin
for (const z of zplan) {
  if (z.locations) await api(`/wc/v3/shipping/zones/${z.z}/locations`, { method: 'PUT', body: JSON.stringify(z.locations) });
  else await api(`/wc/v3/shipping/zones/${z.z}/methods/${z.m.instance_id}`, { method: 'PUT', body: JSON.stringify(z.set) });
}

// read back
const back = new Map();
for (let page = 1, pages = 1; page <= pages; page++) {
  const r = await api(`/wc/v3/products?per_page=100&page=${page}&status=any&_fields=id,name,status,sndr_shop`);
  pages = r.pages; for (const p of r.body) back.set(p.id, p);
}
const wrong = [];
for (const e of P) { const b = back.get(e.id) || {};
  if (e.set.name && plain(b.name) !== e.set.name) wrong.push(`${e.id} name "${plain(b.name)}"`);
  if (e.set.status && b.status !== e.set.status) wrong.push(`${e.id} status ${b.status}`);
  if (e.set.sndr_shop && (!b.sndr_shop || b.sndr_shop.design !== e.set.sndr_shop.design)) wrong.push(`${e.id} design`); }
for (const id of trash) { const b = back.get(id); if (b && b.status !== 'trash') wrong.push(`${id} not in the bin (${b.status})`); }
const zback = (await api('/wc/v3/shipping/zones')).body;
for (const z of zplan) {
  if (z.locations) { const l = (await api(`/wc/v3/shipping/zones/${z.z}/locations`)).body; if (!l.some(x => x.code === A.shipping.norway.add)) wrong.push(`zone ${z.zone}: Norway missing`); }
  else { const m = (await api(`/wc/v3/shipping/zones/${z.z}/methods/${z.m.instance_id}`)).body;
    if (z.set.order && m.order !== z.set.order) wrong.push(`zone ${z.zone} ${m.method_id} order ${m.order}`);
    if (z.set.settings && (m.settings.min_amount.value !== z.set.settings.min_amount || m.settings.requires.value !== 'min_amount')) wrong.push(`zone ${z.zone} free shipping amount`); }
}
console.log(wrong.length ? `READ-BACK MISMATCH (${wrong.length}): ${wrong.slice(0, 8).join(' | ')}` : `read back: everything as written (${zback.length} zones checked)`);
process.exit(wrong.length ? 1 : 0);
