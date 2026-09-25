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
- Anna's own classification, her sheet "Product groups" (Drive, 24 Sep), is `tools/groups.json`:
  her piece groups, her families (with the rows she wrote and her "Matching products"), her nine
  materials with her prestige and popularity, and her bespoke list. `tools/groups.mjs` joins each
  product to a family by its name; the family gives the group and the material, and where her
  sheet names no material the product's composition does (one fibre at 90% or more, or cashmere
  with merino). The pull reports every product that fits no family. The pages read it for the
  shop filters (group, then design, then material), the product page (material in her words,
  "Goes with" from her matching lists read both ways, a rail of those pieces), the materials page
  (`fibres.html`, her materials in her ranking, only her own sentences quoted) and the homepage
  tiles. Icelandic names sit beside the English ones in the same file.
- Checkout: the bag posts to `/bag` (`functions/bag.js`, a Cloudflare Pages Function; the local
  `_serve.cjs` runs the same file with `.dev.vars`). It signs the bag (ids, quantities, pompom
  notes, the price the drawer showed, the language) for ten minutes and sends the browser to the
  WooCommerce host, where the mu-plugin `04-platform/mjuk-woo-sandbox/mu-plugins/sndr-bag-handoff.php`
  fills the cart and opens checkout. Woo prices every line itself; when her price differs from
  the one the bag showed, the basket says so. A bag filled on the Icelandic pages gets checkout
  links back to `/is/`. A customer who signs in at checkout keeps this bag; WooCommerce would
  otherwise pour their old saved basket into it. `GET /bag` answers 204 where checkout is connected; a static preview (GitHub
  Pages) has no `/bag`, so the drawer says checkout is not connected instead of erroring.
  Production needs `BAG_SECRET` (shared with the Woo host's `SNDR_BAG_SECRET`) and
  `CHECKOUT_ORIGIN` set on the Pages project. Deploy check for the Woo side:
  `curl -sI "$CHECKOUT_ORIGIN/?sndr_bag=ping"` must answer 204 with `X-SNDR-Bag: ready`.
- The bag: a piece (or its chosen pompom) sold since it went in stays visible, marked, and
  counts for nothing; quantities above stock are trimmed with a note; prices are today's. At
  most 20 of a piece and 40 lines, the same limits `/bag` accepts. After a hand-off the drawer
  asks for a day whether the order was placed; `?ordered=1` (for the link back from her
  order-received page) empties the bag. Hand-off links work once. Two open tabs share one bag
  (each hears the other's changes), so neither writes back a stale copy.
- `node --no-warnings tools/e2e-handoff.mjs` proves it against the sandbox (22 checks): hand-off,
  tampered, expired, used twice, sold out, pompom without its hat, over stock, the deploy ping,
  a real order through the classic checkout, then undone.
- Every scenario, on both WooCommerces: `node tools/e2e-scenarios.mjs replica|sandbox` (stock,
  unpublished pieces, changed prices, sign-in with a saved basket, her twelve shipping cases and
  country changes, pickup, coupons, PayPal out, cancel, back, paid by IPN, declined, "Pay" again,
  her order emails, Icelandic links; everything it changes is put back). `node tools/e2e-bag.mjs`
  drives the bag in Chrome (two tabs, storage refused, double click, back button, static preview,
  one-of-one, sold since, `/is/`). `node tools/e2e-workerd.mjs` runs `functions/bag.js` in
  Cloudflare's own runtime and measures the biggest possible bag's link (4.3 KB of ~8 KB).
  The replica of her stack (WooCommerce 3.5.10, WordPress 6.4.12, her two PayPals) is
  `04-platform/mjuk-woo-sandbox/replica/`, launch entry `mjuk-woo-replica`; this storefront on
  :5896 hands off to it.

## Two languages (plan step 7)

English pages at the root (mjukiceland.com at launch), Icelandic pages in `is/` (mjukiceland.is):
real, separate, crawlable URLs with `hreflang` both ways, never a text swap on one URL. Build
both after any page change: `node tools/build-pages.mjs && node tools/build-is.mjs`
(`--report` lists any English string left untranslated; it must say 0). Static text is
translated from `tools/is.json`, keyed by the English source; strings the scripts write use
`t()` with the `js:` entries of the same file (`assets/i18n-is.js`). Her product names and texts
stay in her own English on both sites; shipping sentences come in both languages from her zones.
The checkout (one host) is English for now.

## Freshness and made-for-you (plan steps 5 and 6)

- `.github/workflows/stock.yml` refreshes prices, stock and listing from her shop with the
  read-only key (repository secrets `MJUK_WOO_URL`, `MJUK_WOO_CK`, `MJUK_WOO_CS`, set by Sindri).
  Manual until launch; the four-a-day schedule is written in and commented out. Where the
  customs catalogue is not present (on GitHub), each product keeps the facts of the last full
  local pull. WooCommerce stays the final word on stock at checkout.
- Made for you: exactly her 22 "Bespoke clothing" rows (`tools/groups.json` `bespoke`): eight
  models, cashmere and merino or Icelandic wool (cashmere for the shawl and poncho), with or
  without fur; an option her list does not have for the current choice is switched off. The
  colour is one of her blankets in that fabric, in stock (the fabric is her blankets, 11 Sep
  meeting). Salmon leather and length as she described. Prices go in `tools/curation.json`
  `made.prices`, one per row under her own row name, plus `salmonLeather`; null until she gives
  them, and then the page shows no number and "Request this piece" opens an email to customer
  support with every choice written out, her row name first. With a row priced, its total shows.

