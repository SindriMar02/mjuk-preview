/* The Icelandic site: real, separate, crawlable pages (is/*.html here, mjukiceland.is at launch),
   built from the English pages so there is one design and two languages.

     node tools/build-pages.mjs && node tools/build-is.mjs          build both
     node tools/build-is.mjs --report                               list every English string left

   Static text and attributes (alt, aria-label, title, placeholder, meta content) are translated
   from tools/is.json, keyed by the exact English source text. Strings the scripts write at run
   time use t() with the same dictionary, loaded on Icelandic pages as window.CMI18N.
   Her product names and texts stay in her own English words on both sites.
   Every page gets hreflang links to its counterpart, both ways. */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const PAGES = ['index.html', 'shop.html', 'product.html', 'fibres.html', 'store.html', 'story.html', 'staff.html'];
// the production hosts; the preview is noindex, so these only have to be right at launch
const SITE = { en: 'https://mjukiceland.com/', is: 'https://mjukiceland.is/' };
const REPORT = process.argv.includes('--report');
const dict = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/is.json'), 'utf8'));

const norm = s => s.replace(/\s+/g, ' ').trim();
// text that is the same in both languages: names, addresses, numbers, emails, symbols
const SAME = /^(?:[\d\s.,:;+()&#;–—·\-\/]+|MJ&Uacute;K|MJÚK[\w\s&;]*|[\w.+-]+@[\w.-]+|\+?354[\d\s]+|&[a-z]+;|\[\s*|\s*\]|×|→|←|↓|\()$/i;
const missing = new Map();
const trText = (s, where) => {
  const k = norm(s);
  if (!k || SAME.test(k) || !/[a-z]/i.test(k)) return s;
  if (!(k in dict)) { missing.set(k, where); return s; }
  const lead = s.match(/^\s*/)[0], trail = s.match(/\s*$/)[0];
  return lead + dict[k] + trail;
};
const ATTR = /\b(alt|aria-label|title|placeholder|content|data-label-open|data-label-close)="([^"]*)"/g;

function translate(html, file) {
  const out = [];
  let i = 0, skip = null;
  const re = /<[^>]*>/g;
  let m;
  while ((m = re.exec(html))) {
    const text = html.slice(i, m.index);
    out.push(skip ? text : trText(text, file));
    let tag = m[0];
    const name = (tag.match(/^<\/?([a-z0-9-]+)/i) || [])[1];
    if (name && /^(script|style)$/i.test(name)) skip = tag[1] === '/' ? null : name;
    if (!skip && !/^<\/|^<!--/.test(tag) && !/^<meta\b[^>]*(charset|name="(viewport|robots|theme-color)"|property="og:(type|image|url)")/i.test(tag)) {
      tag = tag.replace(ATTR, (all, a, v) => (v && /[a-z]/i.test(v) && !/^(https?:|mailto:|tel:|#|\/)/.test(v) && !/^[\w-]+\.(html|js|css|png|jpg|woff2)/.test(v) ? `${a}="${trText(v, file + ' @' + a)}"` : all));
    }
    out.push(tag);
    i = m.index + m[0].length;
  }
  out.push(html.slice(i));
  return out.join('');
}

// one page's English and Icelandic addresses; the homepage is the site root
const url = (lang, file) => SITE[lang] + (file === 'index.html' ? '' : file);
const hreflang = file => `<link rel="alternate" hreflang="en" href="${url('en', file)}" />\n<link rel="alternate" hreflang="is" href="${url('is', file)}" />\n<link rel="alternate" hreflang="x-default" href="${url('en', file)}" />\n`;

let written = 0;
for (const file of PAGES) {
  let en = fs.readFileSync(path.join(ROOT, file), 'utf8');
  // English page: hreflang in, the language switch becomes a link to its Icelandic twin
  en = en.replace(/<link rel="alternate" hreflang[^>]*\/>\n/g, '').replace('</head>', hreflang(file) + '</head>');
  en = en.replace(/<button class="nav__lang" id="langBtn"[^>]*>[\s\S]*?<\/button>|<a class="nav__lang"[^>]*>[\s\S]*?<\/a>/,
    `<a class="nav__lang" id="langBtn" href="is/${file}" hreflang="is" lang="is" aria-label="&Iacute; &iacute;slensku">EN / <b>&Iacute;S</b></a>`);
  let is = translate(en, file)
    .replace('<html lang="en">', '<html lang="is" data-root="../">')
    // one level down: shared files come from the site root
    .replace(/(src|href)="(?!https?:|mailto:|tel:|#|\.\.\/|data:|is\/)((?:assets\/|styles\.css|pages\.css|configurators\.css|app\.js|pages\.js|configurators\.js)[^"]*)"/g, '$1="../$2"')
    .replace(/<a class="nav__lang" id="langBtn"[^>]*>[\s\S]*?<\/a>/,
      `<a class="nav__lang" id="langBtn" href="../${file}" hreflang="en" lang="en" aria-label="In English"><b>EN</b> / &Iacute;S</a>`)
    // the dictionary for strings the scripts write, before the scripts that use it
    .replace(/(<script defer src="\.\.\/assets\/data\.js"><\/script>)/, '<script src="../assets/i18n-is.js"></script>\n$1');
  if (!REPORT) {
    fs.writeFileSync(path.join(ROOT, file), en);
    fs.mkdirSync(path.join(ROOT, 'is'), { recursive: true });
    fs.writeFileSync(path.join(ROOT, 'is', file), is);
    written++;
  }
}
// the run-time dictionary: only entries marked for scripts ("js:" keys), stripped of the prefix
const js = Object.fromEntries(Object.entries(dict).filter(([k]) => k.startsWith('js:')).map(([k, v]) => [k.slice(3), v]));
if (!REPORT) fs.writeFileSync(path.join(ROOT, 'assets/i18n-is.js'), 'window.CMI18N = ' + JSON.stringify(js) + ';\n');

console.log(`${REPORT ? 'report only' : `wrote ${written} English + ${written} Icelandic pages, assets/i18n-is.js (${Object.keys(js).length} run-time strings)`}; untranslated static strings: ${missing.size}`);
if (missing.size) for (const [k, where] of missing) console.log(`  [${where}] ${JSON.stringify(k)}`);
