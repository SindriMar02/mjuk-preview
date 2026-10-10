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

/* homepage anchors become real pages where one exists; the homepage itself is "./", its canonical
   address (mjukiceland.com/), never index.html, so no internal link goes through a redirect */
const MAP = { '#new': 'shop.html?new=1', '#fibres': 'fibres.html', '#shop': 'shop.html', '#sale': 'shop.html?sale=1', '#made': './#made', '#stores': 'store.html', '#top': './', '#camp': 'story.html', '#lookbook': './#lookbook', '#stockists': 'store.html#stockists' };
const relink = html => html.replace(/href="(#[a-z]+)"/g, (m, h) => `href="${MAP[h] || './' + h}"`);

let head = cut('<!DOCTYPE html>', '</head>');
head = head.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>\n?/g, '');   // the store and the site name belong to the homepage only
head = head.replace(/<!-- home only[^>]*-->\n<script data-home>[\s\S]*?<\/script>\n?/g, '');   // inner pages keep their own #anchors (a store, a material)
if (head.includes('data-home')) throw new Error('the home-only head script was not stripped');
head = head.replace('<link rel="stylesheet" href="configurators.css" />', '<link rel="stylesheet" href="configurators.css" />\n<link rel="stylesheet" href="pages.css" />');
const bgAndNav = relink(cut('<!-- GRAIN-GRADIENT BACKGROUND', '<!-- PRELOADER -->')) + relink(cut('<!-- NAV -->', '<main id="top">'));
const footer = relink(cut('<footer class="foot">', '<!-- BAG DRAWER -->'));
const tail = cut('<!-- BAG DRAWER -->', '</html>')
  .replace('<script defer src="assets/data.js"></script>', '<script defer src="assets/data.js"></script>\n<script defer src="assets/copy.js"></script>')
  .replace(/(<script defer src="configurators.js"><\/script>)/, '$1\n<script defer src="pdp.js"></script>\n<script defer src="pages.js"></script>');
if (!tail.includes('pages.js')) throw new Error('configurators.js script tag not found; pages.js not inserted');

const rnav = id => `<div class="rnav"><button class="rnav__b" data-rail="${id}" data-dir="-1" aria-label="Scroll left">&larr;</button><button class="rnav__b" data-rail="${id}" data-dir="1" aria-label="Scroll right">&rarr;</button></div>`;

// her shop-front photos (Anna, Drive "Shops photos", 2026-10-09), matched to each address by the photos' own
// GPS or Street View, metadata stripped; the homepage cards in index.html carry the same four by hand.
// [width, height of -sm, width of -lg, focus, alt]
const PHOTO = {
  'laugavegur-23': [800, 1067, 1600, '50% 64%', 'The store at Laugavegur 23'],
  'klapparstigur-29': [800, 600, 1280, '58% 60%', 'The outlet at Klapparst&iacute;gur 29'],
  'skolavordustigur-36': [800, 1067, 960, '62% 44%', 'The store at Sk&oacute;lav&ouml;r&eth;ust&iacute;gur 36'],
  'skolavordustigur-4': [800, 600, 1600, '56% 50%', 'The store at Sk&oacute;lav&ouml;r&eth;ust&iacute;gur 4'],
};
const storePhoto = id => { const [w, h, lg, pos, alt] = PHOTO[id], a = `assets/stores/${id}`;
  return `<figure class="store__ph"><img src="${a}-sm.webp" srcset="${a}-sm.webp 800w, ${a}-lg.webp ${lg}w" sizes="(max-width:760px) 90vw, 45vw" width="${w}" height="${h}" alt="${alt}" loading="lazy" decoding="async" style="--pos:${pos}" /></figure>`; };

