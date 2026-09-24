/* functions/bag.js inside Cloudflare's own runtime (workerd, started by the installed wrangler's
   unstable_dev for the length of this run), not Node: the signature it makes there must open a
   cart on the WooCommerce host.

     node tools/e2e-workerd.mjs [replica|sandbox]

   Also measures the worst bag a shopper can build (the most pieces a bag carries, pompoms on
   every hat, the longest names) against the URL a host will take: the signed bag travels in the
   address, and LiteSpeed/Apache refuse request lines past about 8 KB. */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';

const ROOT = path.resolve(import.meta.dirname, '..');
const WS = path.resolve(ROOT, '../..');
const TARGET = process.argv[2] === 'sandbox' ? 'sandbox' : 'replica';
const WOO = TARGET === 'sandbox' ? 'http://127.0.0.1:9410' : 'http://127.0.0.1:9420';
const env = f => Object.fromEntries(fs.readFileSync(f, 'utf8').split('\n').map(l => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map(m => [m[1], m[2].trim()]));
const dev = env(path.join(ROOT, '.dev.vars'));
const TOKEN = env(path.join(WS, '04-platform/mjuk-woo-sandbox/local/test.env')).TEST_TOKEN;
const require = createRequire('/Users/sindri/.npm-global/lib/node_modules/wrangler/package.json');
const { unstable_dev } = require('wrangler');
globalThis.window = {};
new Function('window', fs.readFileSync(path.join(ROOT, 'assets/data.js'), 'utf8'))(globalThis.window);
const CM = globalThis.window.CM;

let fails = 0;
const check = (ok, what) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`); if (!ok) fails++; };
// Pages calls onRequestGet/onRequestPost; this entry does the same with the real file
const ENTRY = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mjuk-workerd-')), 'entry.mjs');
fs.writeFileSync(ENTRY, `import { onRequestGet, onRequestPost } from ${JSON.stringify(path.join(ROOT, 'functions/bag.js'))};\nexport default { fetch: (request, env) => request.method === 'POST' ? onRequestPost({ request, env }) : onRequestGet({ request, env }) };\n`);
const worker = vars => unstable_dev(ENTRY, { vars, compatibilityDate: '2024-09-23', logLevel: 'error', experimental: { disableExperimentalWarning: true } });
const post = (mf, bag, lang) => mf.fetch('/bag', { method: 'POST', redirect: 'manual', body: new URLSearchParams(lang ? { bag: JSON.stringify(bag), lang } : { bag: JSON.stringify(bag) }) });
const open = async link => { // a fresh shopper opens the signed link on the Woo host
  const jar = new Map([['playground_auto_login_already_happened', '1']]);
  const go = async url => { const r = await fetch(url, { redirect: 'manual', headers: { Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') } });
    for (const c of r.headers.getSetCookie()) { const [kv] = c.split(';'); const i = kv.indexOf('='); jar.set(kv.slice(0, i), kv.slice(i + 1)); } return r; };
  const r = await go(link);
  const cartJson = await (await fetch(WOO + '/?sndr_test=cart', { headers: { 'X-SNDR-Test': TOKEN, Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') } })).json();
  return { status: r.status, to: r.headers.get('location') || '', cart: cartJson };
};

const mf = await worker({ BAG_SECRET: dev.BAG_SECRET, CHECKOUT_ORIGIN: WOO });
try {
  check((await mf.fetch('/bag')).status === 204, 'workerd: GET /bag answers 204 when checkout is configured');
  { const bare = await worker({ BAG_SECRET: '', CHECKOUT_ORIGIN: '' }); /* wrangler also reads .dev.vars: blank them */ check((await bare.fetch('/bag')).status === 503, 'workerd: and 503 without its secret (the storefront then says so)'); await bare.stop(); }

  const hat = CM.all.find(p => p.id === 12167), pom = CM.all.find(p => p.id === 4249);
  const note = 'Attach to Húfa „Mjúk“ ljósgrá, ☃'; // not ASCII: the payload is UTF-8 in base64url
  const r = await post(mf, [{ id: hat.id, q: 1, p: hat.p }, { id: pom.id, q: 1, p: pom.p, note, for: hat.id }], 'is');
  const link = r.headers.get('location') || '';
  check(r.status === 303 && link.startsWith(WOO + '/?sndr_bag='), `workerd: a bag is signed and sent on to the Woo host (${r.status})`);
  const o = await open(link);
  check(o.to.endsWith('/checkout/') && o.cart.items.map(i => `${i.id}×${i.q}`).join() === `${hat.id}×1,${pom.id}×1`, `a signature made in workerd opens the cart on ${TARGET} (PHP ${TARGET === 'replica' ? '7.2 · Woo 3.5' : '8.3 · Woo today'})`);
  check(o.cart.items[1] && o.cart.items[1].note === note && o.cart.lang === 'is', `a note with Icelandic letters arrives intact, and the language rides along (${o.cart.items[1] && o.cart.items[1].note})`);
  check((await mf.fetch('/bag', { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json' } })).status === 400, 'workerd: a non-form post is a 400, not an exception');

  /* the biggest bag the drawer lets anyone build: 40 pieces = 20 hats with a pompom each, longest names first */
  const hats = CM.all.filter(p => p.tyk === 'hats' && !p.oos).sort((a, b) => b.t.length - a.t.length).slice(0, 20);
  const poms = CM.all.filter(p => p.tyk === 'pompoms' && !p.oos);
  const big = hats.flatMap((h, i) => [{ id: h.id, q: 20, p: h.p }, { id: poms[i % poms.length].id, q: 20, p: poms[i % poms.length].p, note: 'Attach to ' + h.t, for: h.id }]);
  const rb = await post(mf, big, 'is');
  const bigLink = rb.headers.get('location') || '';
  const requestLine = `GET ${new URL(bigLink).pathname}${new URL(bigLink).search} HTTP/1.1`.length;
  console.log(`      worst bag: ${big.length} lines, signed link ${bigLink.length} characters, request line ${requestLine} bytes`);
  check(rb.status === 303 && requestLine < 7000, `the worst bag's link stays well under the ~8 KB request line hosts accept (${requestLine} bytes)`);
  const ob = await open(bigLink);
  check(!/could not be opened/.test(ob.to) && (ob.to.endsWith('/checkout/') || ob.cart.items.length > 0), `and the Woo host takes it (landed ${ob.to.replace(WOO, '') || ob.status})`);
} finally {
  await mf.stop();
}
console.log(fails ? `\n${fails} FAILED (${TARGET})` : `\nALL PASS (${TARGET})`);
process.exit(fails ? 1 : 0);
