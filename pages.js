/* ══════════════════════════════════════════════════════════════
   MJÚK — inner pages
   Renders shop / product / fibres / stores / story / staff from the
   same live catalogue (window.CM) and her own product copy
   (window.CMCOPY). Reuses app.js's card, price and image helpers via
   window.CMUI, so a card here is pixel-identical to a card on the
   homepage. Loads AFTER app.js, so it runs its own reveal observer.
   ══════════════════════════════════════════════════════════════ */
(() => {
  const CM = window.CM || { all: [] }, U = window.CMUI, COPY = window.CMCOPY || { texts: [], map: {}, care: {} };
  const page = document.body.dataset.page;
  if (!U || !page) return;
  if (window.gsap) gsap.config({ nullTargetWarn: false });   // the shell's hero choreography has no targets here
  const { prod, px, usd, byHandle } = U;
  // Icelandic pages load window.CMI18N (tools/build-is.mjs); English pages fall through to the key
  const t = U.t || (s => s), pieces = U.pieces || (n => `${n} piece${n === 1 ? '' : 's'}`), isIS = document.documentElement.lang === 'is';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const Q = new URLSearchParams(location.search);
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const purl = p => 'product.html?p=' + encodeURIComponent(p.h);
  /* Anna's own classification (tools/groups.json, her sheet "Product groups"): her piece groups,
     her families and her nine materials, each with its Icelandic name beside it */
  const nm = x => (x ? (isIS && x.is) || x.name : '');
  const byKey = list => Object.fromEntries((list || []).map(x => [x.key, x]));
  const GRP = byKey(CM.groups), FAM = byKey(CM.families), MAT = byKey(CM.materials);
  const typeName = k => nm(GRP[k]), famName = k => nm(FAM[k]), matName = k => nm(MAT[k]);
  // what a piece is made of, in her words: one of her nine, or her sentence for a two-sided piece
  const matWords = p => p.mat ? matName(p.mat) : FAM[p.fam] && FAM[p.fam].said ? (isIS && FAM[p.fam].saidIs) || FAM[p.fam].said : '';
  /* her "Matching products", read both ways. A target is a family key, "@group" (every piece in
     that group) or "@group/material". */
  const hits = (tg, x) => { if (tg[0] !== '@') return x.fam === tg; const [g, m] = tg.slice(1).split('/'); return x.tyk === g && (!m || x.mat === m); };
  const goesFor = p => {
    const out = new Set(FAM[p.fam] ? FAM[p.fam].goes : []);
    (CM.families || []).forEach(f => { if (f.key !== p.fam && f.goes.some(tg => hits(tg, p))) out.add(f.key); });
    return [...out];
  };
  const tgName = tg => tg[0] === '@' ? typeName(tg.slice(1).split('/')[0]) : famName(tg);
  const tgHref = tg => { if (tg[0] !== '@') return 'shop.html?family=' + encodeURIComponent(tg); const [g, m] = tg.slice(1).split('/'); return 'shop.html?type=' + g + (m ? '&material=' + m : ''); };
  const isNew = p => (p.cats || []).includes('new');

  /* ── reveal: same .rv grammar as the shell, observed here because app.js
        ran before these nodes existed ── */
  const io = (!reduced && 'IntersectionObserver' in window)
    ? new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px', threshold: .04 })
    : null;
  const reveal = (root = document) => $$('.rv:not(.in), .tr:not(.in)', root).forEach(el => io ? io.observe(el) : el.classList.add('in'));
  /* words rise out of their line; the element keeps its text for search and screen readers */
  const splitWords = el => {
    if (!el || el.dataset.split) return;
    el.dataset.split = '1';
    const words = el.textContent.trim().split(/\s+/);
    el.innerHTML = words.map((w, i) => `<span class="w"><i style="--i:${i}">${esc(w)}</i></span>`).join(' ');
    el.classList.add('tr');
  };

  /* ── her copy: whitelist the tags WordPress wrote, drop everything else ── */
  const clean = html => String(html || '')
    .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<(?!\/?(p|br|strong|em|b|i|ul|ol|li)\b)[^>]*>/gi, '')
    .replace(/<(p|strong|em|b|i|ul|ol|li)\b[^>]*>/gi, '<$1>')
    .replace(/(<br\s*\/?>\s*){3,}/gi, '<br><br>')
    .replace(/\r?\n\s*\r?\n/g, '<br><br>').replace(/\r?\n/g, '<br>')   // WordPress keeps her line breaks as raw newlines
    .trim();
  const text = html => clean(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const copyOf = p => { const m = COPY.map[p.id] || {}; return { short: m.s >= 0 ? COPY.texts[m.s] : '', long: m.l >= 0 ? COPY.texts[m.l] : '', care: m.l >= 0 ? COPY.care[m.l] : '' }; };

  /* ── the shell's card, with a link on it and an honest sold-out state ── */
  const card = (p, i, opt = {}) => {
    const tpl = document.createElement('template'); tpl.innerHTML = prod(p, i).trim();
    const el = tpl.content.firstElementChild;
    el.style.setProperty('--i', String(i % 4));
    const im = $('.prod__im', el);
    const go = document.createElement('a'); go.className = 'prod__go'; go.href = purl(p); go.setAttribute('aria-label', p.t);
    im.insertBefore(go, $('.prod__sizes', el));
    const name = $('.prod__name', el); name.innerHTML = `<a href="${purl(p)}">${esc(p.t)}</a>`;
    if (p.oos) { el.classList.add('prod--oos'); $('.prod__sizes', el).innerHTML = `<span class="mono">${t('Sold out')}</span>`; }
    if (opt.index === false) { const ix = $('.prod__ix', el); if (ix) ix.remove(); }
    return el;
  };
  const fill = (host, list, opt) => { host.replaceChildren(...list.map((p, i) => card(p, i, opt))); reveal(host); };

  /* ── "design" family: the largest non-generic WooCommerce category a product
        sits in (Marshmallow, Roots, Ragnar, 79 beanies …). Colour, fibre and
        seasonal tags are excluded so siblings are the same design, not the
        same shade. ── */
  const GENERIC = new Set(['hats', 'unisexhats', 'pompomhats', 'our-collections', 'sales', 'new', 'uncategorised', 'colors', 'black', 'blue', 'green', 'orange', 'purple', 'grey', 'pinkhats', 'neutralcolors', 'rainbow', 'stripes', 'gradient', 'leaves', 'puffins', 'pompom', 'scarves', 'headbands', 'blankets', 'neckwarmers', 'alpaca', 'cashmere', 'merino-wool', 'angora-wool', 'icelandic-wool', 'alpaca-and-silk', 'angora-and-merino-wool', 'clothesmadeinreykjavik', 'interiortrends2023', 'divashittheroads5', 'akureyri', 'colorful-blankets', 'neutral-blankets', 'unicorn', 'fishbone', 'konungur']);
  const catCount = {}; CM.all.forEach(p => (p.cats || []).forEach(c => { catCount[c] = (catCount[c] || 0) + 1; }));
  const familyKey = p => (p.cats || []).filter(c => !GENERIC.has(c)).sort((a, b) => catCount[b] - catCount[a])[0] || null;
  const familyName = k => k.replace(/marsmallow/, 'marshmallow').replace(/-/g, ' ').replace(/^\w/, c => c.toUpperCase());
  const shown = list => (list || []).filter(x => x.count);

  /* ════════════════════════════ SHOP ════════════════════════════ */
  function shopPage() {
    const st = {
      type: Q.get('type') || '', family: Q.get('family') || '', material: Q.get('material') || '',
      sale: Q.get('sale') === '1', nw: Q.get('new') === '1', stock: Q.get('all') !== '1',
      sort: Q.get('sort') || 'featured', q: Q.get('q') || '', n: 24,
    };
    if (!GRP[st.type]) st.type = '';
    if (!FAM[st.family]) st.family = '';
    if (!MAT[st.material]) st.material = '';
    if (st.family) st.type = FAM[st.family].group;   // a design always sits in its group
    const grid = $('#pgrid'), title = $('#shopTitle'), count = $('#shopCount'), more = $('#more'), empty = $('#pgEmpty');
    /* her groups, then (once a group is chosen) her designs in it, and her materials in her ranking */
    const rows = { type: $('#fType'), family: $('#fFam'), material: $('#fFibre') };
    const lists = {
      type: () => shown(CM.groups),
      family: () => st.type ? shown(CM.families).filter(f => f.group === st.type) : [],
      material: () => shown(CM.materials),
    };
    const paintChips = key => {
      const L = lists[key](), host = rows[key];
      host.innerHTML = L.map(c => `<button class="chip" type="button" data-v="${esc(c.key)}" aria-pressed="${st[key] === c.key}">${esc(nm(c))}<small>${c.count}</small></button>`).join('');
      if (key === 'family') host.closest('.filt__row--fam').hidden = !L.length;
      // on a phone each row scrolls sideways: bring the chosen one into view
      const on = $('[aria-pressed="true"]', host);
      if (on && host.scrollWidth > host.clientWidth) host.scrollLeft += on.getBoundingClientRect().left - host.getBoundingClientRect().left - 8;
    };
    Object.keys(rows).forEach(key => rows[key].addEventListener('click', e => {
      const b = e.target.closest('.chip'); if (!b) return;
      st[key] = st[key] === b.dataset.v ? '' : b.dataset.v;
      if (key === 'type' && st.family && FAM[st.family].group !== st.type) st.family = '';
      Object.keys(rows).forEach(paintChips);
      apply(true);
    }));
    Object.keys(rows).forEach(paintChips);
    const fSale = $('#fSale'), fNew = $('#fNew'), fStock = $('#fStock'), fSort = $('#fSort'), fQ = $('#fQ');
    fSale.checked = st.sale; fNew.checked = st.nw; fStock.checked = st.stock; fSort.value = st.sort; fQ.value = st.q;
    fSale.addEventListener('change', () => { st.sale = fSale.checked; apply(true); });
    fNew.addEventListener('change', () => { st.nw = fNew.checked; apply(true); });
    fStock.addEventListener('change', () => { st.stock = fStock.checked; apply(true); });
    fSort.addEventListener('change', () => { st.sort = fSort.value; apply(true); });
    let qt; fQ.addEventListener('input', () => { clearTimeout(qt); qt = setTimeout(() => { st.q = fQ.value.trim(); apply(true); }, 180); });
    more.addEventListener('click', () => { st.n += 24; apply(false); });

    const featuredRank = {}; (CM.featuredNew || []).concat(CM.own || []).forEach((h, i) => { if (!(h in featuredRank)) featuredRank[h] = i; });
    // search reads her names too, in the page's language: "marshmallow", "cashmere", "húfur"
    const words = p => (p.t + ' ' + (p.comp || '') + ' ' + famName(p.fam) + ' ' + matWords(p) + ' ' + typeName(p.tyk)).toLowerCase();
    const list = () => {
      const q = st.q.toLowerCase();
      let L = CM.all.filter(p =>
        (!st.type || p.tyk === st.type) && (!st.family || p.fam === st.family) && (!st.material || p.mat === st.material) &&
        (!st.sale || p.cp > 0) && (!st.nw || isNew(p)) && (!st.stock || !p.oos) && (!q || words(p).includes(q)));
      if (st.sort === 'low') L.sort((a, b) => a.p - b.p);
      else if (st.sort === 'high') L.sort((a, b) => b.p - a.p);
      else if (st.sort === 'new') L.sort((a, b) => (isNew(b) - isNew(a)) || (b.id - a.id));
      else L.sort((a, b) => ((a.h in featuredRank ? featuredRank[a.h] : 1e6) - (b.h in featuredRank ? featuredRank[b.h] : 1e6)) || (a.oos - b.oos));
      return L;
    };
    const heading = () => st.q ? (isIS ? `„${st.q}“` : `“${st.q}”`) : st.sale ? t('Last of the line') : st.nw ? t('New this season')
      : st.family ? famName(st.family) : st.type ? typeName(st.type) : st.material ? matName(st.material) : t('Everything');
    const apply = reset => {
      if (reset) st.n = 24;
      const L = list();
      title.textContent = heading();
      document.title = heading() + ' — ' + t('Shop') + ' — MJÚK Iceland';
      count.textContent = pieces(L.length) + (st.stock ? '' : ' ' + t('incl. sold out'));
      const shownL = L.slice(0, st.n);
      if (reset) fill(grid, shownL);
      else { const have = grid.children.length; const add = shownL.slice(have).map((p, i) => card(p, have + i)); grid.append(...add); reveal(grid); }
      more.hidden = L.length <= st.n; empty.hidden = L.length > 0;
      const u = new URLSearchParams();
      if (st.type) u.set('type', st.type); if (st.family) u.set('family', st.family); if (st.material) u.set('material', st.material);
      if (st.sale) u.set('sale', '1'); if (st.nw) u.set('new', '1');
      if (!st.stock) u.set('all', '1'); if (st.sort !== 'featured') u.set('sort', st.sort); if (st.q) u.set('q', st.q);
      history.replaceState(null, '', location.pathname + (u.toString() ? '?' + u : ''));
    };
    apply(true);
    if (Q.get('focus') === 'q') fQ.focus();
  }

  /* ═══════════════════════════ PRODUCT ══════════════════════════ */
  function productPage() {
    const p = byHandle[Q.get('p')] || (CM.featuredNew && byHandle[CM.featuredNew[0]]) || CM.all[0];
    if (!p) return;
    document.title = p.t + ' — MJÚK Iceland';
    const c = copyOf(p);
    const fam = FAM[p.fam] ? null : familyKey(p);   // her family first; outside her sheet, the shop's category
    const imgs = [...new Set((p.img || []).filter(Boolean))];

    $('#crumb').innerHTML = `<a href="shop.html">${t('Shop')}</a><i>/</i>${GRP[p.tyk] ? `<a href="shop.html?type=${esc(p.tyk)}">${esc(typeName(p.tyk))}</a><i>/</i>` : ''}${FAM[p.fam] ? `<a href="shop.html?family=${esc(p.fam)}">${esc(famName(p.fam))}</a><i>/</i>` : ''}<span>${esc(p.t)}</span>`;
    const gal = $('#gal');
    gal.classList.toggle('two', imgs.length > 1);
    gal.innerHTML = imgs.map((u, i) => `<figure class="pdp__fig rv"><img src="${px(u, 1200)}" alt="${esc(p.t)}${i ? ', ' + t('detail') : ''}" ${i ? 'loading="lazy"' : 'fetchpriority="high"'}/></figure>`).join('');

    const plainHat = p.tyk === 'hats' && !/pom ?pom/i.test(p.t);
    const price = p.cp
      ? `<s>${usd(p.cp)}</s><span>${usd(p.p)}</span><span class="pdp__save">${t('Save')} ${Math.round((1 - p.p / p.cp) * 100)}%</span>`
      : `<span>${usd(p.p)}</span>`;
    // her matching pieces that are in the shop today, as links to them
    const goes = goesFor(p).filter(tg => CM.all.some(x => x !== p && hits(tg, x)));
    const facts = [
      [t('Material'), matWords(p)],
      [t('Composition'), p.comp || ''],
      /* facts only where her own text states them: size and origin come from it, never a default */
      [t('Size'), /\bone[- ]size\b/i.test(c.short + ' ' + c.long) ? t('One size') : ''],
      [t('Made'), t(p.mi || '')],
      [t('Care'), c.care ? c.care.replace(/-\s/g, ': ').replace(/\s+/g, ' ') : ''],
      /* from her own shipping zones (tools/pull-woo.mjs), never a number written here */
      [t('Delivery'), (CM.ship && (isIS && CM.ship.deliveryIs || CM.ship.delivery)) || ''],
      [t('Goes with'), goes.map(tg => `<a href="${tgHref(tg)}">${esc(tgName(tg))}</a>`).join(', '), true],
    ].filter(f => f[1]);
    $('#info').innerHTML = `
      <div class="pdp__kick mono">${p.mat ? `<span>${esc(matName(p.mat))}</span>` : ''}${FAM[p.fam] ? `<span>${esc(famName(p.fam))}</span>` : GRP[p.tyk] ? `<span>${esc(typeName(p.tyk))}</span>` : ''}${isNew(p) ? `<span class="is-new">${t('New')}</span>` : ''}${p.cp ? `<span class="is-new">${t('Sale')}</span>` : ''}</div>
      <h1 class="pdp__t" id="pdpT">${esc(p.t)}</h1>
      <div class="pdp__price">${price}</div>
      ${c.short ? `<div class="pdp__short">${clean(c.short)}</div>` : ''}
      <div class="pdp__add">
        ${p.oos
          ? `<div class="pdp__oos"><span class="mono">${t('Sold out online')}</span><span>${t('Every colourway is a limited edition.')} <a href="mailto:customersupport@mjukiceland.com?subject=${encodeURIComponent(p.t)}">${t('Ask the store')}</a> ${t('whether one is left on a shelf in Reykjavík.')}</span></div>`
          : `<button class="sz sz--solo${plainHat ? ' pom-ask' : ''}" data-h="${esc(p.h)}" data-s="">${t('Add to bag')}</button>`}
        ${plainHat && !p.oos ? `<p class="pdp__hint mono">${t('A plain hat.')} <b>${t('Pompoms are chosen in the next step')}</b>${t(', none, one or two.')}</p>` : ''}
      </div>
      <dl class="pdp__facts">${facts.map(f => `<dt>${f[0]}</dt><dd>${f[2] ? f[1] : esc(f[1])}</dd>`).join('')}</dl>
      ${c.long && text(c.long) !== text(c.short) ? `<details class="pdp__desc" open><summary>${t('Description')}</summary><div class="pdp__body">${clean(c.long)}</div></details>` : ''}`;
    splitWords($('#pdpT'));
    $$('.pdp__info > *').forEach((el, i) => { if (!el.classList.contains('tr')) { el.classList.add('rv'); el.style.transitionDelay = (i * 60) + 'ms'; } });

    /* rails: the same design in other colours (her family), then what she pairs it with (her
       Matching products), or, where she has not paired it, another piece in the same material */
    const sib = FAM[p.fam] ? CM.all.filter(x => x !== p && x.fam === p.fam)
      : fam ? CM.all.filter(x => x !== p && (x.cats || []).includes(fam)) : CM.all.filter(x => x !== p && x.tyk === p.tyk && x.mat === p.mat);
    sib.sort((a, b) => a.oos - b.oos);
    const famSec = $('#family');
    if (sib.length) { $('#famName').textContent = FAM[p.fam] ? famName(p.fam) : fam ? familyName(fam) : (typeName(p.tyk) || t('this piece')); fill($('#famT'), sib.slice(0, 12)); }
    else famSec.remove();
    // one piece from each paired design in turn, so a long pairing list is not all one design
    const byTarget = goes.map(tg => CM.all.filter(x => x !== p && !x.oos && x.fam !== p.fam && hits(tg, x)));
    const paired = []; for (let r = 0; paired.length < 12 && byTarget.some(l => l.length > r); r++) for (const l of byTarget) if (l[r] && paired.length < 12 && !paired.includes(l[r])) paired.push(l[r]);
    const withL = paired.length ? paired : p.mat ? CM.all.filter(x => x !== p && !x.oos && x.mat === p.mat && x.tyk && x.tyk !== p.tyk).sort((a, b) => (isNew(b) - isNew(a))).slice(0, 12) : [];
    const withSec = $('#with');
    if (withL.length) {
      $('#withName').textContent = paired.length ? t('Matching pieces') : matName(p.mat);
      $('#withNote').textContent = paired.length ? t('Paired by Anna') : t('Another piece, same material');
      fill($('#withT'), withL);
    } else withSec.remove();
    rails();
  }

  /* horizontal rails on inner pages (app.js wired only the homepage's two) */
  function rails() {
    $$('.rail[data-page-rail]').forEach(el => {
      let down = false, sx = 0, sl = 0, moved = 0;
      el.addEventListener('pointerdown', e => { if (e.pointerType === 'touch') return; down = true; moved = 0; sx = e.clientX; sl = el.scrollLeft; el.classList.add('drag'); el.setPointerCapture(e.pointerId); });
      el.addEventListener('pointermove', e => { if (!down) return; const d = e.clientX - sx; moved = Math.abs(d); el.scrollLeft = sl - d; });
      const up = () => { down = false; el.classList.remove('drag'); };
      el.addEventListener('pointerup', up); el.addEventListener('pointerleave', up);
      el.addEventListener('click', e => { if (moved > 6) { e.preventDefault(); e.stopPropagation(); } }, true);
      const btns = $$(`.rnav__b[data-rail="${el.id}"]`);
      const sync = () => { const max = el.scrollWidth - el.clientWidth - 2; btns.forEach(b => { b.disabled = +b.dataset.dir < 0 ? el.scrollLeft <= 2 : el.scrollLeft >= max; }); };
      btns.forEach(b => b.addEventListener('click', () => { const c = $('.prod', el); const step = c ? c.getBoundingClientRect().width + 24 : el.clientWidth * .8; el.scrollBy({ left: step * +b.dataset.dir, behavior: reduced ? 'auto' : 'smooth' }); }));
      el.addEventListener('scroll', sync, { passive: true }); addEventListener('resize', sync, { passive: true }); sync();
    });
  }

  /* ═══════════════════════════ MATERIALS ═══════════════════════
     Her nine materials (tools/groups.json), in her own ranking: prestige first, then popularity.
     A material with nothing in the shop yet is left out. Every sentence in quotes is hers, lifted
     from her product copy on mjukiceland.com; the unquoted lines only state what the catalogue
     shows (compositions, designs, counts). The designs under each are her families, from the data. */
  const FIBRES = {
    'alpaca-silk': { lead: 'Baby alpaca with silk, a yarn developed for MJÚK in Italy.',
      p: 'Eighty-eight percent baby alpaca, twelve percent silk, in the Lía beanies and scarves, named after the daughter it was first made for.',
      q: ['“After more than one year, our designer in Iceland, Anna, and our yarn supplier in Italy have developed a totally new raw material: Alpaca with silk. Anna developed it for her baby daughter Lia.”', '“Light and non-itchy, even for sensitive skin.”'] },
    'cashmere': { lead: 'Pure cashmere.',
      p: 'One hundred percent in the Viking beanies. Ninety-eight in the Greenland beanies, with two percent elastane to hold the edge.',
      q: ['“Made of certified ethically sourced pure cashmere.”'] },
    'cashmere-merino': { lead: 'Cashmere carried on superfine merino.',
      p: 'Ten percent cashmere in the Akureyri blankets, twenty in the Konungur blankets and the Empress cape, thirty in the Explorer hats and scarves.',
      q: ['“Irresistibly soft blend of cashmere and the highest sort of superfine merino wool.”'] },
    'merino': { lead: 'Superfine merino, smooth against the skin and never scratchy.',
      p: 'On its own in the Arctic and Ragnar beanies, the unisex aviator hats, and the Ragnar scarves and gloves.',
      q: ['“This is superfine Merino wool in its truest form: smooth, clean, and refined.”', '“Merino is nature’s own regulator. It traps heat when you’re out in the frost but breathes the moment you step into a warm café.”'] },
    'icelandic-wool': { lead: 'Icelandic wool, from the Unicorn blankets to the Gudmundur beanies.',
      p: 'The Gudmundur beanies are ninety percent Icelandic wool, softened with five percent angora and five percent superfine merino.',
      q: ['“Unicorn is thicker than Akureyri blankets, thicker and more rough wool, but has got higher resistance against wind and rain.”', '“90% top quality Icelandic wool, 5% angora, 5% superfine merino wool.”'] },
    'fluffy-angora': { lead: 'The fluffiest pieces in the shop, light and weightless.',
      p: 'Angora blended so it holds its shape: seventy percent with nylon and merino in the Roots beanies, sixty with nylon in the Fluffy Kitty hats.',
      q: ['“Fluffy and soft angora wool blend. Flexible adjustable fit.”', '“The name of the hat was the best to describe how soft and weightless it is.”'] },
    'smooth-angora-merino': { lead: 'Angora with a smooth, silky finish.',
      p: 'Half angora, with viscose for the silky feel, wool for warmth, and nylon or acrylic so it lasts.',
      q: ['“50% angora for warmth and light fluffiness, 15% viscose for silky feeling.”', '“The softest hat in Iceland.”'] },
  };
  function fibresPage() {
    const host = $('#fib');
    const mats = shown(CM.materials).filter(m => FIBRES[m.key]);
    host.innerHTML = mats.map((m, i) => {
      const f = FIBRES[m.key];
      const pool = CM.all.filter(p => p.mat === m.key && !p.oos);
      const im = pool[0] ? px(pool[0].img[0], 900) : '';
      const designs = shown(CM.families).filter(x => CM.all.some(p => p.fam === x.key && p.mat === m.key));
      return `<article class="fib__ch" id="${esc(m.key)}">
        <div class="fib__im rv"><span class="head__n">0${i + 1}.</span>${im ? `<img src="${im}" alt="${esc(nm(m))}" loading="${i ? 'lazy' : 'eager'}"/>` : ''}</div>
        <div class="fib__body">
          <h2 class="fib__name tr${nm(m).length > 16 ? ' fib__name--long' : ''}" data-name>${esc(nm(m))}</h2>
          <p class="fib__lead rv">${esc(t(f.lead))}</p>
          <p class="fib__p rv">${esc(t(f.p))}</p>
          ${f.q.map(q => `<p class="fib__q rv">${esc(q)}</p>`).join('')}
          ${designs.length ? `<p class="fib__des rv"><span class="mono">${t('Designs')}</span>${designs.map(x => `<a href="shop.html?family=${esc(x.key)}">${esc(nm(x))}</a>`).join('')}</p>` : ''}
          <div class="fib__meta rv"><span class="mono">${pieces(m.count)}</span><a class="link" href="shop.html?material=${esc(m.key)}">[ ${t('Shop')} ${esc(nm(m).toLowerCase())} ]</a></div>
          <div class="fib__mini" data-mini></div>
        </div>
      </article>`;
    }).join('');
    $$('[data-name]', host).forEach(splitWords);
    $$('.fib__ch', host).forEach(ch => { const key = ch.id; fill($('[data-mini]', ch), CM.all.filter(p => p.mat === key && !p.oos).slice(0, 3), { index: false }); });
    reveal(host);
    if (location.hash) { const t = $(location.hash); if (t) setTimeout(() => t.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' }), 250); }
  }

  /* ═══════════════════════════ STORES ═══════════════════════════ */
  function storesPage() {
    const s = Q.get('s');
    if (!s) return;
    const el = document.getElementById(s); if (!el) return;
    el.classList.add('is-here');
    setTimeout(() => { el.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' }); const b = $('.store__map-btn', el); if (b && !el.classList.contains('is-open')) b.click(); }, 300);
  }

  /* ═══════════════════════════ STAFF ════════════════════════════
     "Mark sold out in two taps". Prototype: the toggles are kept in this
     browser only. When the WooCommerce connection is live the same tap
     writes stock_status on the product. */
  function staffPage() {
    const KEY = 'mjuk_staff_oos';
    let local = {}; try { local = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) {}
    const oos = p => (p.id in local) ? !!local[p.id] : !!p.oos;
    const list = $('#stfList'), q = $('#stfQ'), cnt = $('#stfCount'), more = $('#stfMore'), toast = $('#stfToast');
    let n = 40, arm = null, armT;
    const rows = () => {
      const s = q.value.trim().toLowerCase();
      const L = CM.all.filter(p => !s || p.t.toLowerCase().includes(s) || String(p.id) === s);
      cnt.textContent = `${L.length} ${t('products')} · ${L.filter(oos).length} ${t('sold out')}`;
      list.innerHTML = L.slice(0, n).map(p => `<div class="stf__row${oos(p) ? ' is-oos' : ''}" data-id="${p.id}">
        <img src="${px(p.img[0], 160)}" alt="" loading="lazy"/>
        <div class="stf__nm">${esc(p.t)}<small>${esc(p.comp || matWords(p))} · ${usd(p.p)}</small></div>
        <button class="stf__btn" type="button">${oos(p) ? t('Back in stock') : t('Sold out')}</button>
      </div>`).join('');
      more.hidden = L.length <= n;
    };
    const say = m => { toast.textContent = m; toast.classList.add('on'); clearTimeout(say.t); say.t = setTimeout(() => toast.classList.remove('on'), 1800); };
    list.addEventListener('click', e => {
      const b = e.target.closest('.stf__btn'); if (!b) return;
      const row = b.closest('.stf__row'), id = +row.dataset.id, p = CM.all.find(x => x.id === id);
      if (arm !== b) {                                  // tap one: arm
        if (arm) { arm.classList.remove('is-arm'); arm.textContent = oos(CM.all.find(x => x.id === +arm.closest('.stf__row').dataset.id)) ? t('Back in stock') : t('Sold out'); }
        arm = b; b.classList.add('is-arm'); b.textContent = t('Tap again to confirm');
        clearTimeout(armT); armT = setTimeout(() => { if (arm === b) { b.classList.remove('is-arm'); b.textContent = oos(p) ? t('Back in stock') : t('Sold out'); arm = null; } }, 3000);
        return;
      }
      clearTimeout(armT); arm = null;                    // tap two: do it
      local[id] = !oos(p); try { localStorage.setItem(KEY, JSON.stringify(local)); } catch (e) {}
      row.classList.toggle('is-oos', local[id]); b.classList.remove('is-arm'); b.textContent = local[id] ? t('Back in stock') : t('Sold out');
      cnt.textContent = `${CM.all.filter(p => { const s = q.value.trim().toLowerCase(); return !s || p.t.toLowerCase().includes(s) || String(p.id) === s; }).length} ${t('products')} · ${CM.all.filter(oos).length} ${t('sold out')}`;
      say(local[id] ? t('Marked sold out') : t('Back in stock'));
    });
    let qt; q.addEventListener('input', () => { clearTimeout(qt); qt = setTimeout(() => { n = 40; rows(); }, 150); });
    more.addEventListener('click', () => { n += 40; rows(); });
    rows();
  }

  /* ── search in the nav goes to the shop with the field focused ── */
  const sb = $('#searchBtn'); if (sb) sb.addEventListener('click', () => { if (page === 'shop') { const f = $('#fQ'); f && f.focus(); } else location.href = 'shop.html?focus=q'; });

  const storyPage = () => { const im = $('#storyImg'); if (im && CM.campaign && CM.campaign[0]) im.src = px(CM.campaign[0], 1100); };
  ({ shop: shopPage, product: productPage, fibres: fibresPage, stores: storesPage, staff: staffPage, story: storyPage })[page]?.();
  $$('[data-split-me]').forEach(splitWords);
  reveal();
})();
