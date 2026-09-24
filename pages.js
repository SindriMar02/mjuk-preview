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
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const Q = new URLSearchParams(location.search);
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const purl = p => 'product.html?p=' + encodeURIComponent(p.h);
  const typeName = k => ((CM.types || []).find(t => t.key === k) || {}).name || '';
  const fibName = k => ((CM.cats || []).find(t => t.key === k) || {}).name || '';
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
    const t = document.createElement('template'); t.innerHTML = prod(p, i).trim();
    const el = t.content.firstElementChild;
    el.style.setProperty('--i', String(i % 4));
    const im = $('.prod__im', el);
    const go = document.createElement('a'); go.className = 'prod__go'; go.href = purl(p); go.setAttribute('aria-label', p.t);
    im.insertBefore(go, $('.prod__sizes', el));
    const name = $('.prod__name', el); name.innerHTML = `<a href="${purl(p)}">${esc(p.t)}</a>`;
    if (p.oos) { el.classList.add('prod--oos'); $('.prod__sizes', el).innerHTML = '<span class="mono">Sold out</span>'; }
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

  /* ════════════════════════════ SHOP ════════════════════════════ */
  function shopPage() {
    const st = {
      type: Q.get('type') || '', fibre: Q.get('fibre') || '',
      sale: Q.get('sale') === '1', nw: Q.get('new') === '1', stock: Q.get('all') !== '1',
      sort: Q.get('sort') || 'featured', q: Q.get('q') || '', n: 24,
    };
    const grid = $('#pgrid'), title = $('#shopTitle'), count = $('#shopCount'), more = $('#more'), empty = $('#pgEmpty');
    const chips = (host, list, key) => {
      host.innerHTML = list.map(c => `<button class="chip" type="button" data-v="${esc(c.key)}" aria-pressed="${st[key] === c.key}">${esc(c.name)}<small>${c.count}</small></button>`).join('');
      host.addEventListener('click', e => {
        const b = e.target.closest('.chip'); if (!b) return;
        st[key] = st[key] === b.dataset.v ? '' : b.dataset.v;
        $$('.chip', host).forEach(x => x.setAttribute('aria-pressed', String(x.dataset.v === st[key])));
        apply(true);
      });
    };
    chips($('#fType'), CM.types || [], 'type');
    chips($('#fFibre'), CM.cats || [], 'fibre');
    const fSale = $('#fSale'), fNew = $('#fNew'), fStock = $('#fStock'), fSort = $('#fSort'), fQ = $('#fQ');
    fSale.checked = st.sale; fNew.checked = st.nw; fStock.checked = st.stock; fSort.value = st.sort; fQ.value = st.q;
    fSale.addEventListener('change', () => { st.sale = fSale.checked; apply(true); });
    fNew.addEventListener('change', () => { st.nw = fNew.checked; apply(true); });
    fStock.addEventListener('change', () => { st.stock = fStock.checked; apply(true); });
    fSort.addEventListener('change', () => { st.sort = fSort.value; apply(true); });
    let qt; fQ.addEventListener('input', () => { clearTimeout(qt); qt = setTimeout(() => { st.q = fQ.value.trim(); apply(true); }, 180); });
    more.addEventListener('click', () => { st.n += 24; apply(false); });

    const featuredRank = {}; (CM.featuredNew || []).concat(CM.own || []).forEach((h, i) => { if (!(h in featuredRank)) featuredRank[h] = i; });
    const list = () => {
      const q = st.q.toLowerCase();
      let L = CM.all.filter(p =>
        (!st.type || p.tyk === st.type) && (!st.fibre || p.fib === st.fibre) &&
        (!st.sale || p.cp > 0) && (!st.nw || isNew(p)) && (!st.stock || !p.oos) &&
        (!q || (p.t + ' ' + (p.comp || '') + ' ' + (p.ty || '')).toLowerCase().includes(q)));
      if (st.sort === 'low') L.sort((a, b) => a.p - b.p);
      else if (st.sort === 'high') L.sort((a, b) => b.p - a.p);
      else if (st.sort === 'new') L.sort((a, b) => (isNew(b) - isNew(a)) || (b.id - a.id));
      else L.sort((a, b) => ((a.h in featuredRank ? featuredRank[a.h] : 1e6) - (b.h in featuredRank ? featuredRank[b.h] : 1e6)) || (a.oos - b.oos));
      return L;
    };
    const heading = () => st.q ? `“${st.q}”` : st.sale ? 'Last of the line' : st.nw ? 'New this season' : st.type ? typeName(st.type) : st.fibre ? fibName(st.fibre) : 'Everything';
    const apply = reset => {
      if (reset) st.n = 24;
      const L = list();
      title.textContent = heading();
      document.title = heading() + ' — Shop — MJÚK Iceland';
      count.textContent = `${L.length} piece${L.length === 1 ? '' : 's'}` + (st.stock ? '' : ' incl. sold out');
      const shown = L.slice(0, st.n);
      if (reset) fill(grid, shown);
      else { const have = grid.children.length; const add = shown.slice(have).map((p, i) => card(p, have + i)); grid.append(...add); reveal(grid); }
      more.hidden = L.length <= st.n; empty.hidden = L.length > 0;
      const u = new URLSearchParams();
      if (st.type) u.set('type', st.type); if (st.fibre) u.set('fibre', st.fibre); if (st.sale) u.set('sale', '1'); if (st.nw) u.set('new', '1');
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
    const fam = familyKey(p);
    const imgs = [...new Set((p.img || []).filter(Boolean))];

    $('#crumb').innerHTML = `<a href="shop.html">Shop</a><i>/</i>${p.tyk ? `<a href="shop.html?type=${esc(p.tyk)}">${esc(typeName(p.tyk))}</a><i>/</i>` : ''}<span>${esc(p.t)}</span>`;
    const gal = $('#gal');
    gal.classList.toggle('two', imgs.length > 1);
    gal.innerHTML = imgs.map((u, i) => `<figure class="pdp__fig rv"><img src="${px(u, 1200)}" alt="${esc(p.t)}${i ? ', detail' : ''}" ${i ? 'loading="lazy"' : 'fetchpriority="high"'}/></figure>`).join('');

    const plainHat = p.tyk === 'hats' && !/pom ?pom/i.test(p.t);
    const price = p.cp
      ? `<s>${usd(p.cp)}</s><span>${usd(p.p)}</span><span class="pdp__save">Save ${Math.round((1 - p.p / p.cp) * 100)}%</span>`
      : `<span>${usd(p.p)}</span>`;
    const facts = [
      ['Fibre', p.fib ? fibName(p.fib) : ''],
      ['Composition', p.comp || ''],
      /* facts only where her own text states them: size and origin come from it, never a default */
      ['Size', /\bone[- ]size\b/i.test(c.short + ' ' + c.long) ? 'One size' : ''],
      ['Made', p.mi || ''],
      ['Care', c.care ? c.care.replace(/-\s/g, ': ').replace(/\s+/g, ' ') : ''],
      /* no free-shipping threshold until her real shipping settings are read (her orders suggest $250, not $150) */
      ['Delivery', 'DHL Express, worldwide.'],
    ].filter(f => f[1]);
    $('#info').innerHTML = `
      <div class="pdp__kick mono">${p.fib ? `<span>${esc(fibName(p.fib))}</span>` : ''}${p.tyk ? `<span>${esc(typeName(p.tyk))}</span>` : ''}${isNew(p) ? '<span class="is-new">New</span>' : ''}${p.cp ? '<span class="is-new">Sale</span>' : ''}</div>
      <h1 class="pdp__t" id="pdpT">${esc(p.t)}</h1>
      <div class="pdp__price">${price}</div>
      ${c.short ? `<div class="pdp__short">${clean(c.short)}</div>` : ''}
      <div class="pdp__add">
        ${p.oos
          ? `<div class="pdp__oos"><span class="mono">Sold out online</span><span>Every colourway is a limited edition. <a href="mailto:customersupport@mjukiceland.com?subject=${encodeURIComponent(p.t)}">Ask the store</a> whether one is left on a shelf in Reykjavík.</span></div>`
          : `<button class="sz sz--solo${plainHat ? ' pom-ask' : ''}" data-h="${esc(p.h)}" data-s="">Add to bag</button>`}
        ${plainHat && !p.oos ? `<p class="pdp__hint mono">A plain hat. <b>Pompoms are chosen in the next step</b>, none, one or two.</p>` : ''}
      </div>
      <dl class="pdp__facts">${facts.map(f => `<dt>${f[0]}</dt><dd>${esc(f[1])}</dd>`).join('')}</dl>
      ${c.long && text(c.long) !== text(c.short) ? `<details class="pdp__desc" open><summary>Description</summary><div class="pdp__body">${clean(c.long)}</div></details>` : ''}`;
    splitWords($('#pdpT'));
    $$('.pdp__info > *').forEach((el, i) => { if (!el.classList.contains('tr')) { el.classList.add('rv'); el.style.transitionDelay = (i * 60) + 'ms'; } });

    /* rails: the same design in other colours, then the same fibre in another piece */
    const sib = fam ? CM.all.filter(x => x !== p && (x.cats || []).includes(fam)) : CM.all.filter(x => x !== p && x.tyk === p.tyk && x.fib === p.fib);
    sib.sort((a, b) => a.oos - b.oos);
    const famSec = $('#family');
    if (sib.length) { $('#famName').textContent = fam ? familyName(fam) : (typeName(p.tyk) || 'this piece'); fill($('#famT'), sib.slice(0, 12)); }
    else famSec.remove();
    const withL = CM.all.filter(x => x !== p && !x.oos && x.fib === p.fib && x.tyk && x.tyk !== p.tyk);
    withL.sort((a, b) => (isNew(b) - isNew(a)));
    const withSec = $('#with');
    if (withL.length) { $('#withName').textContent = fibName(p.fib) || 'the same fibre'; fill($('#withT'), withL.slice(0, 12)); }
    else withSec.remove();
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

  /* ═══════════════════════════ FIBRES ═══════════════════════════
     Every sentence in quotes below is hers, lifted from live product copy
     on mjukiceland.com. The unquoted lines only state what the catalogue
     itself shows (compositions, counts). Nothing here is invented. */
  const FIBRES = [
    { key: 'angora', lead: 'The fibre most of the shop is knitted from: light, warm, and impossibly soft.',
      p: 'Angora is blended so it holds its shape: with silk and wool, or with merino, and in the chunkier knits with a little polyamide for structure. It is the fibre behind the Marshmallow, Roots, Tenderness and Ragnar designs.',
      q: ['“Fluffy and soft angora wool blend. Flexible adjustable fit.”', '“Crafted from fluffy angora for a delightfully soft finish.”'] },
    { key: 'merino', lead: 'Superfine merino, smooth against the skin and never scratchy.',
      p: 'Used on its own in the Arctic and aviator hats and the merino scarves, and as the backbone of the cashmere blends.',
      q: ['“This is superfine Merino wool in its truest form: smooth, clean, and refined.”', '“Merino is nature’s own regulator. It traps heat when you’re out in the frost but breathes the moment you step into a warm café.”'] },
    { key: 'cashmere', lead: 'Pure cashmere, and cashmere carried on merino at ten, twenty and thirty percent.',
      p: 'The Viking beanies and the Explorer scarves. A small part of the range, and the part that sells out first, so a colour that is here now is usually not here next season.',
      q: [] },
    { key: 'alpaca-silk', lead: 'Baby suri alpaca with silk, a yarn developed for MJÚK in Italy.',
      p: 'Eighty-eight percent baby suri alpaca, twelve percent silk. The Lia scarves are made from it, named after the daughter it was first made for.',
      q: ['“After more than one year, our designer in Iceland, Anna, and our yarn supplier in Italy have developed a totally new raw material: Alpaca with silk. Anna developed it for her baby daughter Lia.”', '“Hypoallergenic: extra soft scarf that will keep you warm and give the weightless feeling on your shoulders and around the neck.”'] },
    { key: 'icelandic-wool', lead: 'Icelandic wool, softened with a little angora and merino.',
      p: 'Ninety percent Icelandic wool, five percent angora, five percent superfine merino. The Greenland and Guðmundur beanies, and the blankets the capes and ponchos are cut from.',
      q: ['“90% top quality Icelandic wool, 5% angora, 5% superfine merino wool.”'] },
  ];
  function fibresPage() {
    const host = $('#fib');
    host.innerHTML = FIBRES.map((f, i) => {
      const cat = (CM.cats || []).find(c => c.key === f.key) || { name: f.key, count: 0, pool: [] };
      const pool = CM.all.filter(p => p.fib === f.key && !p.oos);
      const pick = pool.slice(0, 3);
      const im = pool[0] ? px(pool[0].img[0], 900) : '';
      return `<article class="fib__ch" id="${esc(f.key)}">
        <div class="fib__im rv"><span class="head__n">0${i + 1}.</span>${im ? `<img src="${im}" alt="${esc(cat.name)}" loading="${i ? 'lazy' : 'eager'}"/>` : ''}</div>
        <div class="fib__body">
          <h2 class="fib__name tr" data-name>${esc(cat.name)}</h2>
          <p class="fib__lead rv">${esc(f.lead)}</p>
          <p class="fib__p rv">${esc(f.p)}</p>
          ${f.q.map(q => `<p class="fib__q rv">${esc(q)}</p>`).join('')}
          <div class="fib__meta rv"><span class="mono">${cat.count} pieces</span><a class="link" href="shop.html?fibre=${esc(f.key)}">[ Shop ${esc(cat.name.toLowerCase())} ]</a></div>
          <div class="fib__mini" data-mini></div>
        </div>
      </article>`;
    }).join('');
    $$('[data-name]', host).forEach(splitWords);
    $$('.fib__ch', host).forEach(ch => { const key = ch.id; fill($('[data-mini]', ch), CM.all.filter(p => p.fib === key && !p.oos).slice(0, 3), { index: false }); });
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
      cnt.textContent = `${L.length} products · ${L.filter(oos).length} sold out`;
      list.innerHTML = L.slice(0, n).map(p => `<div class="stf__row${oos(p) ? ' is-oos' : ''}" data-id="${p.id}">
        <img src="${px(p.img[0], 160)}" alt="" loading="lazy"/>
        <div class="stf__nm">${esc(p.t)}<small>${esc(p.comp || p.v || '')} · ${usd(p.p)}</small></div>
        <button class="stf__btn" type="button">${oos(p) ? 'Back in stock' : 'Sold out'}</button>
      </div>`).join('');
      more.hidden = L.length <= n;
    };
    const say = m => { toast.textContent = m; toast.classList.add('on'); clearTimeout(say.t); say.t = setTimeout(() => toast.classList.remove('on'), 1800); };
    list.addEventListener('click', e => {
      const b = e.target.closest('.stf__btn'); if (!b) return;
      const row = b.closest('.stf__row'), id = +row.dataset.id, p = CM.all.find(x => x.id === id);
      if (arm !== b) {                                  // tap one: arm
        if (arm) { arm.classList.remove('is-arm'); arm.textContent = oos(CM.all.find(x => x.id === +arm.closest('.stf__row').dataset.id)) ? 'Back in stock' : 'Sold out'; }
        arm = b; b.classList.add('is-arm'); b.textContent = 'Tap again to confirm';
        clearTimeout(armT); armT = setTimeout(() => { if (arm === b) { b.classList.remove('is-arm'); b.textContent = oos(p) ? 'Back in stock' : 'Sold out'; arm = null; } }, 3000);
        return;
      }
      clearTimeout(armT); arm = null;                    // tap two: do it
      local[id] = !oos(p); try { localStorage.setItem(KEY, JSON.stringify(local)); } catch (e) {}
      row.classList.toggle('is-oos', local[id]); b.classList.remove('is-arm'); b.textContent = local[id] ? 'Back in stock' : 'Sold out';
      cnt.textContent = cnt.textContent.replace(/\d+ sold out/, `${CM.all.filter(oos).length} sold out`);
      say(local[id] ? 'Marked sold out' : 'Back in stock');
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
