/* A long product title never runs past its column: "neckwarmer/transformer." may break after the slash (launch audit 6 Nov,
   36 Tenderness neckwarmer pages overran at 1280 and 1440). 1280/1440/1920/390, EN + IS.   node tools/check-title-wrap.mjs */
import { createRequire } from 'node:module'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const require = createRequire('/Users/sindri/Documents/Website redesign mockups/package.json');
const puppeteer = require('puppeteer-core');
const ROOT = path.resolve(path.dirname(decodeURIComponent(new URL(import.meta.url).pathname)), '..');
const T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(new URL(q.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html'; const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': T[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }).listen(5898);
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new' });
const p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); let bad = 0;
try {
  for (const u of ['/product/tenderness-angora-neckwarmer-transformer-black/', '/is/product/tenderness-angora-neckwarmer-transformer-black/', '/product/marshmallow-hat-violet/'])
    for (const w of [1280, 1440, 1920, 390]) {
      await p.setViewport({ width: w, height: 900 }); await p.goto('http://localhost:5898' + u, { waitUntil: 'load' }); await new Promise(r => setTimeout(r, 2200));
      const m = await p.evaluate(() => { const h = document.querySelector('h1'); const r = document.createRange(); r.selectNodeContents(h);
        return { over: Math.round(r.getBoundingClientRect().right - h.getBoundingClientRect().right), sw: h.scrollWidth, cw: h.clientWidth, text: h.textContent.replace(/\s+/g, ' ').trim() }; });
      const ok = m.over <= 2 && m.sw <= m.cw + 2; if (!ok) bad++;
      console.log(ok ? 'PASS' : 'FAIL', w, u, JSON.stringify(m));
    }
} finally { await b.close(); srv.close(); }
console.log(bad || errs.length ? `FAILED (${bad} overflow, ${errs.length} script errors)` : 'ALL PASS'); process.exit(bad || errs.length ? 1 : 0);
