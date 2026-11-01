# Variable products and description formatting — 1 November 2026

Implemented for review; no commits, network calls or product-page build.

## Changes by file

- `tools/pull-woo.mjs:43`: includes attributes/variation IDs in REST fields; `:87` reads every variations page through the existing authenticated `get` and live-call pause. File exports use the same `sndr_variations` array.
- `tools/pull-woo.mjs:141`: `lines()` uses the shared sanitizer, keeping HTML paragraphs, lists, emphasis and safe links. Texturize, shortcode stripping and own-site URL rewriting run on text tokens. Video markers survive. `txt()` is unchanged.
- `tools/pull-woo.mjs:305`: accepts simple/variable products, reports variables without a published positive-price variation, and retains skip reasons for other types. `:370` maps `va`, `vr`, parent minimum price/compare price, gallery images, aggregate availability and single-attribute chips. Variable parents have no `q`. `:420` updates report wording.
- `pdp.js:11`: one dependency-free sanitizer, exported as `make.sanitize` for the importer. It removes comments, scripts/styles/iframes with content, unwanted tags and all unwanted attributes; decodes href entities before checking protocols, escapes hrefs and adds rel/target. `:72` keeps plain-line paragraphs/bullets and converts video markers only in text, never inside hrefs.
- `pdp.js:134`: translated From prefix. `:159` disables variable Add until selection. `:167` renders ordered attribute radio groups in static HTML, with disabled sold-out labels; `:171` announces price changes. All-out products retain the existing sold-out block.
- `pages.js:360`: scopes pompom wiring to its own group. `:416` wires variable choices, availability against other choices, roving tab stops, arrows/Home/End, selected price/savings, sticky bar availability and variation-gallery photo selection.
- `pages.css:410`: adds selected/disabled styling for variable options.
- `app.js:71`: card From prices, variation IDs on existing chips, translated Add/Choose, and a styled Choose link for multiple attributes. Click delegation accepts button.sz so the Choose anchor navigates.
- `app.js:239`: resolves lines to variations and validates required wildcard choices against parent options. Stored unknown variation IDs are dropped, labels rebuilt, line keys rebuilt with variation IDs and choices. Stored previous prices survive until the existing price-change notice compares them with today's variation prices. `:311` uses variation prices/stock in live/sold-since checks; `:321` shares stock across lines for the same variation. `:418` caps variation stock, quantities and sold-individually additions; `:429` stores variation/any-option choices. `:539` sends the variation price and contract below. Variable bag labels show their readable options without an inaccurate Size prefix.
- `functions/bag.js:29`: validates optional positive-integer `v` and optional non-array object `a`, with at most four entries and keys/string values no longer than 60 characters. Both fields survive signing. Other validation and the 6,000-character payload limit remain.
- `assets/i18n-is.js:1`, `tools/is.json:2`: From, Choose, Add and the selection instruction have Icelandic translations, including every new `js:` key.
- `tools/fixtures/variable-products.json:1`: six offline products: one attribute, two attributes with wildcard, empty variable, grouped, all sold out, simple. Includes a sale, quantity, own image and draft variation.
- `tools/check-variable.mjs:1`: Node-only checks for PDP HTML, both sanitizer gates, actual function validation/signing/payload cap, extracted actual bag helpers/add/stock logic, and fixture importer output when installed.
- `assets/data.js:1`, `assets/copy.js:1`, `reports/shop-health.md:1`: intentionally rewritten by the requested fixture import. **These are fixture outputs; Claude should restore all three before shipping.**

## Hand-off contract and choices

Checkout sends `{ id: parentId, q, p: variationPrice, v: variationId, a: { attributeName: option } }`. `a` includes only shopper choices missing from the variation's own fixed attribute map. Simple products retain `{id,q,p}` and pompom `note`/`for` lines remain supported. The function validates shape; PHP remains responsible for parent/variation membership, valid Woo attributes, current stock and current price.

Attribute labels and option order come from Anna's parent product. Variation attributes are joined to parent names by ID, with name/slug fallback. Published positive-price variations retain source order; the first matching in-stock variation wins if wildcard and specific rows overlap. A sold-out option retains a matching ID when one exists; an option with no published matching variation gets disabled with `v:0` on its card chip. Parent price includes sold-out published variations, as requested, and uses the lowest-price row's compare price.

