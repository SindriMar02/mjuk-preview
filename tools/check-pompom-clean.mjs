import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const start = app.indexOf('  const clean = l => {');
const end = app.indexOf('\n  const load =', start);
assert(start >= 0 && end > start, 'bag clean() source is present');
const declaration = app.slice(start, end).replace(/^  const clean = l => /, 'const clean = l => ');
const clean = new Function('byHandle', 'str', 'MAX_EACH', `${declaration}; return clean;`) (
  {
    hat: { h: 'hat', t: 'Hat with pompom', p: 100, img: ['hat.jpg'] },
    pom1: { h: 'pom1', t: 'Pompom. Ivory', p: 29 },
    pom2: { h: 'pom2', t: 'Pompom. Lilac', p: 29 },
  },
  (v, n = 200) => typeof v === 'string' ? v.slice(0, n) : '',
  20,
);
const stale = clean({ h: 'hat', q: 1, x: { n: 1, mode: 'attach', price: 58, pompoms: [
  { h: 'pom1', name: 'Ivory' }, { h: 'pom2', name: 'Lilac' },
] } });
assert.equal(stale.x.pompoms.length, 1, 'a stale One line drops its second pompom');
assert.equal(stale.x.pompoms[0].h, 'pom1');
assert.equal(stale.x.price, 29, 'the normalized line price matches its one kept pompom');

const is = JSON.parse(readFileSync(new URL('../tools/is.json', import.meta.url), 'utf8'));
for (const [en, translated] of Object.entries({
  'Pompom': 'Dúskur', 'Replace the pompom shown': 'Skipta út dúsknum á myndinni', 'As shown': 'Eins og á mynd', 'Change colour': 'Annar litur',
  'Choose a new pompom to replace the one shown on this hat.': 'Veldu nýjan dúsk í stað þess sem er á þessari húfu.',
  'New pompom: {a}, {b} (replaces the one shown)': 'Nýr dúskur: {a}, {b} (kemur í stað þess sem er á myndinni)',
  '{a}, {b}': '{a}, {b}',
})) assert.equal(is[en], translated, `Icelandic entry matches for ${en}`);
const localeContext = { window: {} };
vm.runInNewContext(readFileSync(new URL('../assets/i18n-is.js', import.meta.url), 'utf8'), localeContext);
for (const en of Object.keys(is).filter(k => ['Pompom', 'Replace the pompom shown', 'As shown', 'Change colour', 'Choose a new pompom to replace the one shown on this hat.', 'New pompom: {a}, {b} (replaces the one shown)', '{a}, {b}'].includes(k))) {
  assert.equal(localeContext.window.CMI18N[en], is[en], `runtime locale matches tools/is.json for ${en}`);
}

const dataContext = { window: {} };
vm.runInNewContext(readFileSync(new URL('../assets/data.js', import.meta.url), 'utf8'), dataContext);
const makePdp = (await import('../pdp.js')).default;
const cm = dataContext.window.CM;
const pdp = makePdp({ CM: cm, COPY: { map: {}, texts: [], care: [] }, t: x => x, isIS: false, px: x => x, usd: n => '$' + n });
const hat = cm.all.find(p => p.tyk === 'hats' && /pom ?pom/i.test(p.t) && !p.oos);
const plainHat = cm.all.find(p => p.tyk === 'hats' && !/pom ?pom/i.test(p.t) && !p.oos);
assert.match(pdp.view(hat).info, /As shown[\s\S]*Change colour/, 'pompom hats render the as-shown and swap control');
assert.match(pdp.view(plainHat).info, /None[\s\S]*One[\s\S]*Two/, 'plain hats keep the None / One / Two flow');
console.log('pompom clean and locale checks passed');
