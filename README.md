# MJÚK Iceland — redesign concept

An unsolicited redesign concept for **Mjúk Iceland ehf** (mjukiceland.com), built by
[SNDR Studio](https://sndr-studio.pages.dev) as a demonstration only.

Not affiliated with, commissioned by, or endorsed by Mjúk Iceland. All product
photography, product names, prices and store details belong to Mjúk Iceland and are
pulled live from their own public storefront purely to show the layout with real
content. Prices and stock shown here are a snapshot and are not a live offer — the real
shop is at [mjukiceland.com](https://mjukiceland.com).

Static site: vanilla HTML/CSS/JS, GSAP + Lenis from a CDN, no build step.
Run locally with `node _serve.cjs` and open http://127.0.0.1:5895.

## Catalogue and checkout (storefront build, steps 1–3 of `_docs/MJUK-STOREFRONT-PLAN-2026-09-24.md`)

- `node tools/pull-woo.mjs` writes `assets/data.js` and `assets/copy.js` from WooCommerce wc/v3:
  the local sandbox by default, `--live` for her shop with the read-only key (paced, stops at
  the first 5xx), `--file` for a saved pull, `--dry` to only report. Composition, type and
  origin come from the customs catalogue in `04-platform/mjuk-shipping`; where her text states
  nothing, the page says nothing. Editorial picks live in `tools/curation.json`, by product id.
- Checkout: the bag posts to `/bag` (`functions/bag.js`, a Cloudflare Pages Function; the local
  `_serve.cjs` runs the same file with `.dev.vars`). It signs the bag (ids, quantities, pompom
  notes, never prices) for ten minutes and sends the browser to the WooCommerce host, where the
  mu-plugin `04-platform/mjuk-woo-sandbox/mu-plugins/sndr-bag-handoff.php` fills the cart and
  opens checkout. `GET /bag` answers 204 where checkout is connected; a static preview (GitHub
  Pages) has no `/bag`, so the drawer says checkout is not connected instead of erroring.
  Production needs `BAG_SECRET` (shared with the Woo host's `SNDR_BAG_SECRET`) and
  `CHECKOUT_ORIGIN` set on the Pages project. Deploy check for the Woo side:
  `curl -sI "$CHECKOUT_ORIGIN/?sndr_bag=ping"` must answer 204 with `X-SNDR-Bag: ready`.
- The bag: a piece (or its chosen pompom) sold since it went in stays visible, marked, and
  counts for nothing; quantities above stock are trimmed with a note; prices are today's. At
  most 20 of a piece and 40 lines, the same limits `/bag` accepts. After a hand-off the drawer
  asks for a day whether the order was placed; `?ordered=1` (for the link back from her
  order-received page) empties the bag. Hand-off links work once.
- `node --no-warnings tools/e2e-handoff.mjs` proves it against the sandbox (19 checks): hand-off,
  tampered, expired, used twice, sold out, pompom without its hat, over stock, the deploy ping,
  a real order through the classic checkout, then undone.