const store = (id, n, tag, name, note, facts) => `      <article class="store rv" id="${id}">
        ${storePhoto(id)}
        <div class="store__top"><span class="store__ix mono">${n}</span><span class="mono store__tag">${tag}</span></div>
        <h3 class="store__name">${name}</h3>
        <p class="store__note">${note}</p>
        <dl class="store__facts">${facts.map(f => `<dt>${f[0]}</dt><dd>${f[1]}</dd>`).join('')}</dl>
        <button class="store__map-btn" type="button" aria-expanded="false" data-q="${name.replace(/&[a-z]+;/g, m => ({ '&iacute;': 'í', '&oacute;': 'ó', '&ouml;': 'ö', '&eth;': 'ð' }[m] || m))}, 101 Reykjavík"><span class="store__map-label">See on map</span></button>
        <div class="store__map"><div><iframe title="${name} on the map" loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen></iframe></div></div>
      </article>`;
// no opening hours until they are confirmed: her site does not state them (Codex 2026-09-26, a placeholder was showing)

const PAGES = {
  shop: {
    title: 'Shop &mdash; MJ&Uacute;K Iceland', desc: 'Every piece MJ&Uacute;K Iceland knits, by piece, design and material: hats, scarves, gloves, blankets and capes in alpaca and silk, cashmere, merino, Icelandic wool and angora.',
    main: `
  <section class="pg" id="shop">
    <div class="head">
      <span class="head__n">Shop</span>
      <h2 class="head__t" id="shopTitle">Everything</h2>
      <div class="head__end"><span class="mono" id="shopCount">&nbsp;</span></div>
    </div>
    <div class="filt" id="filt">
      <div class="filt__row"><span class="mono">Piece</span><div class="filt__row" id="fType"></div></div>
      <div class="filt__row filt__row--fam" hidden><span class="mono">Design</span><div class="filt__row" id="fFam"></div></div>
      <div class="filt__row"><span class="mono">Material</span><div class="filt__row" id="fFibre"></div></div>
      <div class="filt__row"><span class="mono">Colour</span><div class="filt__row filt__sw" id="fCol" role="group" aria-label="Colour"></div></div>
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
    title: 'MJ&Uacute;K Iceland', desc: 'Made in Iceland.',
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
      <h2 class="head__t" id="withName">Matching pieces</h2>
      <div class="head__end">${rnav('withRail')}<span class="mono" id="withNote">Paired by Anna</span></div>
    </div>
    <div class="rail" id="withRail" data-page-rail tabindex="0" aria-label="Wear it with"><div class="rail__t" id="withT"></div></div>
  </section>`,
  },
  fibres: {
    title: 'Materials &mdash; MJ&Uacute;K Iceland', desc: 'What MJ&Uacute;K knits with, in Anna&rsquo;s own words: alpaca and silk, cashmere, cashmere and merino, merino, Icelandic wool, fluffy angora, smooth angora and merino.',
    main: `
  <section class="pg" id="fibres">
    <div class="head">
      <span class="head__n">Materials</span>
      <h2 class="head__t">What we knit with</h2>
      <div class="head__end"><span class="mono">In Anna&rsquo;s own ranking</span></div>
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
${store('laugavegur-23', '01', 'Store &amp; workshop', 'Laugavegur 23', 'The 1916 house with the Viking mural on the main street. Capes, ponchos and shawls cut from our blankets are sewn on the upper floor and made to order.', [['Open', 'Every day, 10 to 20'], ['Made here', 'Capes, ponchos and shawls, cut from our blankets. About two hours.'], ['Telephone', '<a href="tel:+3548320567">+354 832 0567</a>']])}
${store('klapparstigur-29', '02', 'Outlet &amp; workshop', 'Klapparst&iacute;gur 29', 'Prototypes and samples at a discount, next door to Laugavegur. Order a custom neckwarmer and watch it come together from scratch.', [['Open', 'Every day, 10 to 19'], ['Made here', 'A neckwarmer knitted in front of you in about twenty minutes.'], ['Telephone', '<a href="tel:+3548320567">+354 832 0567</a>']])}
${store('skolavordustigur-36', '03', 'Step-free access', 'Sk&oacute;lav&ouml;r&eth;ust&iacute;gur 36', 'Our largest store, a minute from Hallgr&iacute;mskirkja. Level entry for strollers and wheelchairs.', [['Open', 'Every day, 10 to 20'], ['Access', 'Level entry'], ['Telephone', '<a href="tel:+3548320567">+354 832 0567</a>']])}
${store('skolavordustigur-4', '04', 'Step-free access', 'Sk&oacute;lav&ouml;r&eth;ust&iacute;gur 4', 'At the Rainbow, in a 19th century house built of natural stone. Small, warm, and full of colour.', [['Open', 'Every day, 10 to 20'], ['Access', 'Level entry'], ['Telephone', '<a href="tel:+3548320567">+354 832 0567</a>']])}
    </div>
    <div class="stores__foot">
      <div class="budin__row"><span class="mono">Opening hours</span><span>Every day of the year. 23 December, 10 to 22.</span></div>
      <div class="budin__row"><span class="mono">Online orders</span><a href="mailto:customersupport@mjukiceland.com">customersupport@mjukiceland.com</a></div>
      <div class="budin__row"><span class="mono">Telephone</span><a href="tel:+3548320567">+354 832 0567</a></div>
      <div class="budin__row"><span class="mono">Wholesale</span><a href="mailto:anna@mjukiceland.com">anna@mjukiceland.com</a></div>
    </div>
  </section>
  ${cut('<!-- 09 STOCKISTS -->', '<!-- NEWSLETTER -->')}`,
  },
  story: {
    title: 'Our story &mdash; MJ&Uacute;K Iceland', desc: 'MJ&Uacute;K Iceland today, a factory, two workshops and four stores, and the story of Anna, its designer and owner, in her own words.',
    main: `
  <section class="pg" id="story">
    <div class="head">
      <span class="head__n">MJ&Uacute;K</span>
      <h2 class="head__t">Our story</h2>
      <div class="head__end"><span class="mono">Family owned &middot; Reykjav&iacute;k</span></div>
    </div>
    <div class="story">
      <p class="story__lead tr" data-split-me>Mj&uacute;k means soft. It is also what everything in the shop is made to be.</p>
      <!-- Anna's own words (her doc "MJÚK Iceland story", 2026-10-10, website version: cuts only, small fixes
           listed in 02-clients/clients/mjuk/_from-anna/story-website-version-2026-10-10.html). The Icelandic page
           carries our translation of them (tools/is.json), native read pending. -->
      <div class="story__grid">
        <div class="story__im story__im--sq rv"><img src="assets/story/team-sm.webp" srcset="assets/story/team-sm.webp 640w, assets/story/team-lg.webp 1200w" sizes="(max-width:900px) min(520px, 92vw), 38vw" width="640" height="640" alt="The MJ&Uacute;K team at the knitting machines" loading="lazy" decoding="async"/></div>
        <div class="story__col">
          <h3 class="rv">MJ&Uacute;K Iceland today</h3>
          <p class="rv">Today MJÚK Iceland is an Icelandic manufacturing company with a factory, 2 workshops, 4 stores and 30 people in the team. It started from zero.</p>
          <p class="rv">It took us many years to build the production and it was even more difficult to build the team that feels the same way about making customers happy for many years after they purchase something from us.</p>
          <p class="rv">We don’t have bundle deals or seasonal discounts, for two reasons: 1) MJÚK prefers to work fairly and sell well: we put a small margin on our products to offer the best price possible to everyone who comes to our stores — no tricks or catchy techniques; 2) we want you to buy only what you really love and will enjoy for many years ahead. That is better for you and more sustainable for nature.</p>
          <p class="rv">In 2024 and 2025 we got Company of the Year awards from the Minister of Innovation and the President of Iceland. We continue growing organically, developing new designs and even raw materials (our special baby Suri alpaca with silk). As a company we support Icelandic and Ukrainian charities, organize cultural events for locals and travelers, and just do our best to be a good manufacturer and employer.</p>
          <p class="rv">We invite you to come and enjoy our murals. Our flagship store at Laugavegur 23 is in a historic house built by Guðjón Samúelsson. We have finished a full renovation of the whole exterior and expanded the original mural.</p>
          <p class="rv"><a class="link" href="fibres.html">[ Read about the fibres ]</a></p>
        </div>
      </div>
      <div class="story__facts">
        <div class="rv"><b>4</b><span class="mono">Stores in Reykjav&iacute;k</span></div>
        <div class="rv"><b>30</b><span class="mono">People in the team</span></div>
        <div class="rv"><b>2h</b><span class="mono">A cape, cut and sewn upstairs</span></div>
        <div class="rv"><b>20m</b><span class="mono">A neckwarmer, made in front of you</span></div>
      </div>
      <div class="story__grid story__grid--flip">
        <div class="story__im rv"><img src="assets/story/anna-sm.webp" srcset="assets/story/anna-sm.webp 640w, assets/story/anna-lg.webp 1200w" sizes="(max-width:900px) min(520px, 92vw), 38vw" width="640" height="800" alt="Anna, designer and owner of MJ&Uacute;K Iceland" loading="lazy" decoding="async"/></div>
        <div class="story__col">
          <h3 class="rv">The designer</h3>
          <p class="rv">Life is too short and too precious to choose things that “fit into trends or social expectations” instead of making yourself happy. I dedicate my work to designing and producing soft and cozy garments in hundreds of colors and textures, so that you can find the one that makes you feel really good. It might be too fuzzy or too romantic a color for someone else, but for you it feels just right. When a customer gasps and says “that’s my perfect beanie I have always imagined” or when you come to our store and we recognize a design we produced 10 years ago, that is what makes me obsessed with my job as a designer.</p>
          <p class="rv">Back in 1991 I was a little girl sitting on a stack of blankets while my mother and sister were selling nuts from our garden and pickled cucumbers in −20 °C frost in a big city 2,000 km from our home. We lived in Ukraine and tried to survive the economic turbulence of the 90s. We bought locally produced woolen blankets and food and drove to sell them in Samara, where our granny lived. Times got better and worse: hyperinflation, robberies and corruption destroyed everything we had built several times, yet we always rebuilt it. Once we had to sell our apartment and ate only instant noodles for half a year, but we never failed to pay our employees and creditors. Even in the toughest times our parents took us to all the museums and theaters in Kyiv to develop us culturally. They believe that a strong spirit and belief in the beauty of the world are the most important elements of education.</p>
          <p class="rv">My mom and sister developed the business, and I was with them all the time until I started university and corporate jobs in large multinational companies. I wanted to learn from the best and the biggest and be able to navigate this tough world. I got a Master’s degree in International Financial Management and learnt design and production in practice at the factory. From the age of 20, working at PwC and then at a huge glass production holding in Switzerland taught me a lot, and I came back to our family business with some radical ideas: 1) stop producing cheap products and switch to unique, high-quality ones; 2) risk and bet everything on exporting to the west and north. That’s how we came to Iceland for the first time in 2009. At first we failed, but after years of effort we managed to start selling our blankets and hats here. Then I moved here in 2017, and that is when things really changed. We are grateful for the opportunity to live and work in this beautiful country. In 2019 we opened our first store, in 2020 we started production here, and in 2022 our factory in Ukraine was occupied and we expanded production in Iceland.</p>
          <p class="rv">My main job is to design and produce, but I try to work many shifts in the shops as well — to have direct conversations with customers, to understand you better and to improve my designs constantly.</p>
          <p class="rv story__sign">Hugs,<br>Anna<br><span class="mono">Designer and owner of MJÚK Iceland</span></p>
        </div>
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
