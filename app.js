/* ══════════════════════════════════════════════════════════════
   COPPERMINE — app.js
   Vertical-bars bg + rolling-list ported from 21st.dev to vanilla.
   ══════════════════════════════════════════════════════════════ */
(() => {
  const CM = window.CM || { all: [] };
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(hover:hover) and (pointer:fine)').matches;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  /* ── TRUE viewport size ──
     In-app browsers (and this preview pane) can report `innerWidth` wider than
     the real layout viewport — measured 482 against a 390 html/body. Anything
     laid out against that, including `position:fixed` elements resolving their
     containing block, ends up too wide and visibly skewed off-centre.
     documentElement.clientWidth is the layout viewport and is always right, so
     everything reads --vw/--vh from here instead of trusting the window. */
  const vw = () => document.documentElement.clientWidth || innerWidth;
  const vh = () => document.documentElement.clientHeight || innerHeight;
  const syncVP = () => {
    const r = document.documentElement.style;
    r.setProperty('--vw', vw() + 'px');
    r.setProperty('--vh', vh() + 'px');
  };
  syncVP();
  addEventListener('resize', syncVP, { passive: true });
  addEventListener('orientationchange', syncVP, { passive: true });

  const byHandle = {}; CM.all.forEach(p => (byHandle[p.h] = p));
  const pick = hs => (hs || []).map(h => byHandle[h]).filter(Boolean);
  /* MJÚK serves its media through Jetpack Photon (i*.wp.com), which sizes on
     `w=`, not Shopify's `width=`. Stored URLs are kept bare so this is the one
     place that decides a resolution. */
  const px = (u, w) => (u ? u + '?w=' + w + '&ssl=1' : '');
  const isk = n => '$' + (n || 0).toLocaleString('en-US');
  // the fibre is the product story here, so the card states the real composition
  const catLabel = p => (p.comp || p.v || p.ty || '');
  const editorial = (CM.campaign || []);

  /* ── designed product card, with real size chips that add to bag ── */
  const esc = s => String(s).replace(/"/g, '&quot;');
  const prod = (p, i) => {
    // cards render at most 380px wide, so 620 still covers 2x screens.
    // hasAlt is true only when THIS product has a genuine second gallery shot;
    // otherwise the card zooms on hover rather than swapping in another product.
    const hasAlt = !!(p.img[1] && p.img[1] !== p.img[0]);
    const main = px(p.img[0], 620), alt = px(p.img[1] || p.img[0], 620);
    const price = p.cp ? `<span class="prod__price"><s>${isk(p.cp)}</s>${isk(p.p)}</span>` : `<span class="prod__price">${isk(p.p)}</span>`;
    // chip shows just the size token ("S / Navy Blue" → "S"); full variant kept for the bag.
    // MJÚK's pieces are one-size, so the sized branch is unused here — and the "Add"
    // rubric only earns its place when it labels a ROW of chips. With a single
    // button it just printed "Add" twice.
    const sizes = (p.sz && p.sz.length)
      ? `<span class="mono">Add</span>` + p.sz.map(v => {
          const label = String(v.s).split('/')[0].trim() || v.s;
          return `<button class="sz" data-h="${esc(p.h)}" data-s="${esc(label)}" title="${esc(v.s)}${v.a ? '' : ' — sold out'}"${v.a ? '' : ' disabled'}>${label}</button>`;
        }).join('')
      // a plain hat (no pompom in its name) asks about pompoms instead of being added silently
      : `<button class="sz sz--solo${p.tyk === 'hats' && !/pom ?pom/i.test(p.t) ? ' pom-ask' : ''}" data-h="${esc(p.h)}" data-s="">Add to bag</button>`;
    return `<article class="prod rv${hasAlt ? ' has-alt' : ''}">
      <div class="prod__im">
        <span class="prod__ix">${String(i + 1).padStart(2, '0')}</span>
        <img class="main" src="${main}" alt="${p.t}" loading="lazy"/>
        ${hasAlt ? `<img class="alt" src="${alt}" alt="" aria-hidden="true" loading="lazy"/>` : ''}
        <div class="prod__sizes">${sizes}</div>
      </div>
      <div class="prod__meta"><div><div class="prod__name">${p.t}</div><div class="prod__cat">(${catLabel(p)})</div></div>${price}</div>
    </article>`;
  };
  const railT = $('#railT'); if (railT) railT.innerHTML = pick(CM.featuredNew).map(prod).join('');
  const railST = $('#railST'); if (railST) railST.innerHTML = pick(CM.own).map(prod).join('');

  /* ── the two browse grids: by fibre, then by piece ──
     Both render from the same shape and share .cat styling; the only difference
     is which real taxonomy feeds them and where the tile links. */
  /* Name and count are STACKED, not pushed to opposite edges: a two-line label
     ("Icelandic wool") left its count orphaned against the first line, reading as
     if it belonged to the tile above. */
  const grid = (el, list, href) => {
    if (!el) return;
    el.innerHTML = (list || []).map(c => {
      const p = pick(c.pool)[0];
      const img = p ? px(p.img[0], 620) : '';
      return `<a class="cat rv" href="${href}" data-cat="${esc(c.key)}">
        <div class="cat__im">${img ? `<img src="${img}" alt="${esc(c.name)}" loading="lazy"/>` : ''}</div>
        <div class="cat__meta"><span class="cat__name">${c.name}</span><span class="cat__n mono">${c.count} pieces</span></div>
      </a>`;
    }).join('');
  };
  grid($('#cats'), CM.cats, '#new');
  grid($('#types'), CM.types, '#new');
  /* Seven piece-types leave a hole in a four-column grid. Rather than stretching one
     tile to hide it, the eighth cell earns its place as the way out of the taxonomy —
     the shopper who does not think in categories gets a plain "show me everything". */
  const types = $('#types');
  if (types && (CM.types || []).length) {
    types.insertAdjacentHTML('beforeend',
      `<a class="cat cat--all rv" href="#new">
         <div class="cat__im cat__im--all"><span class="cat__allmark" aria-hidden="true">&rarr;</span></div>
         <div class="cat__meta"><span class="cat__name">Everything</span><span class="cat__n mono">${CM.totalCount || 0} pieces</span></div>
       </a>`);
  }

  /* ── store maps: the embed is created on first open, so four Google iframes
     never load for a visitor who only wanted to read the addresses ── */
  $$('.store__map-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const card = btn.closest('.store');
      const open = card.classList.toggle('is-open');
      btn.setAttribute('aria-expanded', String(open));
      const frame = $('iframe', card);
      if (open && frame && !frame.src) {
        frame.src = 'https://www.google.com/maps?q=' + encodeURIComponent(btn.dataset.q) + '&z=16&output=embed';
      }
    });
  });

  const totalCount = $('#totalCount');
  if (totalCount) totalCount.textContent = (CM.totalCount || 0) + ' pieces';

  /* ── editorial stills that live in the markup rather than a rail ── */
  const campImg = $('#campImg');
  if (campImg && editorial[0]) campImg.src = px(editorial[0], 1500);
  const panBg = $('#panBg');
  if (panBg && editorial[1]) panBg.src = px(editorial[1], 1100);

  /* ── lookbook horizontal-pan frames ── */
  const panTrack = $('#panTrack');
  if (panTrack) {
    const specimens = pick(CM.featuredNew).slice(1, 11);
    let e = 0, frames = [];
    specimens.forEach((p, i) => {
      if (i % 3 === 0) frames.push(`<figure class="pan__i pan__i--tall"><img src="${px(editorial[e++ % editorial.length], 900)}" alt="MJÚK Iceland" loading="lazy"/><figcaption class="pan__cap">Reykjavík — Laugavegur 23</figcaption></figure>`);
      frames.push(`<figure class="pan__i pan__i--prod"><img src="${px(p.img[0], 620)}" alt="${p.t}" loading="lazy"/><figcaption class="pan__cap">${p.t}</figcaption></figure>`);
    });
    panTrack.insertAdjacentHTML('beforeend', frames.join(''));
  }

  /* ── as-worn wall: 3 auto-scrolling columns of her campaign imagery ── */
  const seenWall = $('#seenWall');
  if (seenWall) {
    const shots = (CM.wall || []).slice(0, 12);
    const cols = [[], [], []];
    shots.forEach((u, i) => cols[i % 3].push(u));
    const card = u => `<figure class="seen__card"><img src="${px(u, 560)}" alt="MJÚK Iceland" loading="lazy"/></figure>`;
    seenWall.innerHTML = cols.map((col, ci) => `<div class="seen__col ${ci % 2 ? 'seen__col--down' : 'seen__col--up'}">${col.map(card).join('') + col.map(card).join('')}</div>`).join('');
  }

  /* ── drag rails ── */
  const dragify = el => {
    if (!el) return;
    let down = false, sx = 0, sl = 0, moved = 0;
    el.addEventListener('pointerdown', e => { if (e.pointerType === 'touch') return; down = true; moved = 0; sx = e.clientX; sl = el.scrollLeft; el.classList.add('drag'); el.setPointerCapture(e.pointerId); });
    el.addEventListener('pointermove', e => { if (!down) return; const d = e.clientX - sx; moved = Math.abs(d); el.scrollLeft = sl - d; });
    const up = () => { down = false; el.classList.remove('drag'); };
    el.addEventListener('pointerup', up); el.addEventListener('pointerleave', up);
    el.addEventListener('click', e => { if (moved > 6) { e.preventDefault(); e.stopPropagation(); } }, true);
  };
  dragify($('#rail')); dragify($('#railS'));

  /* ══ RAIL ARROW BUTTONS ══ */
  const railById = id => document.getElementById(id);
  const syncRnav = () => $$('.rnav__b').forEach(b => {
    const el = railById(b.dataset.rail); if (!el) return;
    const max = el.scrollWidth - el.clientWidth - 2;
    b.disabled = +b.dataset.dir < 0 ? el.scrollLeft <= 2 : el.scrollLeft >= max;
  });
  $$('.rnav__b').forEach(b => b.addEventListener('click', () => {
    const el = railById(b.dataset.rail); if (!el) return;
    const card = el.querySelector('.prod');
    const step = card ? card.getBoundingClientRect().width + 24 : el.clientWidth * .8;
    el.scrollBy({ left: step * +b.dataset.dir, behavior: reduced ? 'auto' : 'smooth' });
  }));
  ['rail', 'railS'].forEach(id => { const el = railById(id); if (el) el.addEventListener('scroll', syncRnav, { passive: true }); });
  addEventListener('resize', syncRnav, { passive: true });
  syncRnav();

  /* ══ BAG (real add-to-bag flow, persisted) ══ */
  const bagEl = $('#bag'), bagItems = $('#bagItems'), bagCount = $('#bagCount'),
        bagQtyEl = $('#bagQty'), bagTotal = $('#bagTotal'), bagGo = $('#bagGo');
  let lines = [];
  try { lines = JSON.parse(localStorage.getItem('cm_bag') || '[]'); } catch (e) { lines = []; }
  const save = () => { try { localStorage.setItem('cm_bag', JSON.stringify(lines)); } catch (e) {} };
  const bagN = () => lines.reduce((n, l) => n + l.q, 0);
  const bagSum = () => lines.reduce((n, l) => n + l.q * l.p, 0);

  function renderBag() {
    const n = bagN();
    if (bagCount) bagCount.textContent = '(' + n + ')';
    if (bagQtyEl) bagQtyEl.textContent = '(' + n + ')';
    if (bagTotal) bagTotal.textContent = isk(bagSum());
    if (bagGo) bagGo.disabled = n === 0;
    if (!bagItems) return;
    bagItems.innerHTML = n === 0
      ? `<p class="bag__empty">Your bag is empty.<br>Add any piece to it.</p>`
      : lines.map((l, i) => `<div class="bag__it">
          <div class="bag__im"><img src="${px(l.img, 240)}" alt="${esc(l.t)}"/></div>
          <div>
            <div class="bag__n">${l.t}</div>
            ${l.s ? `<div class="bag__sz">Size ${l.s}</div>` : ''}
            ${l.x ? `<div class="bag__x2">${l.x.label}</div>` : ''}
            <div class="bag__qty">
              <button data-q="-1" data-i="${i}" aria-label="Decrease quantity">−</button>
              <span>${l.q}</span>
              <button data-q="1" data-i="${i}" aria-label="Increase quantity">+</button>
            </div>
          </div>
          <div class="bag__right">
            <span class="bag__p">${isk(l.q * l.p)}</span>
            <button class="bag__x" data-rm="${i}">Remove</button>
          </div>
        </div>`).join('');
  }
  const openBag = on => {
    if (!bagEl) return;
    bagEl.setAttribute('aria-hidden', String(!on));
    document.documentElement.style.overflow = on ? 'hidden' : '';
    if (lenis) { on ? lenis.stop() : lenis.start(); }
  };
  function addToBag(handle, size, btn, extra) {
    const p = byHandle[handle]; if (!p) return;
    const key = handle + '|' + size + (extra ? '|' + extra.k : '');
    const hit = lines.find(l => l.k === key);
    if (hit) hit.q++; else lines.push({ k: key, h: handle, t: p.t, s: size, p: p.p + (extra ? extra.price : 0), img: p.img[0], q: 1, x: extra || null });
    save(); renderBag(); openBag(true);
    if (btn) { btn.classList.add('added'); setTimeout(() => btn.classList.remove('added'), 700); }
  }
  document.addEventListener('click', e => {
    const sz = e.target.closest('.sz');
    if (sz && !sz.disabled && !sz.classList.contains('pom-ask')) { e.preventDefault(); addToBag(sz.dataset.h, sz.dataset.s || '', sz); return; }
    if (e.target.closest('#bagBtn')) { openBag(true); return; }
    if (e.target.closest('#bagClose') || e.target.closest('#bagScrim')) { openBag(false); return; }
    const q = e.target.closest('[data-q]');
    if (q) { const l = lines[+q.dataset.i]; if (l) { l.q += +q.dataset.q; if (l.q < 1) lines.splice(+q.dataset.i, 1); save(); renderBag(); } return; }
    const rm = e.target.closest('[data-rm]');
    if (rm) { lines.splice(+rm.dataset.rm, 1); save(); renderBag(); return; }
    if (e.target.closest('#bagGo')) { if (bagItems) bagItems.innerHTML = `<p class="bag__empty">Checkout is not wired up in this prototype.<br>It would hand off to your WooCommerce checkout here, on the same address.</p>`; }
  });
  addEventListener('keydown', e => { if (e.key === 'Escape' && bagEl && bagEl.getAttribute('aria-hidden') === 'false') openBag(false); });
  renderBag();
  window.CMBag = { add: addToBag, open: openBag };

  const nf = $('#newsForm');
  if (nf) nf.addEventListener('submit', e => { e.preventDefault(); const v = $('#newsEmail').value.trim(), m = $('#newsMsg'); const ok = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v); m.textContent = ok ? 'You’re in. See you at Laugavegur 7.' : 'Enter a valid email.'; if (ok) nf.reset(); });
  /* ══ MOBILE MENU + the sndr-studio toggle animation ══ */
  const burger = $('#burger'), menu = $('#menu');
  if (burger) {
    const icon = $('.sm-icon', burger), lineH = $('.sm-icon-line:not(.sm-icon-line-v)', burger),
          lineV = $('.sm-icon-line-v', burger), textInner = $('.sm-toggle-textinner', burger);
    const labelOpen = burger.dataset.labelOpen || 'Menu', labelClose = burger.dataset.labelClose || 'Close';
    let spin, roll, primed = false;
    const prime = () => {
      if (primed || !window.gsap || !lineV) return; primed = true;
      gsap.set(lineH, { rotate: 0, transformOrigin: '50% 50%' });
      gsap.set(lineV, { rotate: 90, transformOrigin: '50% 50%' });
      gsap.set(icon, { rotate: 0, transformOrigin: '50% 50%' });
    };

    /* plus -> X: long 225deg spin opening, quick unwind closing */
    const animateIcon = opening => {
      if (!icon || !window.gsap) return;
      prime(); spin && spin.kill();
      if (reduced) { gsap.set(icon, { rotate: opening ? 225 : 0 }); return; }
      spin = opening
        ? gsap.to(icon, { rotate: 225, duration: .8, ease: 'power4.out', overwrite: 'auto' })
        : gsap.to(icon, { rotate: 0, duration: .35, ease: 'power3.inOut', overwrite: 'auto' });
    };

    /* MENU/CLOSE roller: stack alternating lines, then roll to the last */
    const animateText = opening => {
      if (!textInner) return;
      roll && roll.kill();
      const current = opening ? labelOpen : labelClose, target = opening ? labelClose : labelOpen;
      const put = words => { textInner.textContent = ''; words.forEach(w => { const s = document.createElement('span'); s.className = 'sm-toggle-line'; s.textContent = w; textInner.appendChild(s); }); };
      if (reduced || !window.gsap) { put([target]); return; }
      const seq = [current]; let last = current;
      for (let i = 0; i < 3; i++) { last = last === labelOpen ? labelClose : labelOpen; seq.push(last); }
      if (last !== target) seq.push(target);
      seq.push(target);
      put(seq);
      gsap.set(textInner, { yPercent: 0 });
      roll = gsap.to(textInner, { yPercent: -((seq.length - 1) / seq.length) * 100, duration: .9, ease: 'power4.out' });
    };

    const setMenu = o => {
      document.body.classList.toggle('menu-open', o);
      burger.setAttribute('aria-expanded', String(o));
      burger.setAttribute('aria-label', o ? labelClose : labelOpen);
      menu.setAttribute('aria-hidden', String(!o));
      animateIcon(o); animateText(o);
    };

    burger.addEventListener('click', () => setMenu(!document.body.classList.contains('menu-open')));
    /* Menu links navigate explicitly: the generic anchor handler relied on
       lenis.scrollTo, which silently no-ops when Lenis is stopped or starved,
       so these links did nothing at all. */
    $$('#menu a').forEach(a => a.addEventListener('click', e => {
      const id = a.getAttribute('href');
      if (!id || id.length < 2) return;
      e.preventDefault(); e.stopPropagation();
      const t = document.querySelector(id);
      setMenu(false);
      setTimeout(() => goTo(t), 130);        // let the panel start closing first
    }));
    addEventListener('keydown', e => { if (e.key === 'Escape' && document.body.classList.contains('menu-open')) setMenu(false); });
  }

  /* ── film sound toggle (default muted; auto-mutes when scrolled away) ── */
  const reel = $('#reel'), sndBtn = $('#sndToggle'), reelYt = $('#reelYt');
  if (reel && sndBtn && reelYt) {
    let soundOn = false;
    const post = (func, args = []) => { try { reelYt.contentWindow.postMessage(JSON.stringify({ event: 'command', func, args }), '*'); } catch (e) {} };
    const setSound = on => {
      soundOn = on;
      post(on ? 'unMute' : 'mute');
      if (on) post('setVolume', [100]);
      reel.classList.toggle('on', on);
      sndBtn.setAttribute('aria-pressed', String(on));
      sndBtn.querySelector('.snd__label').textContent = on ? 'Sound on' : 'Sound off';
    };
    sndBtn.addEventListener('click', () => setSound(!soundOn));
    /* Mobile browsers frequently ignore the iframe's autoplay= param, so ask the
       player directly (muted playback is permitted) whenever the film scrolls in. */
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([e]) => {
        if (e.isIntersecting) { post('mute'); post('playVideo'); }
        else { if (soundOn) setSound(false); post('pauseVideo'); }
      }, { threshold: .2 }).observe(reel);
    }
    // and once the player is ready, in case it loaded already in view
    reelYt.addEventListener('load', () => { post('mute'); post('playVideo'); });
  }

  /* ── anchor navigation ──
     Always restarts Lenis first (it may have been stopped by the bag) and hard
     falls back to a native scroll if the smooth scroll never lands. */
  let lenis;
  function goTo(target) {
    if (!target) return;
    const startY = window.scrollY;
    const y = Math.max(0, target.getBoundingClientRect().top + startY - 40);
    if (lenis && !reduced) { try { lenis.start(); lenis.scrollTo(y, { duration: 1.1 }); } catch (e) { window.scrollTo({ top: y }); } }
    else window.scrollTo({ top: y, behavior: reduced ? 'auto' : 'smooth' });
    /* Rescue only a genuinely dead scroll: if we have barely budged after 700ms
       the smooth scroll never engaged. Checking distance-to-target instead would
       wrongly interrupt a long but working animation. */
    setTimeout(() => {
      if (Math.abs(window.scrollY - startY) < 40 && Math.abs(window.scrollY - y) > 240) {
        window.scrollTo({ top: y, behavior: 'auto' });
      }
    }, 700);
  }
  $$('a[href^="#"]').forEach(a => {
    if (a.closest('#menu')) return;                 // menu links handle themselves
    a.addEventListener('click', e => {
      const id = a.getAttribute('href'); if (!id || id.length < 2) return;
      const t = document.querySelector(id); if (!t) return;
      e.preventDefault(); goTo(t);
    });
  });

  /* ── nav hide on scroll-down ── */
  const nav = $('#nav'); let lastY = 0;
  const navUpdate = y => { if (y > lastY && y > 240) { nav.classList.add('hide'); nav.classList.remove('show'); } else { nav.classList.add('show'); nav.classList.remove('hide'); } lastY = y; };

  /* ── reveal ── */
  const rv = $$('.head, .prod, .cat, .store, .stock__row, .budin__row, .news, .hero__cta');
  rv.forEach(el => el.classList.add('rv'));
  if (reduced || !('IntersectionObserver' in window)) rv.forEach(el => el.classList.add('in'));
  else {
    const io = new IntersectionObserver(es => es.forEach(en => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } }), { rootMargin: '0px 0px -10% 0px', threshold: .05 });
    rv.forEach(el => io.observe(el));
    setTimeout(() => rv.forEach(el => { if (el.getBoundingClientRect().top < vh() * 1.3) el.classList.add('in'); }), 2600);
  }

  /* ══ GRAIN-GRADIENT BACKGROUND (paper-design grain-gradient, ported from 21st.dev) ══ */
  function shaderBackground() {
    if (reduced) return;
    const canvas = $('#bars'); if (!canvas) return;
    const gl = canvas.getContext('webgl', { antialias: false }); if (!gl) return;
    const VERT = `attribute vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;
    const FRAG = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform vec3 u_colors[8];
// Seven packed vectors + eight colour vectors = 15 fragment uniform vectors,
// one below WebGL1's guaranteed minimum. Macros preserve the public u_* API.
uniform vec4 u_scene;      // resolution.xy, time, colour count
uniform vec4 u_shape;      // scale, intensity, paramA, warp
uniform vec4 u_surface;    // detail, contrast, brightness, saturation
uniform vec4 u_finish;     // hue, vignette, blur, grain
uniform vec4 u_transform;  // seed, rotation, drift, OKLab toggle
uniform vec4 u_space;      // offset.xy, pointer.xy
uniform vec4 u_cursor;

#define u_resolution u_scene.xy
#define u_time u_scene.z
#define u_colorCount u_scene.w
#define u_scale u_shape.x
#define u_intensity u_shape.y
#define u_paramA u_shape.z
#define u_warp u_shape.w
#define u_detail u_surface.x
#define u_contrast u_surface.y
#define u_brightness u_surface.z
#define u_saturation u_surface.w
#define u_hue u_finish.x
#define u_vignette u_finish.y
#define u_blur u_finish.z
#define u_grain u_finish.w
#ifdef GL_FRAGMENT_PRECISION_HIGH
#define u_seed u_transform.x
#else
// Keep hash inputs inside mediump's guaranteed ±2^14 range.
#define u_seed mod(u_transform.x, 31.0)
#endif
#define u_rotate u_transform.y
#define u_drift u_transform.z
#define u_oklab u_transform.w
#define u_offset u_space.xy
#define u_mouse u_space.zw
#define u_cursorPresence u_cursor.x
#define u_cursorEffect u_cursor.y
#define u_cursorStrength u_cursor.z
#define u_cursorRadius u_cursor.w

float hash21(vec2 p) {
#ifndef GL_FRAGMENT_PRECISION_HIGH
  p = mod(p, 31.0);
#endif
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

// Even, un-structured white noise for film grain (Dave Hoskins hash12). The
// multiply hash above is fine for value noise but shows a faint axis-aligned
// mesh at integer fragment coords, which reads as a net over flat areas.
float grainHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec2 hash22(vec2 p) {
#ifndef GL_FRAGMENT_PRECISION_HIGH
  p = mod(p, 31.0);
#endif
  float n = sin(dot(p, vec2(41.0, 289.0)));
  return fract(vec2(15731.743, 7892.321) * n);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
    mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
    u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = p * 2.03 + vec2(17.0, 9.2);
    a *= 0.5;
  }
  return v;
}

// --- OKLab colour mixing (perceptual), gated by u_oklab -----------------------
vec3 srgbToLinear(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)),
    step(0.04045, c));
}
vec3 linearToSrgb(vec3 c) {
  // max() guards the sRGB branch: out-of-gamut OKLab interpolations can send a
  // channel negative, and pow(negative, …) is NaN which mix()/step() would
  // then propagate. The linear branch clips such channels to 0 downstream.
  return mix(c * 12.92, 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055,
    step(0.0031308, c));
}
vec3 linToOklab(vec3 c) {
  float l = 0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b;
  float m = 0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b;
  float s = 0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b;
  l = pow(max(l, 0.0), 1.0 / 3.0);
  m = pow(max(m, 0.0), 1.0 / 3.0);
  s = pow(max(s, 0.0), 1.0 / 3.0);
  return vec3(
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s);
}
vec3 oklabToLin(vec3 c) {
  float l = c.x + 0.3963377774 * c.y + 0.2158037573 * c.z;
  float m = c.x - 0.1055613458 * c.y - 0.0638541728 * c.z;
  float s = c.x - 0.0894841775 * c.y - 1.2914855480 * c.z;
  l = l * l * l; m = m * m * m; s = s * s * s;
  return vec3(
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s);
}
vec3 mixColour(vec3 a, vec3 b, float t) {
  if (u_oklab > 0.5) {
    vec3 la = linToOklab(srgbToLinear(a));
    vec3 lb = linToOklab(srgbToLinear(b));
    return clamp(linearToSrgb(oklabToLin(mix(la, lb, t))), 0.0, 1.0);
  }
  return mix(a, b, t);
}

// Mix through the recipe colours; x is clamped to 0..1. WebGL1 forbids
// dynamic uniform indexing in fragment shaders, hence the constant loop.
vec3 palette(float x) {
  float n = max(u_colorCount - 1.0, 1.0);
  float f = clamp(x, 0.0, 1.0) * n;
  vec3 col = u_colors[0];
  for (int i = 0; i < 7; i++) {
    if (float(i) < n)
      col = mixColour(col, u_colors[i + 1],
        smoothstep(0.0, 1.0, clamp(f - float(i), 0.0, 1.0)));
  }
  return col;
}

vec3 hueRotate(vec3 col, float a) {
  const mat3 toYIQ = mat3(0.299, 0.596, 0.211,
                          0.587, -0.274, -0.523,
                          0.114, -0.322, 0.312);
  const mat3 toRGB = mat3(1.0, 1.0, 1.0,
                          0.956, -0.272, -1.106,
                          0.621, -0.647, 1.703);
  vec3 yiq = toYIQ * col;
  float ca = cos(a), sa = sin(a);
  yiq = vec3(yiq.x, yiq.y * ca - yiq.z * sa, yiq.y * sa + yiq.z * ca);
  return toRGB * yiq;
}

vec3 shade(vec2 uv, vec2 p, float t) {
  vec2 q = p;
  q.x += sin(q.y * 2.1 + t * 0.2) * (0.08 + u_intensity * 0.32);
  q.y += cos(q.x * 2.7 - t * 0.17) * (0.06 + u_intensity * 0.26);
  float wave = 0.5 + 0.5 * sin(q.x * 2.8 + q.y * 1.9 + fbm(q * 2.0) * 3.0);
  float coarse = hash21(floor((uv + t * 0.002) * (90.0 + u_paramA * 260.0)) + u_seed);
  float grain = (coarse - 0.5) * u_paramA * 0.42;
  return palette(clamp(wave + grain, 0.0, 1.0));
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  vec2 screenUv = uv;
  vec2 p = (gl_FragCoord.xy - 0.5 * u_resolution.xy)
    / min(u_resolution.x, u_resolution.y);
  float cursorMask = 0.0;

  // Cursor modes 1–3 are local distortions. Push shifts the same screen-space
  // coordinates before field transforms, so Zoom/Rotate don't change its feel.
  if (u_cursorPresence > 0.001) {
    // u_mouse is normalized to -1..1 in canvas space. Convert it to the same
    // aspect-corrected screen space as p so effects stay under the cursor.
    vec2 cursor = (0.5 * u_mouse * u_resolution.xy)
      / min(u_resolution.x, u_resolution.y);
    vec2 cursorDelta = p - cursor;
    if (u_cursorEffect < 0.5) {
      p += cursor * u_cursorPresence * u_cursorStrength * 0.55;
    } else {
      float cursorDistance = length(cursorDelta);
      vec2 cursorDirection = cursorDelta / max(cursorDistance, 0.0001);
      cursorMask = u_cursorPresence
        * (1.0 - smoothstep(0.0, u_cursorRadius, cursorDistance));
      if (u_cursorEffect < 1.5) {
        p -= cursorDirection * cursorMask * u_cursorStrength * 0.24;
      } else if (u_cursorEffect < 2.5) {
        float cursorAngle = cursorMask * u_cursorStrength * 2.2;
        float cc = cos(cursorAngle), cs = sin(cursorAngle);
        p = cursor + mat2(cc, -cs, cs, cc) * cursorDelta;
      } else if (u_cursorEffect < 3.5) {
        float ripple = sin(
          cursorDistance / max(u_cursorRadius, 0.001) * 18.0 - u_time * 5.0);
        p -= cursorDirection * ripple * cursorMask * u_cursorStrength * 0.07;
      }
    }
  }

  // Keep presets that read uv (rather than p) in the same warped space.
  uv = p * min(u_resolution.x, u_resolution.y) / u_resolution.xy + 0.5;
  p *= u_scale;
  // Field transform: rotate, pan, pointer push, slow drift.
  if (abs(u_rotate) > 0.0001) {
    float cr = cos(u_rotate), sr = sin(u_rotate);
    p = mat2(cr, -sr, sr, cr) * p;
  }
  p += u_offset;
  if (u_drift > 0.0001)
    p += u_drift * vec2(sin(u_time * 0.31), cos(u_time * 0.23));
  // Organic domain warp.
  if (u_warp > 0.0) {
    p += u_warp * (vec2(
      fbm(p * u_detail + u_seed),
      fbm(p * u_detail + vec2(5.2, 1.3))) - 0.5);
  }
  // Shade, with an optional soft 5-tap blur.
  vec3 col;
  if (u_blur > 0.0) {
    float e = u_blur;
    float pe = e * u_scale;
    vec2 uvE = vec2(e) * min(u_resolution.x, u_resolution.y) / u_resolution.xy;
    col  = shade(uv, p, u_time) * 0.36;
    col += shade(uv + vec2(uvE.x, 0.0), p + vec2(pe, 0.0), u_time) * 0.16;
    col += shade(uv - vec2(uvE.x, 0.0), p - vec2(pe, 0.0), u_time) * 0.16;
    col += shade(uv + vec2(0.0, uvE.y), p + vec2(0.0, pe), u_time) * 0.16;
    col += shade(uv - vec2(0.0, uvE.y), p - vec2(0.0, pe), u_time) * 0.16;
  } else {
    col = shade(uv, p, u_time);
  }
  // Post: contrast, saturation, hue, brightness, vignette, grain.
  if (abs(u_contrast - 1.0) > 0.0001)
    col = (col - 0.5) * u_contrast + 0.5;
  if (abs(u_saturation - 1.0) > 0.0001) {
    float luma = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(luma), col, u_saturation);
  }
  if (abs(u_hue) > 0.0001)
    col = hueRotate(col, u_hue);
  if (abs(u_brightness) > 0.0001)
    col += u_brightness;
  if (u_vignette > 0.0001) {
    float vd = length(screenUv - 0.5) * 1.41421356;
    col *= 1.0 - u_vignette * smoothstep(0.35, 1.0, vd);
  }
  if (u_cursorPresence > 0.001 && u_cursorEffect > 3.5)
    col += (vec3(0.18) + col * 0.12) * cursorMask * u_cursorStrength;
  if (u_grain > 0.0001)
    col += (grainHash(
      gl_FragCoord.xy + vec2(u_seed * 17.0, u_seed * 31.0)) - 0.5) * u_grain;
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;
    const compile = (t, s) => { const sh = gl.createShader(t); gl.shaderSource(sh, s); gl.compileShader(sh); return sh; };
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog); gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aLoc = gl.getAttribLocation(prog, 'a_position');
    gl.enableVertexAttribArray(aLoc); gl.vertexAttribPointer(aLoc, 2, gl.FLOAT, false, 0, 0);
    const u = n => gl.getUniformLocation(prog, n);
    const U = { colors: u('u_colors'), scene: u('u_scene'), shape: u('u_shape'), surface: u('u_surface'), finish: u('u_finish'), transform: u('u_transform'), space: u('u_space'), cursor: u('u_cursor') };
    // porcelain field, one soft petrol band, grain
    const base = [0.968, 0.953, 0.937];
    // porcelain, warm porcelain, then a soft ember band pulled off --accent
    const colors = [[0.965, 0.949, 0.933], [0.929, 0.898, 0.886], [0.859, 0.741, 0.678], base, base, base, base, base];
    const P = { colorCount: 4, scale: 1.92, intensity: 0.7, paramA: 0.26, warp: 0.06, detail: 2.624, contrast: 1.0, brightness: 0.004, saturation: 0.8, hue: 0, vignette: 0.12, blur: 0, grain: 0.04, seed: 1, rotate: 1.9373, drift: 0.02, oklab: 0, timeScale: 0.8 };
    gl.uniform3fv(U.colors, new Float32Array(colors.flat()));
    gl.uniform4f(U.shape, P.scale, P.intensity, P.paramA, P.warp);
    gl.uniform4f(U.surface, P.detail, P.contrast, P.brightness, P.saturation);
    gl.uniform4f(U.finish, P.hue, P.vignette, P.blur, P.grain);
    gl.uniform4f(U.transform, P.seed, P.rotate, P.drift, P.oklab);
    gl.uniform4f(U.cursor, 0, 2, 0.65, 0.46);
    gl.uniform4f(U.space, 0, 0, 0, 0);
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      let w = Math.max(1, Math.round(vw() * dpr)), h = Math.max(1, Math.round(vh() * dpr));
      const s = Math.min(1, Math.sqrt(2000000 / Math.max(1, w * h)));
      w = Math.max(1, Math.round(w * s)); h = Math.max(1, Math.round(h * s));
      canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h);
    };
    resize(); addEventListener('resize', resize, { passive: true });
    const t0 = performance.now();
    let last = 0;
    const render = now => {
      requestAnimationFrame(render);
      // skip work entirely while the video wall owns the GPU, or when tab is hidden
      if (window.__cmShaderPaused || document.hidden) return;
      // cap to ~40fps: this is a slow ambient gradient, 60fps buys nothing visually
      if (now - last < 25) return;
      last = now;
      gl.uniform4f(U.scene, canvas.width, canvas.height, ((now - t0) / 1000) * P.timeScale, P.colorCount);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    requestAnimationFrame(render);
  }

  /* ══ Lenis + GSAP ══ */
  const hasGsap = window.gsap && window.ScrollTrigger;
  if (hasGsap) gsap.registerPlugin(ScrollTrigger);
  if (!reduced && window.Lenis) {
    lenis = new Lenis({
      duration: 1.1,
      // exponential ease-out: fast pickup, long clean settle. Without an explicit
      // easing the tail decelerates linearly enough to read as a small stutter
      // right as the scroll stops.
      easing: t => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      // touch devices already have native momentum that is smoother than anything
      // re-implemented in JS; syncing it fights the platform and feels laggy
      syncTouch: false,
    });
    if (hasGsap) { lenis.on('scroll', ScrollTrigger.update); gsap.ticker.add(t => lenis.raf(t * 1000)); gsap.ticker.lagSmoothing(0); }
    else { const raf = t => { lenis.raf(t); requestAnimationFrame(raf); }; requestAnimationFrame(raf); }
    lenis.on('scroll', ({ scroll }) => navUpdate(scroll));
  } else addEventListener('scroll', () => navUpdate(scrollY), { passive: true });

  /* ── Anything that animates every frame is competing with Lenis for the frame
     budget, and both of these keep running long after they leave the screen: the
     WebGL gradient (its own rAF) and the three marquee columns (compositor work
     on promoted layers). Gate both on visibility so only what is actually on
     screen costs anything. ── */
  if ('IntersectionObserver' in window) {
    const heroEl = $('.hero');
    if (heroEl) new IntersectionObserver(([e]) => { window.__cmShaderPaused = !e.isIntersecting; },
      { rootMargin: '120px' }).observe(heroEl);
    const seenEl = $('.seen');
    if (seenEl) new IntersectionObserver(([e]) => {
      $$('.seen__col', seenEl).forEach(c => { c.style.animationPlayState = e.isIntersecting ? 'running' : 'paused'; });
    }, { rootMargin: '200px' }).observe(seenEl);
  }

  /* ══ scroll choreography ══ */
  const choreograph = () => {
    if (!hasGsap || reduced) {
      const wrap = $('#lookbook'); if (wrap) { wrap.style.overflowX = 'auto'; wrap.style.overflowY = 'hidden'; dragify(wrap); }
      return;
    }
    /* hero parallax */
    gsap.to('#fcar', { yPercent: -5, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } });
    /* campaign uncrop + zoom-out */
    const cf = $('#campFrame');
    if (cf) {
      const o = { c: 13 };
      gsap.to(o, { c: 0, ease: 'none', scrollTrigger: { trigger: '.camp', start: 'top bottom', end: 'top 12%', scrub: true }, onUpdate: () => (cf.style.clipPath = `inset(${o.c}% ${o.c * 1.45}%)`) });
      gsap.fromTo('.camp__img', { scale: 1.14 }, { scale: 1, ease: 'none', scrollTrigger: { trigger: '.camp', start: 'top bottom', end: 'bottom top', scrub: true } });
    }
    /* horizontal scroll-hijack lookbook */
    const wrap = $('#lookbook'), track = $('#panTrack'), prog = $('#panProg');
    if (wrap && track) {
      const dist = () => Math.max(0, track.scrollWidth - vw());
      gsap.to(track, {
        x: () => -dist(), ease: 'none',
        scrollTrigger: {
          trigger: wrap, start: 'top top', end: () => '+=' + dist(), pin: true, scrub: 1, invalidateOnRefresh: true,
          onUpdate: self => { if (prog) prog.style.width = (self.progress * 100).toFixed(2) + '%'; }
        }
      });
    }
    /* as-seen-on headline reveal */
    gsap.from('.seen__overlay > *', { y: 20, opacity: 0, duration: 1, stagger: .1, ease: 'power3.out', scrollTrigger: { trigger: '.seen', start: 'top 70%' } });
  };
  const heroIn = () => {
    if (reduced || !hasGsap) return;
    gsap.from('.hero__head > *, .hero__cta > *', { y: 14, opacity: 0, duration: .9, stagger: .08, ease: 'power2.out', delay: .05 });
    gsap.from('.hero__word', { yPercent: 14, opacity: 0, duration: 1.15, ease: 'power3.out', delay: .2 });
  };

  /* ══ HERO FEATURE CAROUSEL ══
     Ported from 21st.dev `ravikatiyar162/feature-carousel`: centre slide sharp
     and full scale, neighbours scaled/blurred/rotated back, rest hidden.
     Same transform maths, vanilla, with autoplay that pauses on hover. */
  (function featureCarousel() {
    const host = $('#fcar');
    if (!host) return;
    const shots = (CM.hero || CM.campaign || []).filter(Boolean).slice(0, 5);
    if (!shots.length) return;
    host.innerHTML = shots.map((u, i) =>
      `<figure class="fcar__i" data-i="${i}"><img src="${px(u, 900)}" alt="MJÚK Iceland" ${i === 0 ? 'fetchpriority="high"' : 'loading="lazy"'}/></figure>`
    ).join('');
    const slides = $$('.fcar__i', host);
    const total = slides.length;
    let cur = Math.floor(total / 2);

    const layout = () => slides.forEach((el, i) => {
      let pos = (i - cur + total) % total;
      if (pos > Math.floor(total / 2)) pos -= total;
      const centre = pos === 0, adj = Math.abs(pos) === 1;
      el.style.transform = `translateX(${pos * 45}%) scale(${centre ? 1 : adj ? .85 : .7}) rotateY(${pos * -10}deg)`;
      el.style.zIndex = centre ? 10 : adj ? 5 : 1;
      el.style.opacity = centre ? 1 : adj ? .4 : 0;
      el.style.filter = centre ? 'none' : 'blur(4px)';
      el.style.visibility = Math.abs(pos) > 1 ? 'hidden' : 'visible';
    });
    // the headline is filled with whichever campaign frame is centre stage
    const word = $('.hero__word');
    const syncFill = () => word && word.style.setProperty('--hy-fill', `url("${px(shots[cur], 1200)}")`);
    const go = d => { cur = (cur + d + total) % total; layout(); syncFill(); };
    syncFill();
    layout();

    $('#fcarNext') && $('#fcarNext').addEventListener('click', () => go(1));
    $('#fcarPrev') && $('#fcarPrev').addEventListener('click', () => go(-1));
    slides.forEach((el, i) => el.addEventListener('click', () => { cur = i; layout(); syncFill(); }));

    if (!reduced) {
      let timer = setInterval(() => go(1), 4000);
      const stop = () => { clearInterval(timer); timer = null; };
      const play = () => { if (!timer) timer = setInterval(() => go(1), 4000); };
      host.addEventListener('pointerenter', stop);
      host.addEventListener('pointerleave', play);
      document.addEventListener('visibilitychange', () => document.hidden ? stop() : play());
    }
  })();

  /* ══ preloader ══ */
  let booted = false;
  const boot = () => { if (booted) return; booted = true; document.body.classList.add('ready'); shaderBackground(); choreograph(); heroIn(); if (hasGsap) ScrollTrigger.refresh(); };
  setTimeout(boot, 3600);   // fail-safe: the loader can never stick

  if (reduced || !hasGsap) boot();
  else gsap.delayedCall(2.5, boot);                // hold on the glitch, then wipe
})();
