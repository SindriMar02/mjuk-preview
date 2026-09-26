/* MJÚK: the one-address router (SHOP-PLAN §10.2). A Cloudflare Worker on the route
   mjukiceland.com/* (and mjukiceland.is/*), in front of her Hostinger WordPress.

   Her cart lives in a host-only WooCommerce cookie on mjukiceland.com, so the storefront and her
   checkout must share that one hostname. This Worker serves the storefront (the static build in
   dist/, and /bag) and hands every other request to her WordPress with the Host header unchanged:
   on a zone route, fetch() to the zone's own hostname goes to the origin, not back into the Worker.
   WordPress's absolute URLs, the session cookie, the PayPal return URL and IPN all keep working.

   Order of decisions, for mjukiceland.com:
     1. www. → the bare host (301)
     2. /bag → functions/bag.js (signs the bag, sends the shopper to /?sndr_bag=…)
     3. hers, always: /basket /checkout /my-account /wp-admin /wp-content /wp-includes /wp-json
        /wp-login.php /wc-api /.well-known …, any POST that is not /bag, and / with any query
        other than tracking tags (?add-to-cart, ?wc-ajax, ?wc-api for PayPal, ?sndr_bag, ?p=, ?s=),
        and a WooCommerce action (?add-to-cart=, ?wc-ajax=, ?wc-api=, …) on any path
     4. her old addresses → ours (301): /shop/, /product-category/…/ (tools/category-map.json),
        /product.html?p=<slug>, /index.html, /product/<slug> without its slash, /is/… → mjukiceland.is
     5. ours, when the build has the file: /, /shop.html, /product/<slug>/, /assets/…, sitemap, robots
     6. everything else is hers: her own pages (shipping, returns, contact, blog), product tags,
        and any product we have no page for (drafts, hidden), so nothing she had turns into a 404.
   Never cached: basket, checkout, account, wc-ajax, wc-api, wp-admin, wp-login, add-to-cart, the
   hand-off, and any request carrying a WooCommerce or WordPress login cookie.

   mjukiceland.is serves the Icelandic pages (dist/is/) at its root, with the shared files (assets,
   CSS, scripts) from the build's root, and /bag. It has no WordPress behind it: checkout is on .com.

   Local rehearsal (tools/e2e-router.mjs): env.ORIGIN points at a local WooCommerce and the Host
   the shopper used travels as X-SNDR-Rehearsal-Host (the local test glue makes WordPress answer
   as that host); EN_HOST / IS_HOST name the two hosts. Live, none of these are set. */
import { onRequestGet as bagGet, onRequestPost as bagPost } from '../functions/bag.js';
import CATS from '../tools/category-map.json';

const HERS = /^\/(?:basket|checkout|my-account|wp-admin|wp-content|wp-includes|wp-json|wc-api|wc-auth|\.well-known|feed|comments\/feed)(?:\/|$)|^\/(?:wp-login|wp-cron|wp-signup|wp-activate|wp-trackback|wp-comments-post|xmlrpc)\.php$|^\/wp-sitemap[^/]*\.xml$|^\/wp-sitemap\.xsl$/;
const PRIVATE = /^\/(?:basket|checkout|my-account|wp-admin|wp-login\.php|wc-api|wc-auth)(?:\/|$)/;
const SESSION = /(?:^|;\s*)(?:woocommerce_[a-z_]+|wp_woocommerce_session_[^=]*|wordpress_logged_in_[^=]*|wordpress_sec_[^=]*|wordpress_[0-9a-f]{32})=/;
const TRACKING = /^(?:utm_[a-z]+|gclid|fbclid|msclkid|mc_cid|mc_eid|_ga|ref)$/;
// WooCommerce's own actions ride in the query on ANY path (her old "add to cart" links were
// /shop/?add-to-cart=…, /product/<slug>/?add-to-cart=…): those always go to WordPress (Codex, 2026-09-25)
// Decoded keys, not the raw query: "?%61dd-to-cart=1" is add-to-cart to WordPress too (Codex 2026-09-26)
const WOO_KEYS = new Set(['add-to-cart', 'wc-ajax', 'wc-api', 'sndr_bag', 'removed_item', 'undo_item', 'remove_item', 'order_again', 'pay_for_order', 'key']);
const wooAction = url => [...url.searchParams.keys()].some(k => WOO_KEYS.has(k));
const SHARED = /^\/(?:assets\/|(?:styles|pages|configurators)\.css$|(?:app|pages|pdp|configurators)\.js$)/;

const moved = (to, status = 301) => new Response(null, { status, headers: { Location: to, 'Cache-Control': 'public, max-age=3600' } });

