/* ══════════════════════════════════════════════════════════════
   MJÚK — configurators.js
   1. Pompom chooser. In the shop: pick a hat, walk to the cabinet of eighty
      baskets, hold pompoms against it, watch it go on. Online: hats in one
      place, pompoms in another, and customers thought the pompom page was
      for handbags. So the choice moves onto the hat, and a plain hat is
      never added to the bag without being asked once.
   2. Made for you. A cape or poncho cut from one of her blankets, sewn
      upstairs at Laugavegur 23 within two hours. Shape → fabric → trim →
      one price, so the order arrives without an email chain.
   3. A language switch, to show the shape of the Icelandic version.
   Depends on window.CM (data) and window.CMBag (exposed by app.js).
   ══════════════════════════════════════════════════════════════ */
(() => {
  const CM = window.CM || { all: [] };
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const px = (u, w) => (u ? u + '?w=' + w + '&ssl=1' : '');
  const usd = n => '$' + (n || 0).toLocaleString('en-US');
  const byHandle = {}; CM.all.forEach(p => (byHandle[p.h] = p));

  /* ── the real pompoms, from her own catalogue: 25 photographed colours ── */
  // one typo on her live shop ("Grapefrui0") corrected here for the swatch label only
  const FIX = { Grapefrui0: 'Grapefruit' };
  const POMS = CM.all
    .filter(p => /\bpom ?pom\b/i.test(p.t) && !/beanie|hat|aviator|cap\b/i.test(p.t) && p.img && p.img[0])
    .map(p => { const raw = p.t.replace(/^.*?pom ?pom\.?\s*/i, '').replace(/\.$/, '').trim() || 'Raccoon';
      return { h: p.h, name: FIX[raw] || raw, kind: /raccoon/i.test(p.t) ? 'Raccoon' : 'Polar fox', price: p.p || 29, img: p.img[0] }; })
    .sort((a, b) => a.name.localeCompare(b.name));

  /* ════════════════════ 1 · POMPOM CHOOSER ════════════════════ */
  const dlg = $('#pom');
  if (dlg && POMS.length) {
    const grid = $('#pomGrid'), img = $('#pomImg'), name = $('#pomName'), total = $('#pomTotal'),
          add = $('#pomAdd'), slots = $$('.pom__slot', dlg), why = $('#pomWhy');
    let hat = null, count = 0, active = 0, chosen = [null, null];

    grid.innerHTML = POMS.map((s, i) =>
      `<button type="button" class="sw" data-i="${i}" aria-pressed="false" title="${s.kind}, ${s.name}, ${usd(s.price)}">
         <img src="${px(s.img, 160)}" alt="" loading="lazy"/><span>${s.name}</span></button>`).join('');

    const price = () => (hat ? hat.p : 0) + chosen.slice(0, count).reduce((n, s) => n + (s ? s.price : 0), 0);
    const ready = () => count === 0 || chosen.slice(0, count).every(Boolean);
    const paint = () => {
      slots.forEach((el, i) => {
        el.hidden = i >= count;
        el.classList.toggle('is-active', i === active && count > 0);
        el.classList.toggle('is-set', !!chosen[i]);
        const dot = $('.dot', el), lab = $('.pom__slotname', el);
        if (chosen[i]) { dot.style.backgroundImage = `url("${px(chosen[i].img, 80)}")`; lab.textContent = chosen[i].name; }
        else { dot.style.backgroundImage = ''; lab.textContent = count === 2 ? `Pompom ${i + 1}` : 'Pick a colour'; }
      });
      $('#pomPick').hidden = count === 0;
      $$('.sw', grid).forEach(b => b.setAttribute('aria-pressed', String(chosen.slice(0, count).some(s => s && s.h === POMS[+b.dataset.i].h))));
      total.innerHTML = `${usd(price())}<small>${count === 0 ? 'hat only' : count === 1 ? 'hat and one pompom' : 'hat and two pompoms'}</small>`;
      add.disabled = !ready();
      add.textContent = count === 0 ? 'Add the hat as it is' : ready() ? 'Add to bag' : 'Pick a colour first';
    };

    dlg.addEventListener('change', e => {
      if (e.target.name === 'n') { count = +e.target.value; active = 0; if (count < 2) chosen[1] = null; if (count === 0) chosen[0] = null; paint(); }
    });
    slots.forEach((el, i) => el.addEventListener('click', () => { active = i; paint(); }));
    grid.addEventListener('click', e => {
      const b = e.target.closest('.sw'); if (!b) return;
      chosen[active] = POMS[+b.dataset.i];
      // after the first pick on a two-pompom hat, move to the second slot automatically
      if (count === 2 && active === 0 && !chosen[1]) active = 1;
      paint();
    });

    const open = h => {
      hat = h; count = 0; active = 0; chosen = [null, null];
      $$('input[name="n"]', dlg).forEach(r => (r.checked = r.value === '0'));
      img.src = px(h.img[0], 300); img.alt = h.t; name.textContent = h.t;
      if (why) why.innerHTML = `Any pompom goes on any hat. In the shop you pick from the cabinet of eighty. Here are the ones we have photographed, <b>${usd(POMS[0].price)} each</b>, attached before it ships.`;
      paint();
      if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
      $('input[name="n"][value="0"]', dlg).focus();
    };

    dlg.addEventListener('close', () => {
      if (dlg.returnValue !== 'add' || !hat || !window.CMBag) return;
      const picks = chosen.slice(0, count).filter(Boolean);
      const extra = picks.length ? {
        k: picks.map(s => s.h).join('+'),
        label: picks.length === 1 ? `With a ${picks[0].name.toLowerCase()} pompom` : `With two pompoms, ${picks.map(s => s.name.toLowerCase()).join(' and ')}`,
        price: picks.reduce((n, s) => n + s.price, 0),
        pompoms: picks.map(s => ({ h: s.h, name: s.name })),
      } : null;
      window.CMBag.add(hat.h, '', null, extra);
    });
    $('#pomForm').addEventListener('submit', e => { if (!ready()) e.preventDefault(); });

    // the card button on a plain hat opens the chooser instead of adding silently
    document.addEventListener('click', e => {
      const b = e.target.closest('.sz.pom-ask'); if (!b) return;
      e.preventDefault();
      const h = byHandle[b.dataset.h]; if (h) open(h);
    });
  }

  /* ════════════════════ 2 · MADE FOR YOU ════════════════════ */
  const cfg = $('#cfg');
  if (cfg) {
    /* PLACEHOLDER PRICES. Anna said there are about twenty prices in total, because the
       colours all cost the same and only the fabric and the work move it. These are
       indicative so the flow can be judged; the real table replaces them. */
    const SHAPE = { cape: { name: 'Cape', base: 560 }, poncho: { name: 'Poncho', base: 480 }, shawl: { name: 'Shawl', base: 320 } };
    const FABRIC = { icelandic: { name: 'Icelandic wool', up: 0, fib: 'icelandic-wool' }, merino: { name: 'Merino', up: 80, fib: 'merino' },
                     cashmere: { name: 'Cashmere', up: 260, fib: 'cashmere' }, alpaca: { name: 'Alpaca', up: 180, fib: 'alpaca-silk' } };
    const TRIM = 90;

    // fabric tiles show one of her real blankets in that fibre, because the fabric IS a blanket
    // prefer a BLANKET in that fibre (the fabric is literally a blanket); she has none in pure
    // cashmere or alpaca, so fall back to a blanket that contains the fibre, then to any piece
    // in it, shown as a close crop so the texture reads rather than the garment
    const word = { 'icelandic-wool': /icelandic/i, merino: /merino/i, cashmere: /cashmere/i, 'alpaca-silk': /alpaca/i };
    const blanketFor = fib => CM.all.find(p => p.tyk === 'blankets' && p.fib === fib && p.img && p.img[0])
                          || CM.all.find(p => p.tyk === 'blankets' && word[fib].test((p.comp || '') + ' ' + p.t) && p.img && p.img[0])
                          || CM.all.find(p => p.fib === fib && p.img && p.img[0]);
    $$('.tile[data-fib]', cfg).forEach(t => {
      const p = blanketFor(t.dataset.fib), im = $('img', t);
      if (p && im) { im.src = px(p.img[0], 480); im.alt = p.t; }
    });
    const heroIm = $('#madeImg');
    const cape = CM.all.find(p => /cape|poncho/i.test(p.t) && p.img && p.img[0]);
    if (heroIm && cape) { heroIm.src = px(cape.img[0], 1100); heroIm.alt = cape.t; }

    const v = n => (cfg.elements[n] && cfg.elements[n].value) || '';
    const priceEl = $('#cfgPrice'), noteEl = $('#cfgNote'), lenEl = $('#cfgLen'), done = $('#cfgDone');
    const total = () => SHAPE[v('shape')].base + FABRIC[v('fabric')].up + (v('trim') === 'yes' ? TRIM : 0);
    const paint = () => {
      priceEl.textContent = usd(total());
      const adj = v('len') === 'adjusted';   // never name a field "length": form.elements.length is the control count
      lenEl.hidden = !adj;
      noteEl.textContent = adj ? 'Indicative. We confirm the price with the length.' : 'The whole price. Ready within two hours in the shop.';
    };
    cfg.addEventListener('change', () => { done.hidden = true; paint(); });
    cfg.addEventListener('submit', e => {
      e.preventDefault();
      const adj = v('len') === 'adjusted';
      done.innerHTML = `<h3>${adj ? 'Nearly there' : 'Request received'}</h3>
        <dl><dt>Shape</dt><dd>${SHAPE[v('shape')].name}</dd><dt>Fabric</dt><dd>${FABRIC[v('fabric')].name}, cut from one of our blankets</dd>
        <dt>Trim</dt><dd>${v('trim') === 'yes' ? 'Salmon leather at the edges' : 'None'}</dd><dt>Length</dt><dd>${adj ? 'Adjusted, we will write to you' : 'Standard'}</dd>
        <dt>Price</dt><dd>${usd(total())}${adj ? ', to be confirmed' : ''}</dd></dl>
        <p>${adj
          ? 'Tell us how you would like it, and we will write back with the exact price before anything is cut.'
          : 'In the finished shop this goes straight to the workshop above Laugavegur 23 and to your basket, with nothing left to explain by email.'}</p>`;
      done.hidden = false;
      done.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest' });
    });
    paint();
  }

  /* ════════════════════ 3 · LANGUAGE SWITCH (demo of the shape) ════════════════════
     The real Icelandic site lives on its own URLs so Google indexes it as Icelandic.
     This toggle only shows Anna what the interface reads like in both. */
  const IS = {
    'New': 'Nýtt', 'Fibres': 'Efni', 'Shop': 'Verslun', 'Stores': 'Búðir', 'Sale': 'Útsala', 'Bespoke': 'Sérsaumað', 'Made for you': 'Sérsaumað fyrir þig',
    'Search': 'Leita', 'Bag': 'Karfa', 'Menu': 'Valmynd', 'Close': 'Loka',
    'New this season': 'Nýtt á tímabilinu', 'Shop by fibre': 'Eftir efni', 'Shop by piece': 'Eftir flík', 'Last of the line': 'Síðustu eintökin',
    'Four doors in Reykjavík': 'Fjórar búðir í Reykjavík', 'Also stocked at': 'Einnig fáanlegt hjá', 'Add to bag': 'Setja í körfu',
    'Your bag': 'Karfan þín', 'Shape': 'Snið', 'Fabric': 'Efni', 'Salmon leather trim': 'Laxaleður í köntum', 'Length': 'Sídd',
    'Request this piece': 'Panta þessa flík', 'Cape': 'Slá', 'Poncho': 'Pontsjó', 'Shawl': 'Sjal', 'None': 'Ekkert', 'At the edges': 'Í köntum',
    'Standard': 'Venjuleg', 'I would like it adjusted': 'Ég vil breyta síddinni', 'Icelandic wool': 'Íslensk ull', 'Merino': 'Merínó', 'Cashmere': 'Kasmír', 'Alpaca': 'Alpakka',
  };
  const btn = $('#langBtn');
  if (btn) {
    const SEL = '.nav__mid a, .head__t, .sz--solo, .bag__title, .legend, .seg span > em, .t__m em, .cfg__go, #menu a, .nav__link:not(#bagBtn), .sm-toggle-line';
    const apply = lang => {
      $$(SEL).forEach(el => {
        if (el.childNodes.length !== 1) return;
        if (!el.dataset.en) el.dataset.en = el.textContent.trim();
        const en = el.dataset.en;
        if (lang === 'is' ? IS[en] : true) el.textContent = lang === 'is' ? IS[en] : en;
      });
      document.documentElement.lang = lang;
      btn.innerHTML = lang === 'is' ? '<b>EN</b> / ÍS' : 'EN / <b>ÍS</b>';
      btn.setAttribute('aria-label', lang === 'is' ? 'Switch to English' : 'Skipta yfir í íslensku');
      try { localStorage.setItem('cm_lang', lang); } catch (e) {}
    };
    btn.addEventListener('click', () => apply(document.documentElement.lang === 'is' ? 'en' : 'is'));
    let saved = 'en'; try { saved = localStorage.getItem('cm_lang') || 'en'; } catch (e) {}
    if (saved === 'is') apply('is');
  }
})();
