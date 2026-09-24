// Copied from 02-clients/clients/myndo/instaprent-design/tools/layout-detect.mjs (2026-09-24),
// with MJÚK's card classes (.prod, .cat) added to what counts as a card.
// The layout check, run inside the page (page.evaluate(detect, rootSelector)).
// Finds text drawn over other text, text outside its card/button/chip/panel,
// text cut off sideways, text past the screen edge, and sideways page scroll.
export function detect(rootSel) {
  const W = innerWidth;
  const root = rootSel ? document.querySelector(rootSel) : document.body;
  if (!root) return { issues: [], scrollW: 0 };
  const cs = (e) => getComputedStyle(e);
  const clipsX = (s) => /hidden|clip|auto|scroll/.test(s.overflowX);
  const clipsY = (s) => /hidden|clip|auto|scroll/.test(s.overflowY);
  const scrollsX = (s) => /auto|scroll/.test(s.overflowX);
  const drawsBox = (e, s) => {
    if (e.matches('[data-card], .c-card, li.product, .product-small, .prod, .cat, .store')) return true;
    if (e === document.body || e === document.documentElement) return false;
    const bg = s.backgroundColor;
    const hasBg = !(bg === 'transparent' || /rgba\(.*,\s*0\)$/.test(bg)) || s.backgroundImage !== 'none';
    const hasBorder = ['Top', 'Right', 'Bottom', 'Left'].filter((k) => parseFloat(s['border' + k + 'Width']) > 0 && s['border' + k + 'Style'] !== 'none').length >= 3;
    return hasBg || hasBorder;
  };
  const name = (e) => {
    const t = e.textContent.trim().replace(/\s+/g, ' ').slice(0, 40);
    const cls = typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
    return `${e.tagName.toLowerCase()}${cls} "${t}"`;
  };
  const fixedIn = (e) => { for (let a = e; a && a !== document.body; a = a.parentElement) { const p = cs(a).position; if (p === 'fixed' || p === 'sticky') return a; } return null; };
  const items = [];
  const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const byEl = new Map();
  for (let n; (n = tw.nextNode());) {
    if (!n.nodeValue.trim()) continue;
    const el = n.parentElement;
    if (!el || el.closest('script,style,noscript,template,title,option,[hidden]')) continue;
    if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
    const rg = document.createRange();
    rg.selectNodeContents(n);
    const rects = [...rg.getClientRects()].filter((q) => q.width > 1 && q.height > 1);
    if (!rects.length) continue;
    if (!byEl.has(el)) byEl.set(el, []);
    byEl.get(el).push(...rects);
  }
  const issues = [];
  for (const [el, rects] of byEl) {
    // the clip box this text is seen through, and whether sideways cutting is on purpose
    let cl = -1e9, cr = 1e9, ct = -1e9, cb = 1e9, scroller = false, ellipsis = false, clipper = null;
    for (let a = el; a && a !== document.documentElement; a = a.parentElement) {
      const s = cs(a);
      if (s.textOverflow === 'ellipsis' || s.webkitLineClamp !== 'none') ellipsis = true;
      if (scrollsX(s)) scroller = true;
      if (a !== el || s.position !== 'static') {
        const r = a.getBoundingClientRect();
        if (clipsX(s) && r.width > 0) { if (r.left > cl) { cl = r.left; clipper = a; } if (r.right < cr) { cr = r.right; clipper = a; } }
        if (clipsY(s) && r.height > 0) { ct = Math.max(ct, r.top); cb = Math.min(cb, r.bottom); }
      }
      if (s.position === 'fixed') break;
    }
    const vis = [];
    for (const q of rects) {
      const L = Math.max(q.left, cl), R = Math.min(q.right, cr), T = Math.max(q.top, ct), B = Math.min(q.bottom, cb);
      if (R - L > 1 && B - T > 1) vis.push({ L, R, T, B, q });
    }
    if (!vis.length) continue; // fully clipped away (screen-reader text, a slide out of view)
    if (!ellipsis && !scroller && vis.some((v) => v.q.right - v.R > 2 || v.L - v.q.left > 2) && vis.every((v) => v.R - v.L > 8)) {
      issues.push({ kind: 'clipped', what: name(el), by: clipper ? name(clipper).slice(0, 60) : '' });
    }
    // the nearest drawn box (card, button, chip, panel) must hold the text
    let box = null;
    for (let a = el; a && a !== document.body; a = a.parentElement) {
      const s = cs(a);
      if (drawsBox(a, s)) { const r = a.getBoundingClientRect(); if (r.width < W - 2) { box = { a, r }; break; } }
      if (s.position === 'fixed') break;
    }
    if (box) {
      const out = vis.map((v) => Math.max(box.r.left - v.L, v.R - box.r.right, box.r.top - v.T, v.B - box.r.bottom)).reduce((m, x) => Math.max(m, x), 0);
      if (out > 1.5) issues.push({ kind: 'escape', what: name(el), box: name(box.a).slice(0, 60), px: Math.round(out) });
    }
    if (!scroller && vis.some((v) => v.R > W + 1 || v.L < -1)) issues.push({ kind: 'offscreen', what: name(el), px: Math.round(Math.max(...vis.map((v) => Math.max(v.R - W, -v.L)))) });
    // for text over text, measure line boxes: a display heading set solid (line-height under
    // the font's own height) has overlapping font boxes between its lines by design
    const st = cs(el), fs = parseFloat(st.fontSize), lh = st.lineHeight === 'normal' ? fs * 1.2 : parseFloat(st.lineHeight);
    const band = vis.map((v) => { const h = v.B - v.T, cut = h > lh ? (h - lh) / 2 : 0; return { L: v.L, R: v.R, T: v.T + cut, B: v.B - cut }; });
    items.push({ el, vis: band, fx: fixedIn(el) });
  }
  // text over text
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const A = items[i], B = items[j];
      if (A.el.contains(B.el) || B.el.contains(A.el)) continue;
      if (A.fx !== B.fx) continue; // a fixed bar over scrolled text covers it, it does not collide
      let hit = 0;
      for (const a of A.vis) for (const b of B.vis) {
        const w = Math.min(a.R, b.R) - Math.max(a.L, b.L), h = Math.min(a.B, b.B) - Math.max(a.T, b.T);
        if (w > 2 && h > 3) hit = Math.max(hit, Math.min(w, h));
      }
      if (hit) issues.push({ kind: 'collide', what: name(A.el), with: name(B.el), px: Math.round(hit) });
    }
  }
  const se = document.scrollingElement;
  return { issues, scrollW: se.scrollWidth - se.clientWidth };
}
