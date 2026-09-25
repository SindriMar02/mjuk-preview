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
  /* the catalogue helpers and the product page itself live in pdp.js, shared with the build that
     writes every product page's text into its HTML (tools/build-products.mjs) */
  const V = window.CMPDP({ CM, COPY, t, isIS, px, usd });
  const { esc, purl, nm, GRP, FAM, MAT, typeName, famName, matName, matWords, isNew, text, copyOf } = V;

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
    // a prerendered page (product/<slug>/) names its piece; product.html?p=<slug> forwards to that
    // address, so old links and bag links keep working and there is one address per piece
    const pre = document.body.dataset.p, h = pre || Q.get('p');
    if (!pre && h && byHandle[h]) { location.replace(purl(byHandle[h]) + location.hash); return; }
    const p = byHandle[h] || (CM.featuredNew && byHandle[CM.featuredNew[0]]) || CM.all[0];
    if (!p) return;
    document.title = p.t + ' — MJÚK Iceland';
    const v = V.view(p);
    $('#crumb').innerHTML = v.crumb;
    const gal = $('#gal');
    gal.classList.toggle('two', v.imgs.length > 1);
    gal.innerHTML = v.gal;
    $('#info').innerHTML = v.info;
    splitWords($('#pdpT'));
    $$('.pdp__info > *').forEach((el, i) => { if (!el.classList.contains('tr')) { el.classList.add('rv'); el.style.transitionDelay = (i * 60) + 'ms'; } });
    // the text was already in the page: show it at once rather than hide it to reveal it again
    if (pre) $$('.rv, .tr', $('#pdp')).forEach(el => el.classList.add('in'));

    const famSec = $('#family');
    if (v.sib.length) { $('#famName').textContent = v.famTitle; fill($('#famT'), v.sib); }
    else famSec.remove();
    const withSec = $('#with');
    if (v.withL.length) {
      $('#withName').textContent = v.withTitle;
      $('#withNote').textContent = v.withNote;
      fill($('#withT'), v.withL);
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
