/* Anna's classification (tools/groups.json) as code: which of her families a product belongs to,
   and which of her nine materials it is in. Shared by tools/pull-woo.mjs (the site's data) and
   tools/groups-report.mjs (her list of what does not fit yet). */
import fs from 'node:fs';
import path from 'node:path';

export const G = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'groups.json'), 'utf8'));

const RULES = G.families.map(f => ({ f, name: new RegExp(f.match.name, 'i'), text: f.match.text ? new RegExp(f.match.text, 'i') : null }));
/* first family whose name rule matches the product name (and, where given, whose text rule
   matches the name or her text) */
export function familyOf(name, text = '') {
  for (const r of RULES) if (r.name.test(name) && (!r.text || r.text.test(name + ' ' + text))) return r.f;
  return null;
}

/* Where her sheet names no material for a family, the product's own composition decides, in her
   nine: a blend of cashmere and merino is her "Cashmere and merino wool"; one fibre at 90% or more
   is that fibre. With no composition, her own fibre category, when it names exactly one. Angora
   stays unassigned: only the family can tell fluffy from smooth. */
const FROM_CATEGORY = { 'merino-wool': 'merino', 'cashmere': 'cashmere', 'icelandic-wool': 'icelandic-wool', 'alpaca-and-silk': 'alpaca-silk' };
export function materialOf(comp, name, cats = []) {
  const c = String(comp || '').toLowerCase(), all = c + ' ' + String(name).toLowerCase();
  const pct = fibre => { const m = c.match(new RegExp('(\\d+)% ' + fibre)); return m ? +m[1] : 0; };
  if (/\balpaca\b/.test(all) && /\bsilk\b/.test(all)) return 'alpaca-silk';
  if (c) {
    if (pct('cashmere') && pct('merino')) return 'cashmere-merino';
    if (pct('cashmere') >= 90) return 'cashmere';
    if (pct('icelandic wool') >= 90) return 'icelandic-wool';
    if (pct('merino wool') >= 90) return 'merino';
    return '';
  }
  const byCat = [...new Set(cats.map(k => FROM_CATEGORY[k]).filter(Boolean))];
  return byCat.length === 1 ? byCat[0] : '';
}

/* the piece group when no family matched: the customs catalogue's type, in her groups */
const FROM_TYPE = { hats: 'hats', headbands: 'headbands', pompoms: 'pompoms', scarves: 'scarves', neckwarmers: 'scarves', gloves: 'gloves', mittens: 'gloves', blankets: 'blankets', capes: 'clothing', clothing: 'clothing' };
export const groupOfType = type => FROM_TYPE[type] || '';

/* her materials in her own ranking: prestige first, then popularity, then her sheet's order */
export const MATERIALS = G.materials.map((m, i) => ({ ...m, i }))
  .sort((a, b) => (b.prestige - a.prestige) || (b.popularity - a.popularity) || (a.i - b.i));