// her WordPress, same Host; never from a cache when it is personal
async function hers(request, env, url, why) {
  const personal = PRIVATE.test(url.pathname) || SESSION.test(request.headers.get('Cookie') || '') || wooAction(url);
  let req = request;
  if (env.ORIGIN) { // local rehearsal only
    const o = new URL(env.ORIGIN);
    const u = new URL(url); u.protocol = o.protocol; u.host = o.host;
    req = new Request(u, request);
    req.headers.set('X-SNDR-Rehearsal-Host', url.host);
  }
  const res = await fetch(req, { redirect: 'manual', ...(personal ? { cache: 'no-store' } : {}) });
  const out = new Response(res.body, res);
  out.headers.set('X-MJUK-Route', 'wordpress' + (why ? ':' + why : ''));
  if (personal) out.headers.set('Cache-Control', 'private, no-store, max-age=0');
  return out;
}

// ours: exact files only (assets html_handling "none"); /dir/ is dir/index.html
async function ours(request, env, path) {
  const file = path.endsWith('/') ? path + 'index.html' : path;
  const u = new URL(request.url); u.pathname = file; u.search = '';
  const res = await env.ASSETS.fetch(new Request(u, { method: request.method === 'HEAD' ? 'HEAD' : 'GET', headers: request.headers }));
  if (res.status !== 200 && res.status !== 304) return null;
  const out = new Response(res.body, res);
  out.headers.set('X-MJUK-Route', 'storefront');
  return out;
}

function oldAddress(url) {
  const p = url.pathname;
  if (p === '/index.html') return '/';
  if (/^\/shop(?:\/page\/\d+)?\/?$/.test(p)) return '/shop.html';
  const cat = p.match(/^\/product-category\/(.+?)\/?$/);
  if (cat) {
    const segs = cat[1].replace(/\/page\/\d+$/, '').split('/').filter(Boolean);
    const hit = CATS.map[segs[segs.length - 1]];
    return hit ? '/' + hit.to : null; // a category she has since removed: WordPress answers for it
  }
  if (p === '/product.html' && /^[a-z0-9_-]+$/i.test(url.searchParams.get('p') || '')) return '/product/' + url.searchParams.get('p') + '/';
  return null;
}

async function bag(request, env) {
  if (request.method === 'GET' || request.method === 'HEAD') return bagGet({ request, env });
  if (request.method === 'POST') return bagPost({ request, env });
  return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, POST' } });
}

async function english(request, env, url) {
  const p = url.pathname, get = request.method === 'GET' || request.method === 'HEAD';
  if (p === '/bag') return bag(request, env);
  if (HERS.test(p)) return hers(request, env, url, 'path');
  if (!get) return hers(request, env, url, 'method');
  if (wooAction(url)) return hers(request, env, url, 'action');
  // on the homepage, any query but a tracking tag is WordPress's: add-to-cart, wc-ajax, wc-api, the hand-off, ?p=, ?s=
  if (p === '/' && [...url.searchParams.keys()].some(k => !TRACKING.test(k))) return hers(request, env, url, 'query');
  if (p === '/is' || p.startsWith('/is/')) {
    // straight to the final Icelandic address, in one hop: her old shop and category forms, and a
    // product without its closing slash, resolve here rather than 404 or redirect again (Codex 2026-09-26)
    const rest = new URL(url); rest.pathname = p.replace(/^\/is\/?/, '/').replace(/\/index\.html$/, '/');
    const old = oldAddress(rest);
    const to = old || (/^\/product\/[^/]+$/.test(rest.pathname) ? rest.pathname + '/' + url.search : rest.pathname + url.search);
    return moved(`https://${env.IS_HOST || 'mjukiceland.is'}${to}`);
  }
  const old = oldAddress(url);
  if (old) return moved(old);
  // a product page without its closing slash
  if (/^\/product\/[^/]+$/.test(p) && await ours(request, env, p + '/')) return moved(p + '/' + url.search);
  const mine = await ours(request, env, p);
  return mine || hers(request, env, url, 'fallback');
}

async function icelandic(request, env, url) {
  const p = url.pathname;
  if (p === '/bag') return bag(request, env);
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405 });
  if (p === '/index.html') return moved('/');
  if (/^\/product\/[^/]+$/.test(p) && await ours(request, env, '/is' + p + '/')) return moved(p + '/' + url.search);
  const mine = SHARED.test(p) ? await ours(request, env, p) : await ours(request, env, '/is' + p);
  if (mine) return mine;
  return new Response('<!DOCTYPE html><html lang="is"><head><meta charset="UTF-8"><meta name="robots" content="noindex"><title>MJÚK Iceland</title></head><body><p>Þessi síða fannst ekki. <a href="/">MJÚK Iceland</a></p></body></html>',
    { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-MJUK-Route': 'storefront:404' } });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const EN = env.EN_HOST || 'mjukiceland.com', IS = env.IS_HOST || 'mjukiceland.is';
    if (url.host === 'www.' + EN) return moved(`https://${EN}${url.pathname}${url.search}`);
    if (url.host === 'www.' + IS) return moved(`https://${IS}${url.pathname}${url.search}`);
    if (url.host === IS) return icelandic(request, env, url);
    return english(request, env, url);
  },
};
