/* Stamps the inner pages out of index.html's own chrome (head, nav, menu,
   footer, bag, pompom dialog, scripts) so there is exactly one copy of the
   shell. Run after any change to index.html's chrome:
     node tools/build-pages.mjs
   Page bodies live below; behaviour is in pages.js, styling in pages.css. */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(path.join(root, 'index.html'), 'utf8');
const cut = (a, b, from = src) => { const i = from.indexOf(a), j = from.indexOf(b, i); if (i < 0 || j < 0) throw new Error('marker missing: ' + a + ' … ' + b); return from.slice(i, j); };

/* homepage anchors become real pages where one exists */
const MAP = { '#new': 'shop.html?new=1', '#fibres': 'fibres.html', '#shop': 'shop.html', '#sale': 'shop.html?sale=1', '#made': 'index.html#made', '#stores': 'store.html', '#top': 'index.html', '#camp': 'story.html', '#lookbook': 'index.html#lookbook', '#stockists': 'store.html#stockists' };
const relink = html => html.replace(/href="(#[a-z]+)"/g, (m, h) => `href="${MAP[h] || 'index.html' + h}"`);

let head = cut('<!DOCTYPE html>', '</head>');
head = head.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>\n?/, '');
head = head.replace('<link rel="stylesheet" href="configurators.css" />', '<link rel="stylesheet" href="configurators.css" />\n<link rel="stylesheet" href="pages.css" />');
const bgAndNav = relink(cut('<!-- GRAIN-GRADIENT BACKGROUND', '<!-- PRELOADER -->')) + relink(cut('<!-- NAV -->', '<main id="top">'));
const footer = relink(cut('<footer class="foot">', '<!-- BAG DRAWER -->'));
const tail = cut('<!-- BAG DRAWER -->', '</html>')
  .replace('<script defer src="assets/data.js"></script>', '<script defer src="assets/data.js"></script>\n<script defer src="assets/copy.js"></script>')
  .replace(/(<script defer src="configurators.js"><\/script>)/, '$1\n<script defer src="pages.js"></script>');
if (!tail.includes('pages.js')) throw new Error('configurators.js script tag not found; pages.js not inserted');

const rnav = id => `<div class="rnav"><button class="rnav__b" data-rail="${id}" data-dir="-1" aria-label="Scroll left">&larr;</button><button class="rnav__b" data-rail="${id}" data-dir="1" aria-label="Scroll right">&rarr;</button></div>`;

const store = (id, n, tag, name, note, facts) => `      <article class="store rv" id="${id}">
        <div class="store__top"><span class="store__ix mono">${n}</span><span class="mono store__tag">${tag}</span></div>
        <h3 class="store__name">${name}</h3>
        <p class="store__note">${note}</p>
        <dl class="store__facts">${facts.map(f => `<dt>${f[0]}</dt><dd>${f[1]}</dd>`).join('')}</dl>
        <button class="store__map-btn" type="button" aria-expanded="false" data-q="${name.replace(/&[a-z]+;/g, m => ({ '&iacute;': 'í', '&oacute;': 'ó', '&ouml;': 'ö', '&eth;': 'ð' }[m] || m))}, 101 Reykjavík"><span class="store__map-label">See on map</span></button>
        <div class="store__map"><div><iframe title="${name} on the map" loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen></iframe></div></div>
      </article>`;
const HOURS = ['Hours', '<span class="await">Confirmed hours to follow</span>'];

