/* ══════════════════════════════════════════════════════════════
   MJÚK — configurators.js
   1. Pompom chooser. In the shop: pick a hat, walk to the cabinet of eighty
      baskets, hold pompoms against it, watch it go on. Online: hats in one
      place, pompoms in another, and customers thought the pompom page was
      for handbags. So the choice moves onto the hat, and a plain hat is
      never added to the bag without being asked once.
   2. Made for you. Her bespoke shawls, ponchos and capes (her sheet), sewn
      upstairs at Laugavegur 23 within two hours. Model → fabric → the blanket
      it is cut from → fur → trim → one price, so the order arrives whole.
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
  // a pompom with no price in her shop is not offered: the chooser shows her price, never a stand-in (Codex 2026-09-26)
  const POMS = CM.all
    .filter(p => /\bpom ?pom\b/i.test(p.t) && !/beanie|hat|aviator|cap\b/i.test(p.t) && p.img && p.img[0] && p.p > 0)
    .map(p => { const raw = p.t.replace(/^.*?pom ?pom\.?\s*/i, '').replace(/\.$/, '').trim() || 'Raccoon';
      return { h: p.h, name: FIX[raw] || raw, kind: /raccoon/i.test(p.t) ? 'Raccoon' : 'Polar fox', price: p.p, img: p.img[0] }; })
    .sort((a, b) => a.name.localeCompare(b.name));

  const escA = x => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); // her names are data, not markup

  /* ════════════════════ 1 · POMPOM CHOOSER ════════════════════ */
  const dlg = $('#pom');
  if (dlg && POMS.length) {
    const grid = $('#pomGrid'), img = $('#pomImg'), name = $('#pomName'), total = $('#pomTotal'),
          add = $('#pomAdd'), slots = $$('.pom__slot', dlg), why = $('#pomWhy');
    let hat = null, count = 0, active = 0, chosen = [null, null];

    grid.innerHTML = POMS.map((s, i) =>
      `<button type="button" class="sw" data-i="${i}" style="--i:${i}" aria-pressed="false" title="${t(s.kind)}, ${escA(s.name)}, ${usd(s.price)}">
         <img src="${px(s.img, 160)}" alt="" loading="lazy"/><span>${escA(s.name)}</span></button>`).join('');

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
    /* Her "Bespoke clothing" list (tools/groups.json, her sheet "Product groups"): every model in
       the fabrics she makes it in, with or without fur. Only her rows can be chosen. In the
       11 Sep meeting: the customer picks the style, the colour of the fabric (the fabric is one
       of her blankets), the salmon skin and the fur, and sees one price. Prices are hers to set,
       one per row, in tools/curation.json (CM.made); until then the request goes by email. */
    const B = CM.bespoke || { models: [], fabrics: [], rows: [] };
    const isIS = document.documentElement.lang === 'is';
    const nm = x => (x ? (isIS && x.is) || x.name : '');
    const MODEL = Object.fromEntries(B.models.map(m => [m.key, m])), FABRIC = Object.fromEntries(B.fabrics.map(f => [f.key, f]));
    const ROWS = B.rows.map(([name, model, fabric, fur]) => ({ name, model, fabric, fur }));
    const PRICE = (CM.made && CM.made.prices) || {}, SALMON = CM.made ? CM.made.salmonLeather : null;
    const tr = $('[data-price="salmonLeather"]', cfg); if (tr) { tr.textContent = SALMON == null ? '' : '+ ' + usd(SALMON); tr.hidden = SALMON == null; }

    const v = n => { const el = cfg.querySelector(`input[name="${n}"]:checked`); return el ? el.value : ''; };
    const set = (n, val) => { const el = cfg.querySelector(`input[name="${n}"][value="${val}"]`); if (el) el.checked = true; };
    const row = () => ROWS.find(r => r.model === v('model') && r.fabric === v('fabric') && r.fur === (v('fur') === 'yes')) || null;

    /* the fabric's colours are her blankets in it, in stock and photographed: the one it is cut from */
    const blankets = key => CM.all.filter(p => FABRIC[key] && FABRIC[key].blankets.includes(p.fam) && !p.oos && p.img && p.img[0]);
    const famShort = { konungur: 'Konungur', akureyri: 'Akureyri', unicorn: 'Unicorn' };
    /* the colour from her product name, colour first and pattern after ("Camel, Fishbone"), so
       a short label still says the colour; a design inside the family ("Leaves") comes last */
    const PATTERN = /^(fishbone( pattern)?|striped|rainbow pattern|double-sided)$/i;
    const colourName = p => {
      const [head, ...rest] = p.t.split(/\.\s+/);
      const parts = rest.flatMap(x => x.replace(/\.$/, '').split(/,\s+/)).map(x => x.trim()).filter(x => x && !/^\d+% ?wool$/i.test(x));
      const design = head.replace(/[“”"]/g, '').replace(/\s*(cashmere )?blanket$/i, '').trim();
      return [...parts.filter(x => !PATTERN.test(x)), ...parts.filter(x => PATTERN.test(x)),
        ...(design.toLowerCase() !== (famShort[p.fam] || '').toLowerCase() ? [design] : [])].join(', ') || p.t;
    };
    // a swatch label holds two short lines; the whole name is in the title and in the request
    const short = x => (x.length <= 30 ? x : x.slice(0, 30).replace(/\s+\S*$/, '') + '…');
    // fabric tiles: one of her blankets in that fabric, cropped close so the texture reads
    $$('.tile[data-fabric]', cfg).forEach(tile => {
      const p = blankets(tile.dataset.fabric)[0] || CM.all.find(x => x.mat === tile.dataset.fabric && x.img && x.img[0]), im = $('img', tile);
      if (p && im) { im.src = px(p.img[0], 480); im.alt = p.t; }
    });
    const heroIm = $('#madeImg');
    const cape = CM.all.find(p => p.tyk === 'clothing' && p.img && p.img[0]);
    if (heroIm && cape) { heroIm.src = px(cape.img[0], 1100); heroIm.alt = cape.t; }

    const sw = $('#cfgColour'), ask = $('#cfgColourAsk'), furNote = $('#cfgFurNote');
    let shownFabric = '';
    const paintColours = () => {
      const key = v('fabric'); if (key === shownFabric) return; shownFabric = key;
      const L = blankets(key), many = new Set(L.map(p => p.fam)).size > 1;
      sw.innerHTML = L.map((p, i) => `<label class="csw" title="${p.t.replace(/"/g, '&quot;')}"><input type="radio" name="colour" value="${p.id}"${i ? '' : ' checked'}>
        <span class="csw__im"><img src="${px(p.img[0], 160)}" alt="" loading="lazy"/></span><span class="csw__n">${short((many ? famShort[p.fam] + ' · ' : '') + colourName(p))}</span></label>`).join('');
      sw.hidden = !L.length; ask.hidden = !!L.length;
    };
    /* only her rows: an option with no row for the current choice is switched off, and a choice
       that has just become impossible moves to the nearest one that exists */
    const sync = () => {
      const m = v('model');
      const fabrics = new Set(ROWS.filter(r => r.model === m).map(r => r.fabric));
      $$('input[name="fabric"]', cfg).forEach(i => { i.disabled = !fabrics.has(i.value); i.closest('label').classList.toggle('is-off', i.disabled); });
      if (!fabrics.has(v('fabric'))) set('fabric', [...fabrics][0]);
      const furs = new Set(ROWS.filter(r => r.model === m && r.fabric === v('fabric')).map(r => (r.fur ? 'yes' : 'no')));
      $$('input[name="fur"]', cfg).forEach(i => { i.disabled = !furs.has(i.value); i.closest('label').classList.toggle('is-off', i.disabled); });
      if (!furs.has(v('fur'))) set('fur', [...furs][0]);
      furNote.hidden = furs.size > 1;
      // say why: the model itself (the Empress cape is fur only), or only in this fabric (a cashmere shawl)
      const modelFurs = new Set(ROWS.filter(r => r.model === m).map(r => r.fur)), words = { model: nm(MODEL[m]), fabric: nm(FABRIC[v('fabric')]).toLowerCase() };
      furNote.textContent = furs.size > 1 ? '' : modelFurs.size > 1 ? fmt(furs.has('yes') ? 'In {fabric}, this model is made with fur only.' : 'In {fabric}, this model comes without fur.', words)
        : fmt(furs.has('yes') ? 'This model is made with fur only.' : 'This model comes without fur.', words);
      paintColours();
    };

    const priceEl = $('#cfgPrice'), noteEl = $('#cfgNote'), lenEl = $('#cfgLen'), done = $('#cfgDone');
    const parts = () => { const r = row(); return [r ? PRICE[r.name] : null, v('trim') === 'yes' ? SALMON : 0]; };
    const priced = () => parts().every(n => n != null);
    const total = () => parts().reduce((a, n) => a + n, 0);
    const paint = () => {
      const next = priced() ? usd(total()) : t('Price on request');
      if (priceEl.textContent !== next) { priceEl.textContent = next; pulse(priceEl); }
      priceEl.classList.toggle('is-ask', !priced());
      const adj = v('len') === 'adjusted';   // never name a field "length": form.elements.length is the control count
      lenEl.hidden = !adj;
      noteEl.textContent = t(!priced() ? 'We write back with the price before anything is cut.'
        : adj ? 'Indicative. We confirm the price with the length.' : 'The whole price. We confirm by email before anything is cut.');
    };
    cfg.addEventListener('change', e => { if (e.target.name !== 'colour') sync(); done.hidden = true; paint(); });
    /* The request is an email to the workshop, written out in full with her own name for the
       piece, so nothing is lost between the page and the shop. It opens the shopper's own mail
       app; the address is shown too. Fur and salmon leather colours are theirs to write in. */
    cfg.addEventListener('submit', e => {
      e.preventDefault();
      const r = row(); if (!r) return;
      const adj = v('len') === 'adjusted', fur = v('fur') === 'yes', trim = v('trim') === 'yes';
      const blanket = CM.all.find(p => String(p.id) === v('colour'));
      const price = priced() ? usd(total()) + (adj ? t(', to be confirmed') : '') : t('Price on request');
      const rows = [[t('Piece'), r.name], [t('Model'), nm(MODEL[r.model])], [t('Fabric'), nm(FABRIC[r.fabric])],
        [t('Colour'), blanket ? blanket.t : t('To tell you in this email')],
        [t('Fur'), fur ? t('With fur, colour to tell you in this email') : t('Without fur')],
        [t('Salmon leather'), trim ? t('At the edges, colour to tell you in this email') : t('None')],
        [t('Length'), t(adj ? 'Adjusted, we will write to you' : 'Standard')], [t('Price'), price]];
      const to = 'customersupport@mjukiceland.com';
      const body = t('Made for you') + '\n\n' + rows.map(x => x[0] + ': ' + x[1]).join('\n') + '\n\n' + (adj ? t('How I would like the length:') + '\n\n' : '');
      const mail = `mailto:${to}?subject=${encodeURIComponent(t('Made for you') + ': ' + nm(MODEL[r.model]))}&body=${encodeURIComponent(body)}`;
      const escH = x => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;');
      done.setAttribute('role', 'status');
      done.innerHTML = `<h3 tabindex="-1">${t('Your request is ready to send')}</h3>
        <dl>${rows.map(x => `<dt>${x[0]}</dt><dd>${escH(x[1])}</dd>`).join('')}</dl>
        <p>${fmt('Your email app opens with this request. If it does not, write to {email}.', { email: `<a href="${mail}">${to}</a>` })}</p>`;
      done.hidden = false;
      done.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'nearest' });
      // the summary is where the shopper is now: screen readers hear it, keyboard focus lands on it
      const h = $('h3', done); if (h) h.focus({ preventScroll: true });
      location.href = mail;
    });
    sync(); paint();

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
