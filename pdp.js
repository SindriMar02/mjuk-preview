/* ══════════════════════════════════════════════════════════════
   MJÚK — the product page, as strings, with no DOM.
   One definition for two readers: pages.js renders it in the browser, and
   tools/build-products.mjs writes it into the HTML of every product page
   (product/<slug>/index.html, is/product/<slug>/index.html), so the text is in
   the page for crawlers that run no JavaScript. Also the catalogue helpers the
   other inner pages share (her groups, families and materials).
     env = { CM, COPY, t, isIS, px, usd }
   ══════════════════════════════════════════════════════════════ */
(function (root) {
  function make(env) {
    const { CM, COPY, isIS, px, usd } = env;
    const t = env.t || (s => s);
    const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    // her own address for a piece (mjukiceland.com/product/<slug>/), relative to the site root
    const purl = p => 'product/' + encodeURIComponent(p.h) + '/';
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
    /* small line icons for the product page (Sindri, 24 Oct: "icons and navigability"): drawn on a 24 grid,
       1.3 stroke, the ink colour of the text beside them */
    const ICONS = {
      pin: '<path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
      parcel: '<path d="M3.5 7.5 12 3.5l8.5 4v9L12 20.5l-8.5-4z"/><path d="M3.5 7.5 12 11.5l8.5-4M12 11.5v9M7.8 5.5l8.4 4"/>',
      store: '<path d="M4 9.5 5.6 5h12.8L20 9.5M4 9.5h16V20H4zM9.5 20v-5h5v5"/>',
      yarn: '<circle cx="12" cy="12" r="8"/><path d="M6.6 6.9c3.3 1.4 7.7 6 9.2 11.5M4.4 10.6c3.9.2 8.3 3.9 9.8 9.3M9.3 4.4c2.6 2.1 6.8 6.9 10.2 8.4"/>',
      text: '<path d="M5 6.5h14M5 10.5h14M5 14.5h10M5 18.5h7"/>',
      care: '<path d="M3.5 9.5h17l-1.7 8.6a2.2 2.2 0 0 1-2.2 1.9H7.4a2.2 2.2 0 0 1-2.2-1.9z"/><path d="M6.8 13.6c1.3-1 2.6-1 3.9 0s2.6 1 3.9 0 2.6-1 3.9 0"/>',
      pair: '<circle cx="9" cy="12" r="5.2"/><circle cx="15" cy="12" r="5.2"/>',
    };
    const ic = k => `<svg class="ic" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[k]}</svg>`;
    // one section of the details: a native <details> (works with no script); pages.js eases it open and shut
    const acc = (key, icon, title, body, open) => body ? `<details class="acc" data-acc="${key}"${open ? ' open' : ''}><summary>${ic(icon)}<span>${title}</span><i class="acc__pm" aria-hidden="true"></i></summary><div class="acc__b"><div class="acc__in">${body}</div></div></details>` : '';

    /* ── her copy: whitelist the tags WordPress wrote, drop everything else ── */
    const clean = html => listed(String(html || '')
      .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
      .replace(/<(?!\/?(p|br|strong|em|b|i|ul|ol|li)\b)[^>]*>/gi, '')
      .replace(/<(p|strong|em|b|i|ul|ol|li)\b[^>]*>/gi, '<$1>')
      .replace(/(<br\s*\/?>\s*){3,}/gi, '<br><br>')
      .replace(/\r?\n\s*\r?\n/g, '<br><br>').replace(/\r?\n/g, '<br>')   // WordPress keeps her line breaks as raw newlines
      .replace(/⟦video:([\w-]{6,20})⟧/g, (m, id) => `<a class="pdp__video link" href="https://www.youtube.com/watch?v=${id}" target="_blank" rel="noopener">${t('Watch the video')}</a>`)
      .trim());
    // her lists come as lines that start with "·" or "•": make them a real list, so they hang on the ember dots
    const listed = h => { let out = '', ul = [], held = '';
      const flush = () => { if (ul.length) out += `<ul>${ul.join('')}</ul>` + held.replace(/<br\s*\/?>/gi, ''); ul = []; held = ''; };
      h.split(/(<br\s*\/?>|<\/?p>)/i).forEach(tok => {
        const m = tok.match(/^\s*[·•]\s*(\S[\s\S]*?)\s*$/);
        if (m) { if (!ul.length) out = out.replace(/(<br\s*\/?>\s*)+$/i, ''); ul.push(`<li>${m[1]}</li>`); held = ''; return; }
        if (!tok.trim() || /^<(br|\/?p)\b/i.test(tok)) { if (ul.length) held += tok; else out += tok; return; }
        flush(); out += tok; });
      flush();
      return out.replace(/<p>\s*<ul>/g, '<ul>').replace(/<\/ul>\s*<\/p>/g, '</ul>'); };
    const text = html => clean(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const copyOf = p => { const m = COPY.map[p.id] || {}; return { short: m.s >= 0 ? COPY.texts[m.s] : '', long: m.l >= 0 ? COPY.texts[m.l] : '', care: m.l >= 0 ? COPY.care[m.l] : '' }; };

    /* ── "design" family: the largest non-generic WooCommerce category a product
          sits in (Marshmallow, Roots, Ragnar, 79 beanies …). Colour, fibre and
          seasonal tags are excluded so siblings are the same design, not the
          same shade. ── */
    const GENERIC = new Set(['hats', 'unisexhats', 'pompomhats', 'our-collections', 'sales', 'new', 'uncategorised', 'colors', 'black', 'blue', 'green', 'orange', 'purple', 'grey', 'pinkhats', 'neutralcolors', 'rainbow', 'stripes', 'gradient', 'leaves', 'puffins', 'pompom', 'scarves', 'headbands', 'blankets', 'neckwarmers', 'alpaca', 'cashmere', 'merino-wool', 'angora-wool', 'icelandic-wool', 'alpaca-and-silk', 'angora-and-merino-wool', 'clothesmadeinreykjavik', 'interiortrends2023', 'divashittheroads5', 'akureyri', 'colorful-blankets', 'neutral-blankets', 'unicorn', 'fishbone', 'konungur']);
    const catCount = {}; CM.all.forEach(p => (p.cats || []).forEach(c => { catCount[c] = (catCount[c] || 0) + 1; }));
    const familyKey = p => (p.cats || []).filter(c => !GENERIC.has(c)).sort((a, b) => catCount[b] - catCount[a])[0] || null;
    const familyName = k => k.replace(/marsmallow/, 'marshmallow').replace(/-/g, ' ').replace(/^\w/, c => c.toUpperCase());

    /* Her care lines with their grammar fixed (Sindri's yes, 2026-09-26: her text comes over as she wrote it
       unless flagged and fixed). Keyed by her exact wording, so a line she rewrites shows as she wrote it.
       Only the English pages use these; the Icelandic ones translate her original wording (tools/is.json). */
    const CARE_FIX = {
      "Machine-washable – cold water, wool or gentle cycle, laundry bag and airdry flat. Hand-washable – cold water, airdry flat.": "Machine washable: cold water, wool or gentle cycle, in a laundry bag, air dry flat. Hand washable: cold water, air dry flat.",
      "Machine-washable: cold water, wool or gentle cycle, laundry bag and airdry flat. Hand-washable: cold water, airdry flat.": "Machine washable: cold water, wool or gentle cycle, in a laundry bag, air dry flat. Hand washable: cold water, air dry flat.",
      "Dry clean only": "Dry clean only.",
      "Handwash only, luke-warm water. Air-flat dry.": "Hand wash only, lukewarm water. Air dry flat.",
      "Only handwash with cold water (20′ C) , no twisting, dry flat.": "Hand wash only in cold water (20 °C), no twisting, dry flat.",
      "We recommend only by hand washing or dry cleaning to keep cashmere as soft and airy": "We recommend hand washing or dry cleaning only, to keep cashmere soft and airy.",
      "We recommend only hand washing or dry cleaning to keep cashmere as soft and airy": "We recommend hand washing or dry cleaning only, to keep cashmere soft and airy.",
      "Only hand wash with cold water, airdry flat.": "Hand wash only in cold water, air dry flat.",
      "Dry cleaning or hand wash in cold water (20 degrees Celsius) and soft detergent. No twisting, dry flat": "Dry clean, or hand wash in cold water (20 °C) with a mild detergent. No twisting, dry flat.",
      "Handwash with cold water (20′ C) , no twisting, dry flat.": "Hand wash in cold water (20 °C), no twisting, dry flat.",
      "Only handwash with cold water (20′ C) , no twisting, no soaking, air dry flat.": "Hand wash only in cold water (20 °C), no twisting, no soaking, air dry flat.",
      "Dry cleaning or Handwash with cold water, gentle wool detergent, no twisting, airdry flat": "Dry clean, or hand wash in cold water with a gentle wool detergent, no twisting, air dry flat.",
      "Handwash with cold water (20′ C) , no twisting, no soaking, air dry flat.": "Hand wash in cold water (20 °C), no twisting, no soaking, air dry flat.",
      "Only dry cleaning or handwash with cold water (20′ C) , no twisting, dry flat.": "Dry clean or hand wash only, in cold water (20 °C), no twisting, dry flat.",
      "Handwash with cold water, no twisting.": "Hand wash in cold water, no twisting.",
      "Only Dry cleaning.": "Dry clean only."
    };
    /* ── one piece: the breadcrumb, the gallery, the buying column and what the two rails hold ── */
    const view = p => {
      const c = copyOf(p);
      const fam = FAM[p.fam] ? null : familyKey(p);   // her family first; outside her sheet, the shop's category
      const imgs = [...new Set((p.img || []).filter(Boolean))];
      const crumb = `<a href="shop.html">${t('Shop')}</a><i>/</i>${GRP[p.tyk] ? `<a href="shop.html?type=${esc(p.tyk)}">${esc(typeName(p.tyk))}</a><i>/</i>` : ''}${FAM[p.fam] ? `<a href="shop.html?family=${esc(p.fam)}">${esc(famName(p.fam))}</a><i>/</i>` : ''}<span>${esc(p.t)}</span>`;
      const gal = imgs.map((u, i) => `<figure class="pdp__fig rv" tabindex="0" role="button" aria-label="${esc(t('View larger'))}"><img src="${px(u, 1200)}" alt="${esc(p.t)}${i ? ', ' + t('detail') : ''}" ${i ? 'loading="lazy"' : 'fetchpriority="high"'}/></figure>`).join('');
      const plainHat = p.tyk === 'hats' && !/pom ?pom/i.test(p.t);
      const price = p.cp
        ? `<s>${usd(p.cp)}</s><span>${usd(p.p)}</span><span class="pdp__save">${t('Save')} ${Math.round((1 - p.p / p.cp) * 100)}%</span>`
        : `<span>${usd(p.p)}</span>`;
      // her matching pieces that are in the shop today, as links to them
      const goes = goesFor(p).filter(tg => CM.all.some(x => x !== p && hits(tg, x)));
      /* the buying column (Sindri, 24 Oct: premium, clear sections, icons): what it is, the price, her short line;
         the pompom choice as one control with the button saying what happens next; three facts from her own data;
         then the details in sections that open and close */
      const comp = (p.comp || '').replace(/[A-Za-z][A-Za-z ]*[A-Za-z]/g, w => t(w));   // her fibre names, one by one
      const care = c.care ? (x => isIS ? t(x) : CARE_FIX[x] || x)(c.care.replace(/-\s/g, ': ').replace(/\s+/g, ' ')) : '';
      const delivery = (CM.ship && (isIS && CM.ship.deliveryIs || CM.ship.delivery)) || '';   // her own shipping zones, never a number written here
      const facts = [
        [t('Material'), matWords(p)],
        [t('Composition'), comp],
        /* facts only where her own text states them: size and origin come from it, never a default */
        [t('Size'), /\bone[- ]size\b/i.test(c.short + ' ' + c.long) ? t('One size') : ''],
        [t('Made'), t(p.mi || '')],
      ].filter(f => f[1]);
      const promise = [
        p.mi ? ['pin', t(p.mi)] : null,
        delivery ? ['parcel', t('Ships worldwide')] : null,
        /pickup/i.test((CM.ship && CM.ship.delivery) || '') ? ['store', t('Local pickup in Iceland')] : null,
      ].filter(Boolean);
      const arrow = '<svg class="pdp__ar" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false"><path d="M2 8h11M9 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>';
      const cta = `<button class="sz sz--solo pdp__cta${plainHat ? ' pom-ask' : ''}" data-h="${esc(p.h)}" data-s=""><span class="pdp__ctal">${t('Add to bag')}</span>${arrow}</button>`;
      const dots = n => `<span class="pseg__dots" aria-hidden="true">${n ? '<i></i>'.repeat(n) : '<i class="o"></i>'}</span>`;
      const pomChoice = `<div class="pdp__pom" data-l0="${esc(t('Add to bag'))}" data-l1="${esc(t('Choose colours'))}">
          <p class="pdp__pomt mono">${t('Pompoms')} <span class="pseg__hint">${t('(choose one)')}</span></p>
          <div class="pseg" role="radiogroup" aria-label="${esc(t('Pompoms'))}"><span class="pseg__ind" aria-hidden="true"></span>${[['0', t('None')], ['1', t('One')], ['2', t('Two')]].map(([n, l], i) =>
            `<button type="button" class="pseg__o" role="radio" aria-checked="false" tabindex="${i ? -1 : 0}" data-n="${n}">${dots(+n)}<span>${l}</span></button>`).join('')}</div>
        </div>`;
      const info = `
      <div class="pdp__kick mono">${p.mat ? `<span>${esc(matName(p.mat))}</span>` : ''}${FAM[p.fam] ? `<span>${esc(famName(p.fam))}</span>` : GRP[p.tyk] ? `<span>${esc(typeName(p.tyk))}</span>` : ''}${isNew(p) ? `<span class="is-new">${t('New')}</span>` : ''}${p.cp ? `<span class="is-new">${t('Sale')}</span>` : ''}</div>
      <h1 class="pdp__t" id="pdpT">${esc(p.t)}</h1>
      <div class="pdp__price">${price}</div>
      ${c.short ? `<div class="pdp__short">${clean(c.short)}</div>` : ''}
      <div class="pdp__add">
        ${p.oos
          ? `<div class="pdp__oos"><span class="mono">${t('Sold out online')}</span><span>${t('Every colourway is a limited edition.')} <a href="mailto:customersupport@mjukiceland.com?subject=${encodeURIComponent(p.t)}">${t('Ask the store')}</a> ${t('whether one is left on a shelf in Reykjavík.')}</span></div>`
          : (plainHat ? pomChoice : '') + cta}
      </div>
      ${promise.length ? `<ul class="pdp__promise">${promise.map(([k, l]) => `<li>${ic(k)}<span>${esc(l)}</span></li>`).join('')}</ul>` : ''}
      <div class="pdp__accs">
        ${acc('details', 'yarn', t('Details'), facts.length ? `<dl class="pdp__facts">${facts.map(f => `<dt>${f[0]}</dt><dd>${esc(f[1])}</dd>`).join('')}</dl>` : '', true)}
        ${acc('desc', 'text', t('Description'), c.long && text(c.long) !== text(c.short) ? `<div class="pdp__body">${clean(c.long)}</div>` : '')}
        ${acc('care', 'care', t('Care'), care ? `<p>${esc(care)}</p>` : '')}
        ${acc('delivery', 'parcel', t('Delivery'), delivery ? `<p>${esc(delivery)}</p>` : '')}
        ${acc('goes', 'pair', t('Goes with'), goes.length ? `<p class="pdp__goes">${goes.map(tg => `<a href="${tgHref(tg)}">${esc(tgName(tg))}</a>`).join('')}</p>` : '')}
      </div>`;

      /* rails: the same design in other colours (her family), then what she pairs it with (her
         Matching products), or, where she has not paired it, another piece in the same material */
      const sib = FAM[p.fam] ? CM.all.filter(x => x !== p && x.fam === p.fam)
        : fam ? CM.all.filter(x => x !== p && (x.cats || []).includes(fam)) : CM.all.filter(x => x !== p && x.tyk === p.tyk && x.mat === p.mat);
      sib.sort((a, b) => a.oos - b.oos);
      const famTitle = FAM[p.fam] ? famName(p.fam) : fam ? familyName(fam) : (typeName(p.tyk) || t('this piece'));
      // one piece from each paired design in turn, so a long pairing list is not all one design
      const byTarget = goes.map(tg => CM.all.filter(x => x !== p && !x.oos && x.fam !== p.fam && hits(tg, x)));
      const paired = []; for (let r = 0; paired.length < 12 && byTarget.some(l => l.length > r); r++) for (const l of byTarget) if (l[r] && paired.length < 12 && !paired.includes(l[r])) paired.push(l[r]);
      const withL = paired.length ? paired : p.mat ? CM.all.filter(x => x !== p && !x.oos && x.mat === p.mat && x.tyk && x.tyk !== p.tyk).sort((a, b) => (isNew(b) - isNew(a))).slice(0, 12) : [];
      return {
        c, imgs, crumb, gal, info, goes,
        sib: sib.slice(0, 12), famTitle,
        withL, withTitle: paired.length ? t('Matching pieces') : matName(p.mat),
        withNote: paired.length ? t('Paired by Anna') : t('Another piece, same material'),
      };
    };

    return { esc, purl, nm, GRP, FAM, MAT, typeName, famName, matName, matWords, hits, goesFor, tgName, tgHref, isNew, clean, text, copyOf, familyKey, familyName, view };
  }
  if (typeof module === 'object' && module.exports) module.exports = make;
  else root.CMPDP = make;
})(typeof window !== 'undefined' ? window : globalThis);
