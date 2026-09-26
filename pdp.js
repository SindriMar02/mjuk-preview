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

    /* ── "design" family: the largest non-generic WooCommerce category a product
          sits in (Marshmallow, Roots, Ragnar, 79 beanies …). Colour, fibre and
          seasonal tags are excluded so siblings are the same design, not the
          same shade. ── */
    const GENERIC = new Set(['hats', 'unisexhats', 'pompomhats', 'our-collections', 'sales', 'new', 'uncategorised', 'colors', 'black', 'blue', 'green', 'orange', 'purple', 'grey', 'pinkhats', 'neutralcolors', 'rainbow', 'stripes', 'gradient', 'leaves', 'puffins', 'pompom', 'scarves', 'headbands', 'blankets', 'neckwarmers', 'alpaca', 'cashmere', 'merino-wool', 'angora-wool', 'icelandic-wool', 'alpaca-and-silk', 'angora-and-merino-wool', 'clothesmadeinreykjavik', 'interiortrends2023', 'divashittheroads5', 'akureyri', 'colorful-blankets', 'neutral-blankets', 'unicorn', 'fishbone', 'konungur']);
    const catCount = {}; CM.all.forEach(p => (p.cats || []).forEach(c => { catCount[c] = (catCount[c] || 0) + 1; }));
    const familyKey = p => (p.cats || []).filter(c => !GENERIC.has(c)).sort((a, b) => catCount[b] - catCount[a])[0] || null;
    const familyName = k => k.replace(/marsmallow/, 'marshmallow').replace(/-/g, ' ').replace(/^\w/, c => c.toUpperCase());

    /* ── one piece: the breadcrumb, the gallery, the buying column and what the two rails hold ── */
    const view = p => {
      const c = copyOf(p);
      const fam = FAM[p.fam] ? null : familyKey(p);   // her family first; outside her sheet, the shop's category
      const imgs = [...new Set((p.img || []).filter(Boolean))];
      const crumb = `<a href="shop.html">${t('Shop')}</a><i>/</i>${GRP[p.tyk] ? `<a href="shop.html?type=${esc(p.tyk)}">${esc(typeName(p.tyk))}</a><i>/</i>` : ''}${FAM[p.fam] ? `<a href="shop.html?family=${esc(p.fam)}">${esc(famName(p.fam))}</a><i>/</i>` : ''}<span>${esc(p.t)}</span>`;
      const gal = imgs.map((u, i) => `<figure class="pdp__fig rv"><img src="${px(u, 1200)}" alt="${esc(p.t)}${i ? ', ' + t('detail') : ''}" ${i ? 'loading="lazy"' : 'fetchpriority="high"'}/></figure>`).join('');
      const plainHat = p.tyk === 'hats' && !/pom ?pom/i.test(p.t);
      const price = p.cp
        ? `<s>${usd(p.cp)}</s><span>${usd(p.p)}</span><span class="pdp__save">${t('Save')} ${Math.round((1 - p.p / p.cp) * 100)}%</span>`
        : `<span>${usd(p.p)}</span>`;
      // her matching pieces that are in the shop today, as links to them
      const goes = goesFor(p).filter(tg => CM.all.some(x => x !== p && hits(tg, x)));
      const facts = [
        [t('Material'), matWords(p)],
        // her fibre names, one by one ("50% angora · 25% nylon"); in Icelandic from tools/is.json
        [t('Composition'), (p.comp || '').replace(/[A-Za-z][A-Za-z ]*[A-Za-z]/g, w => t(w))],
        /* facts only where her own text states them: size and origin come from it, never a default */
        [t('Size'), /\bone[- ]size\b/i.test(c.short + ' ' + c.long) ? t('One size') : ''],
        [t('Made'), t(p.mi || '')],
        // her care line; the Icelandic pages carry tools/is.json's translation of each of her 18 wordings
        [t('Care'), c.care ? t(c.care.replace(/-\s/g, ': ').replace(/\s+/g, ' ')) : ''],
        /* from her own shipping zones (tools/pull-woo.mjs), never a number written here */
        [t('Delivery'), (CM.ship && (isIS && CM.ship.deliveryIs || CM.ship.delivery)) || ''],
        [t('Goes with'), goes.map(tg => `<a href="${tgHref(tg)}">${esc(tgName(tg))}</a>`).join(', '), true],
      ].filter(f => f[1]);
      const info = `
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
