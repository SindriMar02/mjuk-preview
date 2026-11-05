/* Pure, repeatable storefront choices. Woo titles are retained in wt; price/stock stay real. */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const { listed } = createRequire(import.meta.url)('../catalogue.js');
const ROOT = path.resolve(import.meta.dirname, '..');
export const ANSWERS = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/answers-2026-09-25.json'), 'utf8'));
// Shared with the pull BEFORE family classification. Private removals never carry a name.
export function answerProduct(input, text = '') {
  const p = { ...input }, original = p.wt || p.t;
  if (ANSWERS.trash.ids.includes(p.id)) return { removal: `- Hidden #${p.id}: off the web shop: Anna ${ANSWERS.trash.q} (${ANSWERS.trash.why}).` };
  for (const r of ANSWERS.offWeb) if (new RegExp(r.name, 'i').test(original) && (!r.text || new RegExp(r.text, 'i').test(text))) {
    return { removal: `- Hidden #${p.id}: ${original} — off the web shop: Anna ${r.q} (${r.why}).` };
  }
  p.t = original;
  for (const r of ANSWERS.renames) p.t = p.t.replace(new RegExp(r.find, 'i'), r.to).trim();
  if (p.t !== original) p.wt = original;
  const design = ANSWERS.design.find(r => new RegExp(r.find, 'i').test(original));
  if (design) p.fam = design.design;
  return { product: p };
}
const description = (copy, id) => [copy?.map?.[id]?.s, copy?.map?.[id]?.l].map(i => copy?.texts?.[i] || '').join(' ');
const cleanTitle = s => s.replace(/\s*\.\s*/g, '. ').replace(/\s+/g, ' ').trim().replace(/\.+$/, '');
const colourKey = s => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
export function applyChoices(input, groups, copy = {}) {
  const CM = structuredClone(input), findings = [];
  CM.all = CM.all.flatMap(p => {
    const answer = answerProduct(p, description(copy, p.id));
    if (answer.removal) { findings.push(answer.removal); return []; }
    p = answer.product;
    if (p.wt && p.wt !== p.t) findings.push(`- Renamed #${p.id}: ${p.wt} → ${p.t} — Anna 25 Sep.`);
    const design = groups.families?.find(f => f.key === p.fam);
    if (ANSWERS.design.some(r => new RegExp(r.find, 'i').test(p.wt || p.t)) && design) {
      p.tyk = design.group; p.mat = design.material || '';
      if (design.comp) p.comp = design.comp;
      if (design.alsoMaterials) p.mx = design.alsoMaterials.filter(k => k !== p.mat);
    }
    return [p];
  });
  // Recompute derived choice fields from the unchanged Woo title/categories every time.
  CM.all.forEach(p => { for (const k of ['choiceOf', 'choiceTitle', 'choiceLabel', 'choiceLabelIs', 'choices', 'choiceName', 'choiceNameIs']) delete p[k]; });
  for (const rule of groups.families || []) {
    const family = (CM.families || []).find(f => f.key === rule.key);
    if (family) family.goes = [...(rule.goes || [])];
    if (rule.comp) CM.all.filter(p => p.fam === rule.key).forEach(p => { p.comp = rule.comp; });
    if (rule.hide) CM.all = CM.all.filter(p => {
      if (p.fam !== rule.key || (rule.hide.name && !new RegExp(rule.hide.name, 'i').test(p.t))) return true;
      findings.push(`- Hidden #${p.id}: ${p.t} — off the web shop: ${rule.hide.why}.`); return false;
    });
    if (!rule.choice) continue;
    const c = rule.choice, colours = new Map();
    for (const p of CM.all.filter(p => p.fam === rule.key)) {
      // Explicit ids can assign an unmarked member; categories alone must not swallow pompom hats.
      const option = c.options.findIndex(o => (o.ids || []).includes(p.id) || (o.name ? new RegExp(o.name, 'i').test(p.t) : (p.cats || []).includes(o.cat)));
      if (option < 0) continue;
      const assigned = (c.options[option].ids || []).includes(p.id);
      if (assigned) findings.push(`- Assigned #${p.id}: ${p.t} — ${c.options[option].label}; ${c.options[option].why}.`);
      if (!assigned && c.options[option].cat && !(p.cats || []).includes(c.options[option].cat)) findings.push(`- Category mismatch #${p.id}: ${p.t} — title says ${c.options[option].label}, but ${c.options[option].cat} is missing; title used.`);
      const title = cleanTitle(p.t.replace(new RegExp(c.strip, 'gi'), ''));
      const key = colourKey(title);
      if (!colours.has(key)) colours.set(key, []);
      colours.get(key).push({ p, option, title });
    }
    for (const members of colours.values()) {
      const winners = c.options.map((_, i) => members.filter(m => m.option === i).sort((a, b) => Number(!!a.p.oos) - Number(!!b.p.oos) || (b.p.img || []).filter(Boolean).length - (a.p.img || []).filter(Boolean).length || a.p.id - b.p.id)[0]).filter(Boolean);
      const primary = winners.find(m => !m.p.oos) || winners[0];
      const options = winners.map(m => ({ label: c.options[m.option].label, is: c.options[m.option].is, h: m.p.h, p: m.p.p, oos: !!m.p.oos }));
      // Only a colour sold in BOTH linings becomes one item with a choice. A colour in one lining keeps her own name
      // ("Ragnar hat with fleece. White"): stripping the marker hid the lining and made it look like her unmarked
      // "Ragnar hat. White" twice (Claude scenario run A, 5 Nov). Same-lining duplicates are still kept off the shop.
      if (winners.length < 2) {
        for (const m of members) if (m !== primary) {
          m.p.choiceOf = primary.p.h;
          findings.push(`- Duplicate hidden #${m.p.id}: ${m.p.t} — ${c.options[m.option].label}; kept #${primary.p.id} (stock, photos, then lowest id).`);
        }
        findings.push(`- ${primary.p.t}: only ${c.options[primary.option].label} in her shop, name kept. #${primary.p.id}.`);
        continue;
      }
      for (const m of members) {
        Object.assign(m.p, { choiceTitle: primary.title, choiceLabel: c.options[m.option].label, choiceLabelIs: c.options[m.option].is });
        if (m !== primary) m.p.choiceOf = primary.p.h;
        if (!winners.includes(m)) findings.push(`- Duplicate hidden #${m.p.id}: ${m.p.t} — ${c.options[m.option].label}; kept #${winners.find(w => w.option === m.option).p.id} (stock, photos, then lowest id).`);
      }
      Object.assign(primary.p, { choiceName: c.name, choiceNameIs: c.is, choices: options });
      findings.push(`- ${primary.title}: ${options.map(o => `${o.label} #${winners.find(m => m.p.h === o.h).p.id}${o.oos ? ' (sold out)' : ''}`).join('; ')}. Primary #${primary.p.id}.`);
    }
  }
  // These material names are supported by the product's title/family, never inferred percentages.
  for (const p of CM.all) if (/pompoms$/.test(p.fam || '')) {
    const words = p.t + ' ' + p.fam;
    const material = /merino/i.test(words) ? 'Merino wool' : /raccoon/i.test(words) ? 'Raccoon fur' : /polar.?fox/i.test(words) ? 'Polar fox fur' : '';
    if (material) p.pomMaterial = material;
  }
  const visible = listed(CM), handles = new Set(visible.map(p => p.h));
  const byHandle = new Map(CM.all.map(p => [p.h, p]));
  const pool = hs => [...new Set((hs || []).map(h => byHandle.get(h)?.choiceOf || h).filter(h => handles.has(h)))];
  for (const k of ['featuredNew', 'own']) if (CM[k]) CM[k] = pool(CM[k]);
  for (const [key, predicate] of [['families', (p, x) => p.fam === x.key], ['groups', (p, x) => p.tyk === x.key], ['materials', (p, x) => p.mat === x.key || (p.mx || []).includes(x.key)]]) {
    for (const x of CM[key] || []) { x.count = visible.filter(p => predicate(p, x)).length; if (x.pool) x.pool = pool(x.pool); }
  }
  CM.totalCount = visible.length;
  CM.saleCount = visible.filter(p => p.cp > 0 && !p.oos).length;
  // Retain removal findings after an in-place run, even though those raw products are now absent.
  CM.choiceRemovals = [...new Set([...(input.choiceRemovals || []), ...findings.filter(s => s.startsWith('- Hidden '))])].sort();
  return { CM, findings: [...CM.choiceRemovals, ...findings.filter(s => !s.startsWith('- Hidden '))] };
}
// Copy is a separate input: applyChoices itself depends only on raw catalogue fields for merging.
export function applyFamilyVideos(CM, COPY) {
  for (const f of CM.families || []) {
    delete f.video;
    const products = CM.all.filter(p => p.fam === f.key), counts = new Map();
    for (const p of products) {
      const m = COPY.map[p.id] || {};
      const ids = [...new Set([m.s, m.l].flatMap(i => [...(COPY.texts[i] || '').matchAll(/⟦video:([\w-]{6,20})⟧/g)].map(m => m[1])))];
      if (ids.length === 1) counts.set(ids[0], (counts.get(ids[0]) || 0) + 1);
    }
    const majority = [...counts].find(([, n]) => n > products.length / 2);
    if (majority) f.video = majority[0];
  }
}
export const choicesReport = (findings, CM) => '# Catalogue choices — Anna / Veronika, 5 November 2026\n\n' + [...findings, ...(CM?.families || []).filter(f => f.video).map(f => `- Family video: ${f.name} — ${f.video}; shown when a product has no video of its own.`)].join('\n') + '\n';
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const window = {};
  for (const f of ['assets/data.js', 'assets/copy.js']) vm.runInNewContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), { window });
  const result = applyChoices(window.CM, JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/groups.json'), 'utf8')), window.CMCOPY);
  applyFamilyVideos(result.CM, window.CMCOPY);
  fs.writeFileSync(path.join(ROOT, 'assets/data.js'), 'window.CM = ' + JSON.stringify(result.CM) + ';\n');
  fs.writeFileSync(path.join(ROOT, 'reports/choices.md'), choicesReport(result.findings, result.CM));
  console.log(`Choices: ${result.CM.all.length} raw records; ${result.CM.totalCount} listed; ${result.findings.length} rule findings.`);
}
