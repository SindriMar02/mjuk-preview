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
// the homepage goes to WordPress only for WordPress's own query keys (?p=, ?s=, ?page_id=, previews,
// feeds, ?rest_route=) or a WooCommerce action; every other query (utm_*, gclid, gad_source, gbraid,
// fbclid, igshid, srsltid, ttclid, _gl … and whatever the ad platforms add next) stays on the storefront.
// Before: an allow-list of tracking tags, so Google Ads' gad_source=1 landed on her old homepage.
const WP_KEYS = new Set(['p', 'page_id', 's', 'post_type', 'preview', 'preview_id', 'preview_nonce', 'rest_route', 'cat', 'tag', 'm', 'author', 'feed', 'attachment_id', 'customize_changeset_uuid', 'customize_theme', 'wc-ajax', 'wc-api']);
const wpQuery = url => [...url.searchParams.keys()].some(k => WP_KEYS.has(k));
// WooCommerce's own actions ride in the query on ANY path (her old "add to cart" links were
// /shop/?add-to-cart=…, /product/<slug>/?add-to-cart=…): those always go to WordPress (Codex, 2026-09-25)
// Decoded keys, not the raw query: "?%61dd-to-cart=1" is add-to-cart to WordPress too (Codex 2026-09-26)
const WOO_KEYS = new Set(['add-to-cart', 'wc-ajax', 'wc-api', 'sndr_bag', 'removed_item', 'undo_item', 'remove_item', 'order_again', 'pay_for_order', 'key']);
const wooAction = url => [...url.searchParams.keys()].some(k => WOO_KEYS.has(k));
const STATIC = /^\/wp-(?:content|includes)\/.+\.(?:css|js|woff2?|ttf|otf|eot|png|jpe?g|gif|webp|avif|svg|ico|map)$/i;
const UNAVAILABLE = '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="robots" content="noindex"><meta http-equiv="refresh" content="30"><title>MJÚK Iceland</title><style>body{font:16px/1.5 system-ui,sans-serif;margin:4rem auto;max-width:34rem;padding:0 1rem;color:#222}</style></head><body><h1>One moment</h1><p>The checkout is not answering right now. This page tries again in half a minute; your bag is kept. <a href="/">Back to the shop</a>.</p></body></html>';
const SHARED = /^\/(?:assets\/|(?:styles|pages|configurators)\.css$|(?:app|pages|pdp|configurators)\.js$)/;

/* Her edits reach the live site through a refresh (the stock workflow: pull → build → deploy). WooCommerce
   tells this Worker about every product change (webhooks product.created/updated/deleted, and order.updated
   for stock, all → POST /sndr/refresh, signed with REFRESH_SECRET), and the Worker asks GitHub to run the
   workflow (REFRESH_DISPATCH = the workflow_dispatch address, REFRESH_TOKEN = a fine-grained token with
   Actions: write on that repository). GitHub coalesces a burst of edits into one running + one queued run.
   Nothing here touches her shop; a missing setting answers 503 so the webhook shows "failed" in wp-admin. */
async function refresh(request, env) {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: { Allow: 'POST' } });
  if (!env.REFRESH_SECRET || !env.REFRESH_DISPATCH || !env.REFRESH_TOKEN) return new Response('refresh not configured', { status: 503 });
  const raw = await request.text();
  if (raw.length > 512 * 1024) return new Response('too large', { status: 413 });
  const sig = request.headers.get('x-wc-webhook-signature') || '';
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.REFRESH_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw)))));
  const a = new TextEncoder().encode(mac), b = new TextEncoder().encode(sig);
  let same = a.length === b.length; for (let i = 0; i < a.length && same; i++) same = a[i] === b[i];
  if (!same) return new Response('bad signature', { status: 401 });
  // WooCommerce's first delivery is a ping (webhook_id=N, no JSON): accepted, nothing to refresh
  if (/^webhook_id=\d+$/.test(raw.trim())) return new Response(null, { status: 204 });
  const topic = request.headers.get('x-wc-webhook-topic') || '';
  const r = await fetch(env.REFRESH_DISPATCH, { method: 'POST', headers: { Authorization: 'Bearer ' + env.REFRESH_TOKEN, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'User-Agent': 'mjuk-router' },
    body: JSON.stringify({ ref: env.REFRESH_REF || 'main', inputs: { reason: topic.slice(0, 60) || 'webhook' } }) });
  return new Response(r.status === 204 || r.ok ? null : 'dispatch failed: ' + r.status, { status: r.status === 204 || r.ok ? 202 : 502, headers: { 'Cache-Control': 'no-store' } });
}

const moved = (to, status = 301) => new Response(null, { status, headers: { Location: to, 'Cache-Control': 'public, max-age=3600' } });

// her WordPress, same Host; never from a cache when it is personal
async function hers(request, env, url, why) {
  // her theme's CSS, fonts and scripts are the same for everyone: a shopper carrying a cart cookie
  // must not pull every /wp-content file uncached from a shared host at checkout
  const staticFile = STATIC.test(url.pathname);
  const personal = !staticFile && (PRIVATE.test(url.pathname) || SESSION.test(request.headers.get('Cookie') || '') || wooAction(url));
  let req = request;
  if (env.ORIGIN) { // local rehearsal only
    const o = new URL(env.ORIGIN);
    const u = new URL(url); u.protocol = o.protocol; u.host = o.host;
    req = new Request(u, request);
    req.headers.set('X-SNDR-Rehearsal-Host', url.host);
  }
  let res;
  try {
    res = await fetch(req, { redirect: 'manual', ...(personal ? { cache: 'no-store' } : {}) });
  } catch (e) {
    // her host refused or timed out (it has before): a plain answer that says to try again, never a
    // Cloudflare error screen. The storefront itself never touches the origin.
    return new Response(UNAVAILABLE, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Retry-After': '30', 'Cache-Control': 'private, no-store, max-age=0', 'X-MJUK-Route': 'wordpress:unavailable' } });
  }
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
  if (p === '/sndr/refresh') return refresh(request, env);
  if (HERS.test(p)) return hers(request, env, url, 'path');
  if (!get) return hers(request, env, url, 'method');
  if (wooAction(url)) return hers(request, env, url, 'action');
  // on the homepage, any query but a tracking tag is WordPress's: add-to-cart, wc-ajax, wc-api, the hand-off, ?p=, ?s=
  if (p === '/' && wpQuery(url)) return hers(request, env, url, 'query');
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