const PAGES = {
  shop: {
    title: 'Shop &mdash; MJ&Uacute;K Iceland', desc: 'Every piece MJ&Uacute;K Iceland knits, by piece and by fibre. Angora, merino, cashmere, alpaca and silk, Icelandic wool.',
    main: `
  <section class="pg" id="shop">
    <div class="head">
      <span class="head__n">Shop</span>
      <h2 class="head__t" id="shopTitle">Everything</h2>
      <div class="head__end"><span class="mono" id="shopCount">&nbsp;</span></div>
    </div>
    <div class="filt" id="filt">
      <div class="filt__row"><span class="mono">Piece</span><div class="filt__row" id="fType"></div></div>
      <div class="filt__row"><span class="mono">Fibre</span><div class="filt__row" id="fFibre"></div></div>
      <div class="filt__row">
        <span class="mono">Show</span>
        <label class="chk"><input type="checkbox" id="fNew"><span>New</span></label>
        <label class="chk"><input type="checkbox" id="fSale"><span>On sale</span></label>
        <label class="chk"><input type="checkbox" id="fStock" checked><span>In stock only</span></label>
        <div class="filt__end">
          <label class="filt__q"><span class="mono">Search</span><input id="fQ" type="search" placeholder="Marshmallow, cashmere, red&hellip;" autocomplete="off"/></label>
          <span class="sel"><select id="fSort" aria-label="Sort"><option value="featured">Featured</option><option value="new">Newest</option><option value="low">Price, low to high</option><option value="high">Price, high to low</option></select></span>
        </div>
      </div>
    </div>
    <div class="pgrid" id="pgrid"></div>
    <p class="pg__empty" id="pgEmpty" hidden>Nothing matches that. Try one fewer filter.</p>
    <div class="pg__more"><button class="link" id="more" hidden>[ Show more ]</button></div>
  </section>`,
  },
  product: {
    title: 'MJ&Uacute;K Iceland', desc: 'Knitted in Reykjav&iacute;k.',
    main: `
  <section class="pdp" id="pdp">
    <nav class="crumb mono" id="crumb" aria-label="Breadcrumb"></nav>
    <div class="pdp__grid">
      <div class="pdp__gal" id="gal"></div>
      <div class="pdp__info" id="info"></div>
    </div>
  </section>
  <section class="pg" id="family">
    <div class="head">
      <span class="head__n">More in</span>
      <h2 class="head__t" id="famName">this design</h2>
      <div class="head__end">${rnav('famRail')}<span class="mono">Same design, other colours</span></div>
    </div>
    <div class="rail" id="famRail" data-page-rail tabindex="0" aria-label="More in this design"><div class="rail__t" id="famT"></div></div>
  </section>
  <section class="pg" id="with">
    <div class="head">
      <span class="head__n">Wear it with</span>
      <h2 class="head__t" id="withName">the same fibre</h2>
      <div class="head__end">${rnav('withRail')}<span class="mono">Another piece, same fibre</span></div>
    </div>
    <div class="rail" id="withRail" data-page-rail tabindex="0" aria-label="Wear it with"><div class="rail__t" id="withT"></div></div>
  </section>`,
  },
  fibres: {
    title: 'Fibres &mdash; MJ&Uacute;K Iceland', desc: 'The five fibres MJ&Uacute;K knits with, in Anna&rsquo;s own words: angora, merino, cashmere, alpaca and silk, Icelandic wool.',
    main: `
  <section class="pg" id="fibres">
    <div class="head">
      <span class="head__n">Fibres</span>
      <h2 class="head__t">Only natural</h2>
      <div class="head__end"><span class="mono">Five fibres, none of them synthetic</span></div>
    </div>
    <div class="fib" id="fib"></div>
  </section>`,
  },
  stores: {
    title: 'Stores &mdash; MJ&Uacute;K Iceland', desc: 'Four MJ&Uacute;K Iceland stores in Reykjav&iacute;k: Laugavegur 23, Klapparst&iacute;gur 29, Sk&oacute;lav&ouml;r&eth;ust&iacute;gur 4 and 36.',
    main: `
  <section class="stores stp" id="stores">
    <div class="head">
      <span class="head__n">Visit</span>
      <h2 class="head__t">Four doors in Reykjav&iacute;k</h2>
      <div class="head__end"><span class="mono">All within a ten minute walk</span></div>
    </div>
    <div class="stores__grid">
${store('laugavegur-23', '01', 'Store &amp; workshop', 'Laugavegur 23', 'The 1916 house with the Viking mural on the main street. Capes, ponchos and shawls are sewn on the upper floor and made to order.', [HOURS, ['Made here', 'Capes, ponchos and shawls, cut from our blankets. About two hours.'], ['Telephone', '<a href="tel:+3548320567">+354 832 0567</a>']])}
${store('klapparstigur-29', '02', 'Outlet &amp; workshop', 'Klapparst&iacute;gur 29', 'Prototypes and samples at a discount, next door to Laugavegur. Order a custom neckwarmer and watch it come together from scratch.', [HOURS, ['Made here', 'A neckwarmer knitted in front of you in about twenty minutes.'], ['Telephone', '<a href="tel:+3548320567">+354 832 0567</a>']])}
${store('skolavordustigur-36', '03', 'Step-free access', 'Sk&oacute;lav&ouml;r&eth;ust&iacute;gur 36', 'Our largest store, a minute from Hallgr&iacute;mskirkja. Level entry for strollers and wheelchairs.', [HOURS, ['Access', 'Level entry'], ['Telephone', '<a href="tel:+3548320567">+354 832 0567</a>']])}
${store('skolavordustigur-4', '04', 'Step-free access', 'Sk&oacute;lav&ouml;r&eth;ust&iacute;gur 4', 'At the Rainbow, in a 19th century house built of natural stone. Small, warm, and full of colour.', [HOURS, ['Access', 'Level entry'], ['Telephone', '<a href="tel:+3548320567">+354 832 0567</a>']])}
    </div>
    <div class="stores__foot">
      <div class="budin__row"><span class="mono">Online orders</span><a href="mailto:customersupport@mjukiceland.com">customersupport@mjukiceland.com</a></div>
      <div class="budin__row"><span class="mono">Telephone</span><a href="tel:+3548320567">+354 832 0567</a></div>
      <div class="budin__row"><span class="mono">Wholesale</span><a href="mailto:anna@mjukiceland.com">anna@mjukiceland.com</a></div>
    </div>
  </section>
  ${cut('<!-- 09 STOCKISTS -->', '<!-- NEWSLETTER -->')}`,
  },
  story: {
    title: 'The workshop &mdash; MJ&Uacute;K Iceland', desc: 'A family knitwear house in Reykjav&iacute;k with its own workshop above the store.',
    main: `
  <section class="pg" id="story">
    <div class="head">
      <span class="head__n">MJ&Uacute;K</span>
      <h2 class="head__t">Made upstairs</h2>
      <div class="head__end"><span class="mono">Family owned &middot; Reykjav&iacute;k</span></div>
    </div>
    <div class="story">
      <p class="story__lead tr" data-split-me>Mj&uacute;k means soft. It is also what everything in the shop is made to be.</p>
      <div class="story__grid">
        <div class="story__im rv"><img id="storyImg" src="" alt="MJ&Uacute;K Iceland, Laugavegur 23" loading="lazy"/></div>
        <div class="story__col">
          <p class="rv">MJ&Uacute;K is a family knitwear house in Reykjav&iacute;k. The knitting started at home, more than thirty years ago, and grew into a workshop and four stores within a ten minute walk of each other.</p>
          <h3 class="rv">Designed and made here</h3>
          <p class="rv">Every design is Anna&rsquo;s. The hats, scarves and blankets are knitted in Reykjav&iacute;k, and the capes and ponchos are cut from those blankets and sewn on the upper floor of Laugavegur 23, above the shop floor.</p>
          <h3 class="rv">The fibres</h3>
          <p class="rv">Angora, superfine merino, cashmere, Icelandic wool, and an alpaca-and-silk yarn developed with a spinner in Italy for Anna&rsquo;s daughter Lia. Nothing synthetic at heart. <a class="link" href="fibres.html">[ Read about the fibres ]</a></p>
          <h3 class="rv">Small batches</h3>
          <p class="rv">A colourway is knitted in a limited edition. When it is gone, the next one is a different colour. That is why the shop shows what is actually on the shelf, and nothing that is not.</p>
          <p class="rv"><span class="await">Anna&rsquo;s own words and the workshop photographs arrive here</span></p>
        </div>
      </div>
      <div class="story__facts">
        <div class="rv"><b>4</b><span class="mono">Stores in Reykjav&iacute;k</span></div>
        <div class="rv"><b>5</b><span class="mono">Natural fibres</span></div>
        <div class="rv"><b>2h</b><span class="mono">A cape, cut and sewn upstairs</span></div>
        <div class="rv"><b>20m</b><span class="mono">A neckwarmer, made in front of you</span></div>
      </div>
    </div>
  </section>`,
  },
  staff: {
    title: 'Stock &mdash; MJ&Uacute;K staff', desc: 'Mark a piece sold out in two taps.',
    main: `
  <section class="pg" id="staff">
    <div class="head">
      <span class="head__n">Staff</span>
      <h2 class="head__t">Sold out, in two taps</h2>
      <div class="head__end"><span class="mono" id="stfCount">&nbsp;</span></div>
    </div>
    <div class="stf">
      <div class="stf__bar">
        <label class="filt__q"><span class="mono">Find</span><input id="stfQ" type="search" placeholder="Name or product number" autocomplete="off" autofocus/></label>
      </div>
      <p class="stf__note">Tap the button once, then again to confirm. Prototype: for now the change stays in this browser. When the shop connection is live, the same two taps update the website itself, from any phone in any of the four stores.</p>
      <div class="stf__list" id="stfList"></div>
      <div class="stf__more"><button class="link" id="stfMore">[ Show more ]</button></div>
    </div>
    <div class="stf__toast" id="stfToast" role="status" aria-live="polite"></div>
  </section>`,
  },
};

const FILE = { shop: 'shop.html', product: 'product.html', fibres: 'fibres.html', stores: 'store.html', story: 'story.html', staff: 'staff.html' };
for (const [key, p] of Object.entries(PAGES)) {
  let h = head
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${p.title}</title>`)
    .replace(/<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${p.desc}" />`);
  const out = `${h}</head>
<body data-page="${key}">

${bgAndNav}<main id="top">
${p.main}

</main>

${footer}${tail}</html>
`;
  writeFileSync(path.join(root, FILE[key]), out);
  console.log('wrote', FILE[key], (out.length / 1024).toFixed(1) + ' KB');
}
