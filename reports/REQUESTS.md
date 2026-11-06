# MJÚK request ledger (every request from Anna and Veronika, one row each)

Rule (CLAUDE.md, 5 Nov): a row is added the day the request arrives. Anything we cannot open goes to Sindri at once.
Status is FIXED only when a regression check exists AND an independent scenario agent passed it on the build she sees.
Statuses: OPEN · FIXED LOCALLY (not on her link) · ON HER LINK (scenario passed there) · HERS (only she can do it) · ASKED (question to her).

| # | Date, msg | Who | Request (her words, short) | Status | Check | Scenario |
|---|---|---|---|---|---|---|
| 1 | 29 Oct video, 5 Nov 3508 | V, A | Ragnar fleece / no fleece as ONE item ("Lined and not lined", 3533) | ON HER LINK | check-choices | A, F |
| 2 | 5 Nov 3529 | V | Ragnar White: fleece NO / YES on the "Ragnar hat. White" page | ON HER LINK | check-choices (id 1645) | F |
| 3 | 5 Nov 3514 | V | "(Choose one)" note: not needed | ON HER LINK | check-choices | C, F |
| 4 | 5 Nov 3515 | V | Pompoms: Material filter with Polar fox and Raccoon | ON HER LINK | check-choices | E |
| 5 | 5 Nov 3515 | V | Pompom material shown on pompoms | ON HER LINK | check-choices | C, F |
| 6 | 5 Nov 3516 | V | Video on some Ragnar pages, not others | ON HER LINK | check-choices | A |
| 7 | 5 Nov 3518 | V | Tenderness neckwarmers in "Goes with" on Tenderness collections | ON HER LINK | check-choices | D |
| 8 | 5 Nov 3526 | V | Sailor: same sections as Ragnar | ON HER LINK: Goes with, composition 100% merino (confirmed 3542: same yarn as Ragnar). Description, care: HERS | check-choices | D |
| 9 | 5 Nov 3512, 3513 | V | Change pompom colour on a 2-pompom hat replaces only one | ON HER LINK | check-choices | F |
| 10 | 5 Nov 3511 to 3513, answer 3538 | V, A | Changing the pompom colour on a hat sold with its pompoms is FREE (Anna 3538); extra pompoms on such a hat are bought separately (3539) | ON HER LINK, told her 5 Nov; scenario H pending | check-choices | |
| 11 | 25 Sep Q22 | A | Merino Aviator: only lined online | ON HER LINK (came back 2 Nov, fixed 5 Nov) | check-choices | A, B |
| 12 | 25 Sep Q18 to Q25 | A | Her names: Lía beanie, Smooth Kitty, Tenderness headband, Icelandic wool blanket, XL double-faced scarf | ON HER LINK (came back 2 Nov, fixed 5 Nov) | check-choices | B |
| 13 | 25 Sep Q24 | A | Explorer hats + scarves off the web shop | ON HER LINK (came back 2 Nov, fixed 5 Nov) | check-choices | B |
| 14 | 25 Sep Q26 | A | Delete the 7 private listings | ON HER LINK (2 came back 2 Nov, fixed 5 Nov) | check-choices | B |
| 15 | 23 Oct 3351 | A | No Akureyri blankets anywhere | ON HER LINK | check-choices | B |
| 16 | 23 Oct 3387, 5 Nov 3543, 3547 | A | All pompoms $29 | DONE in her live WordPress 5 Nov (#11052 $32 -> $29, Quick Edit, read back); her link shows $29 | | C |
| 17 | 23 Oct 3346, answer 5 Nov 3544 | A | One collection one composition: Tenderness label = 50% angora, 25% PA (nylon), 15% viscose, 10% superfine merino | ON HER LINK (family rule) | check-choices | |
| 18 | 23 Oct video | A | Ragnar Black night shows the white hat | HERS (her photos) | | |
| 23 | 5 Nov 3560 | A | Test order offered free shipping under $150 | Iceland zone was $100 (her 25 Sep Q17); her page + 3560 say $150. TEST COPY set to $150. LIVE: set at the switch to the new shop (Sindri 5 Nov), step in LAUNCH-CHECK-BRIEF | | |
| 24 | 5 Nov 3570, Sindri | A | Shipping page looks like code, wall of text | ON HER LINK: reading type + price table from her zones (mjuk-woo-sandbox theme, committed) | | |
| 25 | 5 Nov 3565, 3567 | A | See customer NAMES (they sort parcels by name, not order number) | OPEN: DHL label tool parcel cards say "Order 15898 · Iceland"; needs name first. Separate repo 04-platform/mjuk-shipping, live deploy: Sindri's go | | |
| 26 | 6 Nov 3585 (screenshot, not opened: Telegram Web stuck), 3586 | A | "It runs to the left side of the laptop screen" (checkout) | FIXED ON HER LINK 6 Nov: the 5 Nov info-page reading column (.co-prose, 66ch) also wrapped basket, checkout, Thank you and account; theme index.php now skips it on WooCommerce screens. Measured 1280 to 1920 + 390, EN + IS: full width, two columns. NOT LIVE (theme goes live at the switch). Independent scenario run L PASSED 6 Nov (19/0, EN + IS, 1280 to 1920 + 390, screenshots looked at) | e2e-scenarios (checkout never in .co-prose); _docs/mjuk-launch-check-2026-11/tools/check-shop-screens.mjs | L |
| 27 | 6 Nov 3587 | A | The Iceland suggestion on .com must be "pretty big and obvious, but in two languages, so tourists will know what it is instead of thinking it's cookies" | ON HER LINK 6 Nov: bilingual note under the nav on English pages for visitors in Iceland (Cloudflare country via router /sndr/cc; test server reads CF-IPCountry), Já = same page in Icelandic with the bag, No = gone for good. 15 checks EN pages 1440 + 390. Independent run pending | _docs/mjuk-launch-check-2026-11/tools/check-isnote.mjs | |
| 28 | 6 Nov 3576, 3580, 3582 (voice notes, transcribed locally 6 Nov with whisper-cli) | A | 3576: sent the PDF to her staff; "I need to open this access for you", does not know what ISNIC is. 3580: Bergur registered it, he will add Sindri as ISNIC technical contact this evening; she prefers mjukiceland.is for Icelandic over .com. 3582: thousands of bags printed with mjukiceland.com: can visitors in Iceland see the Icelandic version? | 3580: WAITING on Bergur (ISNIC tech contact SMS99-IS); two-host plan stays. 3582: answered 6 Nov (3584), refined in 3587 = row 27 | | |
| 29 | 6 Nov 17:07 (forwarded from Veronika, screenshot seen in the Telegram app) | V | "The photo is cropped, once I open it (phone version)": Viking beanie. Camel, the full-screen photo viewer cuts the hat at both sides and the top | ON HER LINK 6 Nov: cause = her test copy's image server served WordPress's hard-cropped 2000x1200 size for the viewer (live Jetpack CDN does not crop: checked 1600x1600); fixed in offline/scripts/storefront.mjs (only copies with the photo's own proportions) + viewer sizes to the photo (pages.css). Independent run M PASS (3 products, screenshots looked at) | check-choices (photo viewer) | M |
| 30 | 6 Nov 17:29 video 0:22 (forwarded from Aleksandra) + 17:32 | A | "We need to make left/right scrolling. Otherwise it jumps to the other line" (laptop, trackpad) | ON HER LINK 6 Nov: video watched (frames + Russian audio transcribed): Lenis cancelled sideways wheel/trackpad swipes on rails. Capture listener hands sideways swipes to the row. Reproduced before (0 px), after 12/12. Run M's 4 FAILs reproduced = its swipe landed on the 2.8 s opening logo screen, not a defect | check-choices (rails) + tools/check-rail-wheel.mjs | M |
| 31 | 6 Nov 17:33 | A | "Please remove puffins and gradient blankets from the selection for clothing - they are not suitable for sewing since the pattern is not symmetrical" (Made for you blanket picker) | ON HER LINK 6 Nov: rule notForSewing in tools/groups.json (puffins?, gradient), configurators.js filters it; Icelandic wool keeps 14, cashmere 5. Run M PASS. Aurora Borealis blankets kept (not named by her) | check-choices (made for you) | M |
| 22 | 5 Nov 3548 | A | "Let's launch the website" | ASKED her to test an order first (Test payment on the test link), then a refunded real order after launch; Sindri's full launch check after her test. Brief: _docs/mjuk-2026-11-05/LAUNCH-CHECK-BRIEF.md | | |
| 21 | 5 Nov 3546 | A | "25% PA, not nylon" in all smooth angora collections | ON HER LINK (material rule) | check-choices | |
| 20 | 5 Nov 3540, 3541 | A | Never more than 2 pompoms per hat; extra pompoms bought separately | ON HER LINK (already so) | check-choices | F, G |
| 19 | 23 to 30 Oct | A, V | Earlier notes (basket, bigger photo, Roots 60%, one pompom, rails, search, filters, New, In stock, Show more, alpaca line, map, pompom chooser, swap, Made for you prices + picker, Lookbook) | FIXED earlier, rechecked 5 Nov | e2e + check-choices | B, C, D, E |

On her test link since 5 Nov evening (b35f41a0 copied, her copy refreshed); scenario agent G passed every site row there (127.0.0.1:8890, the server behind mjuk-test.sndrstudio.is). Not deployed to mjukiceland.com.
Details and root causes: `reports/missed-2026-11-05.md`.
