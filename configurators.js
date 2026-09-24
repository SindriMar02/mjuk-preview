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
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  /* a price that changes should be seen to change: a 220ms blur crossfade, the shell's ease */
  const pulse = el => { if (reduced || !el.animate) return;
    el.animate([{ filter: 'blur(3px)', opacity: .55 }, { filter: 'blur(0)', opacity: 1 }], { duration: 220, easing: 'cubic-bezier(.19,1,.22,1)' }); };

  // the two languages (app.js): t() for a string, fmt() for one with {slots}
  const U = window.CMUI || {}, t = U.t || (x => x), fmt = U.fmt || ((x, v) => x.replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m)));

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
      `<button type="button" class="sw" data-i="${i}" style="--i:${i}" aria-pressed="false" title="${t(s.kind)}, ${s.name}, ${usd(s.price)}">
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
        else { dot.style.backgroundImage = ''; lab.textContent = count === 2 ? fmt('Pompom {n}', { n: i + 1 }) : t('Pick a colour'); }
      });
      $('#pomPick').hidden = count === 0;
      $$('.sw', grid).forEach(b => b.setAttribute('aria-pressed', String(chosen.slice(0, count).some(s => s && s.h === POMS[+b.dataset.i].h))));
      const nextTotal = `${usd(price())}<small>${t(count === 0 ? 'hat only' : count === 1 ? 'hat and one pompom' : 'hat and two pompoms')}</small>`;
      if (total.innerHTML !== nextTotal) { total.innerHTML = nextTotal; if (hat) pulse(total); }
      add.disabled = !ready();
      add.textContent = t(count === 0 ? 'Add the hat as it is' : ready() ? 'Add to bag' : 'Pick a colour first');
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
        label: picks.length === 1 ? fmt('With a {a} pompom', { a: picks[0].name.toLowerCase() }) : fmt('With two pompoms, {a} and {b}', { a: picks[0].name.toLowerCase(), b: picks[1].name.toLowerCase() }),
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
    /* Her shapes and fabrics (11 Sep meeting). Prices are Anna's to set, about twenty in all, and
       live in tools/curation.json as CM.made. Until she gives them the page shows no number: the
       request goes to the workshop by email, which is what the section replaces. */
    const SHAPE = { cape: 'Cape', poncho: 'Poncho', shawl: 'Shawl' };
    const FABRIC = { icelandic: { name: 'Icelandic wool', fib: 'icelandic-wool' }, merino: { name: 'Merino', fib: 'merino' },
                     cashmere: { name: 'Cashmere', fib: 'cashmere' }, alpaca: { name: 'Alpaca', fib: 'alpaca-silk' } };
    const PRICE = CM.made || {};
    const get = k => k.split('.').reduce((o, p) => (o == null ? null : o[p]), PRICE);
    // what each option adds, shown only when she has priced it
    $$('[data-price]', cfg).forEach(el => { const n = get(el.dataset.price); el.textContent = n == null ? '' : el.dataset.price.startsWith('shape') ? usd(n) : n ? '+ ' + usd(n) : t('included'); el.hidden = n == null; });

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
    const parts = () => [get('shape.' + v('shape')), get('fabric.' + v('fabric')), v('trim') === 'yes' ? get('trim') : 0];
    const priced = () => parts().every(n => n != null);
    const total = () => parts().reduce((a, n) => a + n, 0);
    const paint = () => {
      const next = priced() ? usd(total()) : t('Price on request');
      if (priceEl.textContent !== next) { priceEl.textContent = next; pulse(priceEl); }
      priceEl.classList.toggle('is-ask', !priced());
      const adj = v('len') === 'adjusted';   // never name a field "length": form.elements.length is the control count
      lenEl.hidden = !adj;
      noteEl.textContent = t(!priced() ? 'We write back with the price before anything is cut.'
        : adj ? 'Indicative. We confirm the price with the length.' : 'The whole price. Ready within two hours in the shop.');
    };
    cfg.addEventListener('change', () => { done.hidden = true; paint(); });
    /* The request is an email to the workshop, written out in full, so nothing is lost between
       the page and the shop. It opens the shopper's own mail app; the address is shown too. */
    cfg.addEventListener('submit', e => {
      e.preventDefault();
      const adj = v('len') === 'adjusted';
      const price = priced() ? usd(total()) + (adj ? t(', to be confirmed') : '') : t('Price on request');
      const rows = [[t('Shape'), t(SHAPE[v('shape')])], [t('Fabric'), fmt('{fabric}, cut from one of our blankets', { fabric: t(FABRIC[v('fabric')].name) })],
        [t('Trim'), t(v('trim') === 'yes' ? 'Salmon leather at the edges' : 'None')], [t('Length'), t(adj ? 'Adjusted, we will write to you' : 'Standard')], [t('Price'), price]];
      const to = 'customersupport@mjukiceland.com';
      const body = t('Made for you') + '\n\n' + rows.map(r => r[0] + ': ' + r[1]).join('\n') + '\n\n' + (adj ? t('How I would like the length:') + '\n\n' : '');
      const mail = `mailto:${to}?subject=${encodeURIComponent(t('Made for you') + ': ' + t(SHAPE[v('shape')]))}&body=${encodeURIComponent(body)}`;
      done.innerHTML = `<h3>${t('Your request is ready to send')}</h3>
        <dl>${rows.map(r => `<dt>${r[0]}</dt><dd>${r[1]}</dd>`).join('')}</dl>
        <p>${fmt('Your email app opens with this request. If it does not, write to {email}.', { email: `<a href="${mail}">${to}</a>` })}</p>`;
      done.hidden = false;
      done.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest' });
      location.href = mail;
    });
    paint();

    /* ── scroll reveals for the section, on the shell's .rv grammar ──
       app.js reveals .head already; the copy, the image and each fieldset follow it, 70ms apart,
       and the lead comes up word by word inside line masks. */
    const lead = $('.made__lead');
    if (lead) {
      lead.innerHTML = lead.textContent.trim().split(/\s+/).map((w, i) => `<span class="w"><span style="--i:${i}">${w}</span></span>`).join(' ');
    }
    const items = [lead, ...$$('.made__copy > p:not(.made__lead), .made__im, .cfg > fieldset, .cfg__sum')].filter(Boolean);
    items.forEach((el, i) => { el.classList.add('rv'); el.style.setProperty('--d', `${Math.min(i, 6) * 70}ms`); });
    if (reduced || !('IntersectionObserver' in window)) items.forEach(el => el.classList.add('in'));
    else {
      const io = new IntersectionObserver(es => es.forEach(en => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } }),
        { rootMargin: '0px 0px -10% 0px', threshold: .05 });
      items.forEach(el => io.observe(el));
    }
  }

  /* 3 · The language switch is a plain link now (tools/build-is.mjs): English pages at the
     root, Icelandic pages in is/, each with its own URL so Google indexes both. */
})();
