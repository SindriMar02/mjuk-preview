/* Offline contract checks: no product-page build and no requests (Sindri, 1 Nov). */
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const make = createRequire(import.meta.url)('../pdp.js');
const { readBag, sign, onRequestPost } = await import('data:text/javascript;base64,' + Buffer.from(fs.readFileSync(new URL('../functions/bag.js', import.meta.url))).toString('base64'));
let failed = 0;
const check = (name, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + name); if (!ok) failed++; };
const p = { id: 1, h: 'knit', t: 'Knit', p: 80, cp: 100, img: [], cats: [], va: [{ n: 'Size', o: ['S', 'M'] }], vr: [{ v: 11, a: { Size: 'S' }, p: 80, cp: 100, oos: false }, { v: 12, a: { Size: 'M' }, p: 90, cp: 0, oos: true }] };
const env = { CM: { all: [p] }, COPY: { map: {}, texts: [], care: {} }, px: x => x, usd: n => '$' + n };
const pdp = make(env), view = pdp.view(p);
check('static variable choices and disabled sold-out option', /role="radiogroup"/.test(view.info) && /data-option="S"/.test(view.info) && /data-option="M" disabled>M \(sold out\)/.test(view.info));
check('one buyable price shows without From, add disabled until selection', !/From /.test(view.info) && view.info.includes('<s>$100</s>') && /data-s="" disabled/.test(view.info));
check('all sold out uses existing block', pdp.view({ ...p, oos: true }).info.includes('Sold out online'));
check('multiple attributes appear in her order', pdp.view({ ...p, va: [...p.va, { n: 'Colour', o: ['Navy', 'Cream'] }] }).info.indexOf('data-va="0"') < pdp.view({ ...p, va: [...p.va, { n: 'Colour', o: ['Navy', 'Cream'] }] }).info.indexOf('data-va="1"'));
const cases = [
  ['script/style/iframe content', '<script>alert(1)</script><style>bad</style><iframe>bad</iframe><p>Good</p>', '<p>Good</p>'],
  ['attributes and comments', '<!--bad--><p onclick="bad">Good<br onmouseover="bad"></p>', '<p>Good<br></p>'],
  ['javascript href', '<a href=" javascript&#58;alert(1)">Text</a>', 'Text'],
  ['data href', '<a href="data:text/html,bad">Text</a>', 'Text'],
  ['relative href', '<a href="//example.test">Text</a>', 'Text'],
  ['nested formatting', '<p><b>Bold <em>and italic</em></b></p><ol><li>One</li></ol>', '<p><b>Bold <em>and italic</em></b></p><ol><li>One</li></ol>'],
  ['entities in href', '<a href="https&#58;//example.test/?x=1&amp;y=&quot;two&quot;">Go</a>', '<a href="https://example.test/?x=1&amp;y=&quot;two&quot;" rel="noopener" target="_blank">Go</a>'],
  ['mailto', '<a href=" mailto:anna@example.test ">Mail</a>', '<a href="mailto:anna@example.test" rel="noopener">Mail</a>'],
  ['https', '<a href="https://example.test" onclick="bad">Go</a>', '<a href="https://example.test" rel="noopener" target="_blank">Go</a>'],
  ['encoded markup stays text', '&lt;img src=x onerror=bad&gt;', '&lt;img src=x onerror=bad&gt;'],
];
for (const [name, input, expected] of cases) check('sanitizer ' + name, pdp.clean(input) === expected && make.sanitize(input) === expected);
check('video markers never expand inside hrefs', pdp.clean('<a href="https://example.test/⟦video:abcdef⟧">Go</a>').match(/<a /g).length === 1);
check('plain bullets and paragraphs', pdp.clean('First\n\n• One\n• Two').includes('<ul><li>One</li><li>Two</li></ul>'));
check('text transform never touches href', make.sanitize('<a href="https://example.test/a--b">old</a>', s => s.replace('old', 'new')).includes('a--b') && make.sanitize('<b>old</b>', () => 'new') === '<b>new</b>');
const bag = extra => readBag(JSON.stringify([{ id: 1, q: 2, p: 80, ...extra }]));
check('bag accepts variation and any attributes', bag({ v: 11, a: { Colour: 'Navy' } })?.[0].a.Colour === 'Navy');
check('simple bag unchanged', JSON.stringify(bag({})) === '[{"id":1,"q":2,"p":80}]');
for (const v of [0, -1, 1.2, '11', null]) check('bag rejects v ' + JSON.stringify(v), bag({ v }) === null);
for (const a of [null, [], 'Navy', { a: 1 }, { a: 'x'.repeat(61) }, { ['x'.repeat(61)]: 'a' }, { a: '', b: '', c: '', d: '', e: '' }]) check('bag rejects a ' + JSON.stringify(a), bag({ a }) === null);
check('bag accepts four 60-character attributes', !!bag({ v: 11, a: Object.fromEntries(['a', 'b', 'c', 'd'].map(k => [k.repeat(60), 'x'.repeat(60)])) }));
const signed = await sign(bag({ v: 11, a: { Colour: 'Cream' } }), 'offline-test-secret', 0);
check('signed payload preserves variation contract', JSON.parse(Buffer.from(signed.payload, 'base64url')).items[0].v === 11);
const large = Array.from({ length: 20 }, (_, i) => ({ id: i + 1, q: 1, v: 11, a: Object.fromEntries(['a', 'b', 'c', 'd'].map(k => [k, 'x'.repeat(60)])) }));
const largeResponse = await onRequestPost({ request: new Request('https://offline.test/bag', { method: 'POST', body: new URLSearchParams({ bag: JSON.stringify(large) }) }), env: { BAG_SECRET: 'offline-test-secret', CHECKOUT_ORIGIN: 'https://offline.test' } });
check('6000-character signed payload cap remains enforced', largeResponse.status === 413 && (await largeResponse.text()).includes('one checkout'));
// These helpers are exercised with real catalogue-shaped lines, without booting the storefront DOM.
const source = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const helpers = source.slice(source.indexOf('  const variant ='), source.indexOf('  const load ='));
const ctx = { byHandle: { knit: p }, MAX_EACH: 20, str: (v, n = 200) => typeof v === 'string' ? v.slice(0, n) : '' };
vm.createContext(ctx); vm.runInContext(helpers + ';globalThis.read = clean;globalThis.stock = stockOf;', ctx);
check('stored unknown variation kept as a sold-since row', ctx.read({ h: 'knit', q: 1, v: 999 }).gone === 1);
check('stored variation price and label', ctx.read({ h: 'knit', q: 1, v: 11 }).p === 80 && ctx.read({ h: 'knit', q: 1, v: 11 }).s === 'S');
check('stored stock resolves variation', ctx.stock({ h: 'knit', v: 12 }).oos === true);
const any = { ...p, va: [...p.va, { n: 'Colour', o: ['Navy', 'Cream'] }] }; ctx.byHandle.knit = any;
check('any choice required and validated', ctx.read({ h: 'knit', q: 1, v: 11 }).gone === 1 && ctx.read({ h: 'knit', q: 1, v: 11, a: { Colour: 'Pink' } }).gone === 1 && ctx.read({ h: 'knit', q: 1, v: 11, a: { Colour: 'Navy' } }).s === 'Size: S, Colour: Navy');
const limits = source.slice(source.indexOf('  const inBag ='), source.indexOf("  document.addEventListener('click'", source.indexOf('  function addToBag')));
Object.assign(ctx, { lines: [], MAX_LINES: 40, poms: () => [], notices: [], itemCount: () => ctx.lines.length, save: () => {}, renderBag: () => {}, openBag: () => {}, say: () => {}, fmt: s => s, t: s => s, setTimeout: () => 0, clearTimeout: () => {} });
vm.runInContext(limits + ';globalThis.add = addToBag;globalThis.room = lineRoom;', ctx);
const button = (v, a) => ({ dataset: { v }, _va: a, closest: () => null, querySelector: () => null, classList: { add: () => {} } });
ctx.byHandle.knit = { ...any, img: ['parent.jpg'], vr: any.vr.map(r => ({ ...r, q: 2 })) };
ctx.add('knit', '', button(11, { Size: 'S', Colour: 'Navy' }));
ctx.add('knit', '', button(11, { Size: 'S', Colour: 'Cream' }));
check('any options make separate lines sharing variation stock', ctx.lines.length === 2 && ctx.lines[0].k !== ctx.lines[1].k && ctx.room(ctx.lines[0]) === 0);
ctx.add('knit', '', button(12, { Size: 'M', Colour: 'Navy' }));
check('sold-out variation cannot be added', ctx.lines.length === 2);
ctx.lines = []; ctx.byHandle.knit = { ...p, img: ['parent.jpg'], vr: [{ v: 11, a: {}, p: 85, cp: 0, oos: false, q: 3 }] };
ctx.add('knit', 'S', button(11)); ctx.add('knit', 'M', button(11));
check('one-attribute card any choice reaches bag', ctx.lines.length === 2 && ctx.lines[0].a.Size === 'S' && ctx.lines[1].s === 'M' && ctx.lines[1].p === 85);
ctx.byHandle.knit.si = 1;
check('sold individually caps available room', ctx.room(ctx.lines[0]) < 1);
// --file writes are opt-in; verify the importer output only when our fixture is installed.
const window = {}; vm.runInNewContext(fs.readFileSync(new URL('../assets/data.js', import.meta.url), 'utf8'), { window });
if (window.CM.all.some(p => p.id === 99001)) {
  const all = window.CM.all, p = all.find(p => p.id === 99001), any = all.find(p => p.id === 99002);
  check('fixture gate lists four and skips empty/grouped', all.length === 4 && !all.some(p => [99003, 99004].includes(p.id)));
  check('fixture parent price/stock and variation-only quantity', p.p === 80 && p.cp === 120 && !p.oos && !('q' in p) && p.vr[0].q === 2);
  check('fixture ordered chips including sold out', JSON.stringify(p.sz.map(v => [v.s, v.a, v.v])) === '[[' + '"S",true,99101],["M",false,99102],["L",true,99103]]');
  check('fixture draft excluded and gallery photo deduped', p.vr.length === 3 && p.img.filter(s => s.endsWith('/small.jpg')).length === 1);
  check('fixture any attributes remain missing and no multi-attribute chips', Object.keys(any.vr[0].a).length === 0 && any.sz.length === 0 && any.va[1].n === 'Colour');
  check('fixture every-variation-sold-out parent', all.find(p => p.id === 99005).oos === true);
  vm.runInNewContext(fs.readFileSync(new URL('../assets/copy.js', import.meta.url), 'utf8'), { window });
  const copy = window.CMCOPY;
  check('fixture description formatting survives importer', copy.texts[copy.map[99001].l].includes('<p>A <strong>warm</strong> knit.</p><ul><li>Soft</li></ul>') && copy.texts[copy.map[99001].l].includes('href="https://example.test/?a=1&amp;b=2"'));
}
process.exitCode = failed ? 1 : 0;
