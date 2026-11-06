/* A piece with no photo shows the quiet MJÚK card, never an empty half page (launch audit 6 Nov: Ragnar Gloves).
   Every built product page, both languages: its gallery holds a photo or the placeholder.   node tools/check-noimg.mjs */
import fs from 'node:fs'; import path from 'node:path';
const ROOT = path.resolve(path.dirname(decodeURIComponent(new URL(import.meta.url).pathname)), '..');
let bad = 0, none = 0, n = 0;
for (const dir of ['product', 'is/product']) for (const slug of fs.readdirSync(path.join(ROOT, dir))) {
  const f = path.join(ROOT, dir, slug, 'index.html'); if (!fs.existsSync(f)) continue; n++;
  const h = fs.readFileSync(f, 'utf8'), gal = (h.match(/id="gal"[^>]*>([\s\S]*?)<\/div>/) || [])[1] || '';
  if (/class="noimg"/.test(gal)) none++; else if (!/<img /.test(gal)) { bad++; console.log('FAIL  empty gallery: ' + dir + '/' + slug); }
}
const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
if (!/class="noimg"/.test(app)) { bad++; console.log('FAIL  shop card has no placeholder for a piece without a photo'); }
console.log(`${n} product pages, ${none} with the placeholder, ${bad ? bad + ' FAILED' : 'ALL PASS'}`); process.exit(bad ? 1 : 0);
