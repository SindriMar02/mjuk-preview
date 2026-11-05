/* Offline contracts: no browser, server, requests or writes. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { ANSWERS, answerProduct, applyChoices, applyFamilyVideos } from './choices.mjs';
import { familyOf } from './groups.mjs';
const require = createRequire(import.meta.url), CAT = require('../catalogue.js'), make = require('../pdp.js');
const read = f => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const W = {};
for (const f of ['assets/data.js', 'assets/copy.js', 'assets/i18n-is.js']) vm.runInNewContext(read(f), { window: W });
const groups = JSON.parse(read('tools/groups.json'));
let checks = 0;
function check(name, fn) { fn(); checks++; console.log('PASS ' + name); }
const r = groups.families.find(f => f.key === 'ragnar-beanies');
const product = (id, title, option, extra = {}) => ({ id, h: 'piece-' + id, t: title, fam: r.key, cats: [r.choice.options[option]?.cat].filter(Boolean), img: [], p: 70, oos: false, tyk: 'hats', ...extra });
const fixture = { all: [
  product(1, 'Ragnar hat with fleece.Oatmeal.', 0, { oos: true }),
  product(2, 'Ragnar hat without fleece. Oatmeal', 1, { p: 60, img: ['unlined.jpg'] }),
  product(3, 'Ragnar hat with fleece. Oatmeal', 0, { img: ['lined.jpg'] }),
  product(4, 'Ragnar hat with fleece. Oatmeal.', 0, { img: ['lined.jpg'] }),
  product(5, 'Ragnar hat. White', -1),
  product(6, 'Ragnar hat with fleece. Black', 0, { oos: true }),
  product(7, 'Ragnar hat without fleece.Black', 1),
  product(8, 'Ragnar hat with fleece. Rose', 0, { oos: true }),
  product(9, 'Ragnar hat without fleece. Rose', 1, { oos: true }),
  { id: 10, h: 'aviator', t: 'Merino Aviator hat. White', fam: 'unisex-aviator' },
  { id: 11, h: 'merino-pom', t: 'Merino wool pompom. Blue', fam: 'merino-pompoms' },
], families: [{key:r.key}, {key:'unisex-aviator'}] };
const before = JSON.stringify(fixture), result = applyChoices(fixture, groups), F = result.CM;
check('pure fixture transform, normalized punctuation, duplicate priorities, unmarked hats', () => {
  assert.equal(JSON.stringify(fixture), before);
  assert.equal(CAT.listed(F).filter(p => /oatmeal/i.test(p.t)).length, 1);
  const p = F.all.find(p => p.id === 3); assert.equal(p.choices.length, 2);
  assert.equal(p.choiceTitle, 'Ragnar hat. Oatmeal');
  for (const id of [1,2,4]) assert.equal(F.all.find(p => p.id === id).choiceOf, p.h);
  assert(!F.all.find(p => p.id === 5).choices);
  assert.equal(F.all.find(p => p.id === 6).choiceOf, 'piece-7');
  assert(result.findings.some(s => s.includes('Duplicate hidden #1')));
  assert(result.findings.some(s => s.includes('Duplicate hidden #4')));
  assert(!F.all.some(p => p.id === 10));
  assert.equal(F.all.find(p => p.id === 11).pomMaterial, 'Merino wool');
});
check('stock first, then most photos, then lowest id; generic family rules', () => {
  const rule = {families:[{key:'other',choice:{...r.choice}}]};
  const input = {all:[product(20,'Other with fleece. Beige',0,{fam:'other',img:['a']}),product(21,'Other with fleece.Beige.',0,{fam:'other',img:['a','b']}),product(19,'Other with fleece. Beige',0,{fam:'other',img:['a','b']})]};
  assert.equal(CAT.listed(applyChoices(input,rule).CM)[0].id,19);
});
check('fixture cards aggregate price and sold-out state; repeat is byte-identical', () => {
  const p = CAT.listed(F).find(p => p.id === 3); assert.equal(p.p,60); assert(p.choiceFrom); assert(!p.oos);
  assert(CAT.listed(F).find(p => p.id === 8).oos);
  assert.equal(JSON.stringify(applyChoices(F,groups)), JSON.stringify(result));
});
const reapplied = applyChoices(W.CM, groups, W.CMCOPY); applyFamilyVideos(reapplied.CM,W.CMCOPY);
const CM = reapplied.CM, LIST = CAT.listed(CM), rawByH = Object.fromEntries(CM.all.map(p => [p.h,p]));
check('real data reapply equals saved bytes and remains idempotent', () => {
  assert.equal('window.CM = ' + JSON.stringify(CM) + ';\n', read('assets/data.js'));
  const again = applyChoices(CM,groups); applyFamilyVideos(again.CM,W.CMCOPY); assert.equal(JSON.stringify(again.CM),JSON.stringify(CM));
});
check('every marked Ragnar colour has one listed card with real option handles', () => {
  const keys = new Map();
  for (const p of CM.all.filter(p => p.fam === r.key && /\b(?:with|without) fleece\b/i.test(p.t))) {
    const key = p.t.replace(new RegExp(r.choice.strip,'gi'),'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
    if (!keys.has(key)) keys.set(key,[]); keys.get(key).push(p);
  }
  for (const members of keys.values()) {
    const primary = members.filter(p => !p.choiceOf); assert.equal(primary.length,1);
    assert(!/\b(?:with|without) fleece\b/i.test(CAT.card(primary[0]).t));
    const labels = new Set(members.map(p => /\bwithout fleece\b/i.test(p.t) ? 'Not lined' : 'Lined'));
    assert.equal(primary[0].choices.length,labels.size);
    for (const o of primary[0].choices) { assert(rawByH[o.h]); assert.equal(rawByH[o.h].p,o.p); }
  }
  assert(!LIST.some(p => p.fam === r.key && /\b(?:with|without) fleece\b/i.test(p.t)));
  assert(!CM.all.some(p => p.fam === 'unisex-aviator' && /^merino aviator hat\.(?!.*fleece)/i.test(p.t)));
});
const pdp = (isIS=false, catalogue=CM, copy=W.CMCOPY) => make({CM:catalogue,COPY:copy,t:s=>isIS ? W.CMI18N[s] || s : s,isIS,px:x=>x,usd:n=>'$'+n});
check('every Ragnar view has a video in EN and IS; no view asks choose one', () => {
  for (const is of [false,true]) for (const p of CM.all) {
    const v = pdp(is).view(p); assert(!v.info.includes('(choose one)'));
    if (p.fam === r.key) assert.match(v.info,/class="pdp__video link"/);
  }
});
check('family video requires a single majority, preserves individual overrides', () => {
  const C = structuredClone(fixture), COPY = {map:{},texts:['⟦video:abcdef⟧'],care:[]};
  C.all.forEach(p => COPY.map[p.id] = {s:0}); applyFamilyVideos(C,COPY); assert.equal(C.families[0].video,'abcdef');
  COPY.texts[0] += ' ⟦video:ghijkl⟧'; applyFamilyVideos(C,COPY); assert(!C.families[0].video);
});
check('Tenderness and Sailor pairings and Sailor merino material', () => {
  const tender = CM.all.find(p => p.fam === 'tenderness'), sailor = CM.all.find(p=>p.fam==='sailor');
  assert(pdp().view(tender).goes.includes('tenderness-neckwarmers'));
  assert(pdp().view(sailor).goes.includes('ragnar-scarves')); assert(pdp().view(sailor).goes.includes('ragnar-gloves'));
  assert.equal(pdp().matWords(sailor),'Merino wool');
});
check('lining views select real handles, prices, photos, sold-out states and pom-ask', () => {
  const fp = pdp(false,F,{map:{},texts:[],care:[]});
  for (const id of [2,3,6,7]) {
    const p = F.all.find(p=>p.id===id), v = fp.view(p);
    assert(v.info.includes('$'+p.p)); assert(v.info.includes(p.choiceTitle));
    if (!p.oos) assert(v.info.includes('data-h="'+p.h+'"'));
    if (p.img.length) assert(v.imgs.includes(p.img[0]));
    assert(v.info.includes('pom-ask') || p.oos);
    assert(v.info.includes('is-selected'));
  }
  assert.match(fp.view(F.all.find(p=>p.id===7)).info,/disabled>Lined \(sold out\)/);
  const p = CM.all.find(p=>p.choices?.length===2 && !p.oos), html = pdp(true).view(p).info;
  for (const s of ['Fóður','Með fóðri','Án fóðurs']) assert(html.includes(s));
});
const app = read('app.js');
check('25 Sep answers hold on the real snapshot; discontinued pieces stay off the shop', () => {
  for (const p of CM.all) {
    assert(!ANSWERS.renames.some(r => new RegExp(r.find,'i').test(p.t)), `unapplied rename #${p.id}`);
    assert(!ANSWERS.trash.ids.includes(p.id));
    assert.notEqual(p.fam,'akureyri');
    assert(!answerProduct(p, [W.CMCOPY.map[p.id]?.s,W.CMCOPY.map[p.id]?.l].map(i=>W.CMCOPY.texts[i]||'').join(' ')).removal);
  }
  for (const name of ['Lía beanie','Smooth Kitty beanie','Tenderness headband','Icelandic wool blanket','XL double-faced scarf']) assert(LIST.some(p=>p.t.startsWith(name)),name);
  assert(!CM.bespoke.fabrics.some(f=>f.blankets.includes('akureyri')));
  const fabrics=read('configurators.js');
  assert(fabrics.includes('FABRIC[key].blankets.includes(p.fam)'));
  assert(read('pages.js').includes('const L = CM.all.filter(p => !s'));
});
check('raw live pull contract: names, description-qualified removals, private ids, design and Ragnar pair', () => {
  const titles = [
    ['Alpaca Hat Boucle. White','lia-beanies'], ['Alpaca Hat Brushed. Blue','lia-beanies'],
    ['Tender Kitty hat. White','smooth-kitty'], ['Angora+merino wool headband. White','tenderness-headbands'],
    ['Unicorn blanket. White','unicorn'], ['Gradient Unicorn blanket. Blue','unicorn'], ['Leaves blanket. Green','unicorn'],
    ['Logo scarf. Double-sided. Grey','xl-double-scarves'], ['“Sustainable statement/ logomania” scarf. Pure Icelandic wool. Extra large. Grey','xl-double-scarves'],
    ['XL double-faced scarf. Pure Icelandic wool. Extra large. Blue','xl-double-scarves'],
    ['Pompom. Grapefrui0',''], ['Wool pompo11',''],
  ];
  const rows=titles.map(([t,fam],i)=>({id:80000+i,h:'answer-'+i,t,fam,cats:[],img:[],p:70}));
  // Both source names and renamed names must classify in the same family.
  for (const p of rows.filter(p=>p.fam)) {
    assert.equal(familyOf(p.t)?.key,p.fam);
    assert.equal(familyOf(answerProduct(p).product.t)?.key,p.fam);
  }
  rows.push(
    {id:80020,h:'explorer-hat',t:'Explorer hat. White',fam:''},
    {id:80021,h:'explorer-scarf',t:'Explorer scarf. White',fam:''},
    ...ANSWERS.trash.ids.map(id=>({id,h:'private-'+id,t:'PRIVATE_SENTINEL',fam:''})),
    {id:80022,h:'akureyri',t:'Akureyri blanket. White',fam:'akureyri'},
    {id:80023,h:'aviator-text',t:'Merino Aviator hat special edition',fam:'unisex-aviator'},
    {id:80024,h:'aviator-lined',t:'Merino Aviator hat with fleece. White',fam:'unisex-aviator'},
    product(80025,'Ragnar hat with fleece. Black',0), product(80026,'Ragnar hat without fleece. Black',1)
  );
  const copy={map:{80023:{s:0},80024:{s:1}},texts:['Merino wool without fleece','Merino wool with fleece']};
  const raw={all:rows,families:groups.families}, before=JSON.stringify(raw);
  const out=applyChoices(raw,groups,copy);
  assert.equal(JSON.stringify(raw),before);
  assert.deepEqual(out.CM.all.map(p=>p.id),[...titles.map((_,i)=>80000+i),80024,80025,80026]);
  for (const [i] of titles.entries()) {
    const p=out.CM.all.find(p=>p.id===80000+i);
    assert.equal(p.wt,titles[i][0]); assert(!ANSWERS.renames.some(r=>new RegExp(r.find,'i').test(p.t)));
  }
  assert.equal(out.CM.all.find(p=>p.id===80008).fam,'xl-double-scarves');
  assert(!out.findings.join('\n').includes('PRIVATE_SENTINEL'));
  assert(out.findings.some(s=>s.includes('Anna Q24')));
  assert(out.findings.some(s=>s.includes('Anna Q22')));
  assert(out.findings.some(s=>s.includes('Anna Q26')));
  assert(out.findings.some(s=>s.includes('Anna 23 Oct')));
  assert.equal(out.CM.all.find(p=>p.id===80025).choices.length,2);
  assert.equal(CAT.listed(out.CM).filter(p=>p.fam===r.key).length,1);
  assert.deepEqual(applyChoices(out.CM,groups,copy),out);
  // The pre-classification pull helper uses exactly the same answers and keeps the original.
  const pull=read('tools/pull-woo.mjs');
  assert(pull.indexOf('const a = answerProduct(')<pull.indexOf('fam = familyOf(name,'));
  assert(pull.includes('if (p.answerDesign)'));
});
check('search finds preserved WordPress names through the actual shared search helper', () => {
  const code=app.slice(app.indexOf('  const SEARCH ='),app.indexOf('  /* ── one search for the whole site'));
  const search=new Function('CM','MATS','GRPS','nm','isIS',code+';return SEARCH;')(CM,{}, {},x=>x?.name||'',false);
  for (const p of LIST.filter(p=>p.wt)) assert(search.hit(p,search.toks(p.wt)),`old title search #${p.id}`);
});
check('retired products have no static pages or sitemap entries; material and fabric pools exclude Akureyri', () => {
  const want=new Set(CM.all.map(p=>p.h));
  for (const lang of ['','is/']) {
    const dirs=fs.readdirSync(new URL('../'+lang+'product/',import.meta.url),{withFileTypes:true}).filter(d=>d.isDirectory()).map(d=>d.name);
    assert.equal(dirs.length,want.size);
    assert(dirs.every(h=>want.has(h)));
    const urls=[...read(lang+'sitemap.xml').matchAll(/\/product\/([^/<]+)\//g)].map(m=>m[1]);
    assert(urls.every(h=>want.has(h)));
  }
  assert.equal(CM.families.find(f=>f.key==='akureyri').count,0);
  for (const pool of [...CM.materials,...CM.groups,...CM.families]) for (const h of pool.pool||[]) assert(want.has(h));
  for (const fabric of CM.bespoke.fabrics) assert(!fabric.blankets.includes('akureyri'));
});
check('bag uses real option stock/id/handle with localized display title and choice', () => {
  const code=app.slice(app.indexOf('  const variant ='),app.indexOf('  const load ='));
  for (const is of [false,true]) {
    const t=s=>is ? W.CMI18N[s]||s:s;
    const clean=new Function('byHandle','str','MAX_EACH','t',code+';return clean;')(rawByH,(v,n=200)=>typeof v==='string'?v.slice(0,n):'',20,t);
    for (const p of CM.all.filter(p=>p.choiceLabel)) {
      const line=clean({h:p.h,q:1}); assert.equal(line.h,p.h); assert.equal(line.p,p.p); assert.equal(line.t,p.choiceTitle); assert.equal(line.s,t(p.choiceLabel));
    }
  }
});
check('actual card template shows From only for differing prices and aggregate stock', () => {
  const prod = new Function('CAT','px','usd','t','catLabel',app.slice(app.indexOf('  const esc ='),app.indexOf('  const railT ='))+';return prod;')(CAT,x=>x,n=>'$'+n,s=>s,p=>p.pomMaterial||'');
  const p=F.all.find(p=>p.id===3); assert(prod(p,0).includes('From $60'));
  const same={...p,choices:p.choices.map(o=>({...o,p:70}))}; assert(!prod(same,0).includes('From '));
  assert(prod(F.all.find(p=>p.id===8),0).includes('Sold out'));
  assert(!prod(p,0).includes('Sold out'));
});
check('actual Add to bag keeps each real option with stock, title and localized lining', () => {
  for (const is of [false,true]) {
    const ctx={byHandle:rawByH,MAX_EACH:20,MAX_LINES:40,lines:[],notices:[],t:s=>is?W.CMI18N[s]||s:s,str:(v,n=200)=>typeof v==='string'?v.slice(0,n):'',poms:()=>[],save:()=>{},renderBag:()=>{},openBag:()=>{},say:()=>{},fmt:s=>s,setTimeout:()=>0,clearTimeout:()=>{}};
    ctx.itemCount=()=>ctx.lines.length;
    vm.createContext(ctx);
    vm.runInContext(app.slice(app.indexOf('  const variant ='),app.indexOf('  const load =')),ctx);
    const start=app.indexOf('  const inBag =');
    vm.runInContext(app.slice(start,app.indexOf("  document.addEventListener('click'",app.indexOf('  function addToBag')))+';globalThis.add=addToBag;',ctx);
    const options=CM.all.find(p=>p.choices?.length===2 && p.choices.every(o=>!o.oos)).choices;
    for (const o of options) ctx.add(o.h,'',null,null);
    assert.equal(ctx.lines.length,2);
    for (const line of ctx.lines) {const p=rawByH[line.h];assert.equal(line.t,p.choiceTitle);assert.equal(line.s,ctx.t(p.choiceLabel));assert.equal(line.p,p.p);assert(CM.all.some(x=>x.id===p.id));}
    const sold=CM.all.find(p=>p.choiceLabel && p.oos); ctx.add(sold.h,'',null,null);assert.equal(ctx.lines.length,2);
  }
});
check('pompom pages, swatch pool and cards carry material in both languages', () => {
  const source=read('configurators.js'), code=source.slice(source.indexOf('  const FIX ='),source.indexOf('  const BEANIE ='));
  const pool=new Function('LIST','t',code+';return POMS;')(LIST,s=>s); assert(pool.length); assert(pool.every(p=>p.material));
  for (const p of CM.all.filter(p=>/pompoms$/.test(p.fam||''))) for (const is of [false,true]) assert(pdp(is).view(p).info.includes(is ? W.CMI18N[p.pomMaterial] : p.pomMaterial));
  assert(source.includes('t(s.material)')); assert(source.includes('t(chosen[i].material)'));
  assert(app.includes('p.pomMaterial ? t(p.pomMaterial)'));
});
check('alias pages canonicalize to primary, select their option, and stay out of discovery', () => {
  for (const p of CM.all.filter(p=>p.choiceOf)) for (const lang of ['','is/']) {
    const html=read(lang+'product/'+p.h+'/index.html');
    assert(html.includes(`rel="canonical" href="https://mjukiceland.${lang ? 'is' : 'com'}/product/${p.choiceOf}/"`));
    assert(html.includes('data-h="'+p.h+'"') || p.oos);
    assert(!read(lang+'sitemap.xml').includes('<loc>https://mjukiceland.'+(lang?'is':'com')+'/product/'+p.h+'/'));
    assert(!read(lang+'shop.html').includes('href="product/'+p.h+'/"'));
    assert(!pdp().view(p).sib.some(x=>x.choiceOf || x.h===p.choiceOf));
    assert(!pdp().view(p).withL.some(x=>x.choiceOf));
  }
  for (const x of [...CM.groups,...CM.materials]) for (const h of x.pool||[]) assert(!rawByH[h].choiceOf);
});
console.log(`${checks} choices checks passed (fixture + ${CM.all.length} real records; ${LIST.length} listed).`);
// Claude review 5 Nov: a lining line in the bag reads "Lining: Not lined", never "Size Not lined"; the pompom chooser and the
// "Added to your bag" message name the merged piece, not her WordPress title with "with fleece"
{
  const src = f => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
  const ok1 = /choiceLabel \? t\('Lining'\) \+ ': '/.test(src('app.js'));
  const ok2 = /name\.textContent = h\.choiceTitle \|\| h\.t/.test(src('configurators.js'));
  const ok3 = /name: \(p\.choiceTitle \|\| p\.t\)/.test(src('app.js'));
  console.log((ok1 && ok2 && ok3 ? 'PASS' : 'FAIL') + ' bag lining label, chooser and bag message use the merged name');
  if (!(ok1 && ok2 && ok3)) process.exitCode = 1;
}