A variation is unavailable if Woo marks it out of stock, explicitly unpurchasable, or managed quantity is zero. No price or stock is inferred from the parent for variable lines. Wildcard options make distinct bag lines but consume the same variation's shelf. Variable hats use their Woo attribute controls and ordinary Add flow rather than the separate simple-hat pompom configurator. Choosing a variation with a photo scrolls the existing gallery to that photo, preserving gallery/zoom indices and avoiding duplicate images.

The sanitizer lives in pdp.js so no browser script loading changes are needed. Safe http(s) links open a new tab; mailto links do not. Bare own-site text URLs still use ownLink; explicit safe anchors keep their href. Video markers retain the site's existing trusted video-link markup. No dependencies were added.

## Verification

Commands (all exit 0):

```sh
node tools/pull-woo.mjs --file tools/fixtures/variable-products.json --catalogue ../../04-platform/mjuk-shipping/customs-catalogue.json
node tools/check-variable.mjs
node --check app.js
node --check pages.js
node --check pdp.js
node --check tools/pull-woo.mjs
node --check functions/bag.js
node --check assets/i18n-is.js
git diff --check
```

The catalogue argument resolves to the same path as the importer's default. Import output: `Products: 6 in WooCommerce, 4 listed (published, visible, simple or variable), 1 on sale, 1 sold out`. `reports/shop-health.md` says four pieces are on the shop, two published products are excluded: `#99003: it has no published variation with a price above 0` and `#99004: a grouped product: the shop sells simple and variable products`. Four fixture products have no design chosen or customs facts; the report also flags missing curated picks because this deliberately tiny catalogue replaces the real one.

Final test output (49 PASS, zero FAIL):

```text
PASS static variable choices and disabled sold-out option
PASS From price and disabled add until selection
PASS all sold out uses existing block
PASS multiple attributes appear in her order
PASS sanitizer script/style/iframe content
PASS sanitizer attributes and comments
PASS sanitizer javascript href
PASS sanitizer data href
PASS sanitizer relative href
PASS sanitizer nested formatting
PASS sanitizer entities in href
PASS sanitizer mailto
PASS sanitizer https
PASS sanitizer encoded markup stays text
PASS video markers never expand inside hrefs
PASS plain bullets and paragraphs
PASS text transform never touches href
PASS bag accepts variation and any attributes
PASS simple bag unchanged
PASS bag rejects v 0
PASS bag rejects v -1
PASS bag rejects v 1.2
PASS bag rejects v "11"
PASS bag rejects v null
PASS bag rejects a null
PASS bag rejects a []
PASS bag rejects a "Navy"
PASS bag rejects a {"a":1}
PASS bag rejects a {"a":"xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"}
PASS bag rejects a {"xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx":"a"}
PASS bag rejects a {"a":"","b":"","c":"","d":"","e":""}
PASS bag accepts four 60-character attributes
PASS signed payload preserves variation contract
PASS 6000-character signed payload cap remains enforced
PASS stored unknown variation dropped
PASS stored variation price and label
PASS stored stock resolves variation
PASS any choice required and validated
PASS any options make separate lines sharing variation stock
PASS sold-out variation cannot be added
PASS one-attribute card any choice reaches bag
PASS sold individually caps available room
PASS fixture gate lists four and skips empty/grouped
PASS fixture parent price/stock and variation-only quantity
PASS fixture ordered chips including sold out
PASS fixture draft excluded and gallery photo deduped
PASS fixture any attributes remain missing and no multi-attribute chips
PASS fixture every-variation-sold-out parent
PASS fixture description formatting survives importer
```

## Not checked

No network host was contacted, including mjukiceland.com, localhost or example.test. REST pagination was inspected but not exercised over HTTP. No browser, device, visual layout, focus interaction, live stock mutation, Woo/PHP cart or real checkout was tested. The tests exercise generated markup and isolated actual bag logic, not the whole DOM wiring. The separate PHP/exporter work is outside this patch. Did not run `tools/build-products.mjs`, install dependencies, build dist or regenerate product/is pages. Those pages must later be rebuilt with real restored catalogue data through the normal release process.

Existing untracked `reports/anna-dossier-2026-10-27.md` and `reports/anna-test-log-2026-10-27.md` were left untouched, as were product/**, is/**, dist/** and .github/**. No browser contexts, simulators, servers or other long-running resources were created; no resource ownership handoff is needed.
