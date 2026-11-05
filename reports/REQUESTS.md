# MJÚK request ledger (every request from Anna and Veronika, one row each)

Rule (CLAUDE.md, 5 Nov): a row is added the day the request arrives. Anything we cannot open goes to Sindri at once.
Status is FIXED only when a regression check exists AND an independent scenario agent passed it on the build she sees.
Statuses: OPEN · FIXED LOCALLY (not on her link) · ON HER LINK (scenario passed there) · HERS (only she can do it) · ASKED (question to her).

| # | Date, msg | Who | Request (her words, short) | Status | Check | Scenario |
|---|---|---|---|---|---|---|
| 1 | 29 Oct video, 5 Nov 3508 | V, A | Ragnar fleece / no fleece as ONE item ("Lined and not lined", 3533) | FIXED LOCALLY | check-choices | A, F |
| 2 | 5 Nov 3529 | V | Ragnar White: fleece NO / YES on the "Ragnar hat. White" page | FIXED LOCALLY | check-choices (id 1645) | F |
| 3 | 5 Nov 3514 | V | "(Choose one)" note: not needed | FIXED LOCALLY | check-choices | C, F |
| 4 | 5 Nov 3515 | V | Pompoms: Material filter with Polar fox and Raccoon | FIXED LOCALLY | check-choices | E |
| 5 | 5 Nov 3515 | V | Pompom material shown on pompoms | FIXED LOCALLY | check-choices | C, F |
| 6 | 5 Nov 3516 | V | Video on some Ragnar pages, not others | FIXED LOCALLY | check-choices | A |
| 7 | 5 Nov 3518 | V | Tenderness neckwarmers in "Goes with" on Tenderness collections | FIXED LOCALLY | check-choices | D |
| 8 | 5 Nov 3526 | V | Sailor: same sections as Ragnar | FIXED LOCALLY: Goes with, composition (100% merino, ASKED to confirm). Description, care: HERS | check-choices | D |
| 9 | 5 Nov 3512, 3513 | V | Change pompom colour on a 2-pompom hat replaces only one | FIXED LOCALLY | check-choices | F |
| 10 | 5 Nov 3511 to 3513 | V | Changing the pompom colour adds the price of a new pompom | ASKED: free or charged? | | |
| 11 | 25 Sep Q22 | A | Merino Aviator: only lined online | FIXED LOCALLY (came back 2 Nov) | check-choices | A, B |
| 12 | 25 Sep Q18 to Q25 | A | Her names: Lía beanie, Smooth Kitty, Tenderness headband, Icelandic wool blanket, XL double-faced scarf | FIXED LOCALLY (came back 2 Nov) | check-choices | B |
| 13 | 25 Sep Q24 | A | Explorer hats + scarves off the web shop | FIXED LOCALLY (came back 2 Nov) | check-choices | B |
| 14 | 25 Sep Q26 | A | Delete the 7 private listings | FIXED LOCALLY (2 came back 2 Nov) | check-choices | B |
| 15 | 23 Oct 3351 | A | No Akureyri blankets anywhere | FIXED LOCALLY | check-choices | B |
| 16 | 23 Oct 3387 | A | Same price for all pompoms | HERS: Cream fox pompom is $32 in WordPress | | C |
| 17 | 23 Oct 3346 | A | One collection one composition (Tenderness nylon vs acrylic) | ASKED (open since 24 Oct) | | |
| 18 | 23 Oct video | A | Ragnar Black night shows the white hat | HERS (her photos) | | |
| 19 | 23 to 30 Oct | A, V | Earlier notes (basket, bigger photo, Roots 60%, one pompom, rails, search, filters, New, In stock, Show more, alpaca line, map, pompom chooser, swap, Made for you prices + picker, Lookbook) | FIXED earlier, rechecked 5 Nov | e2e + check-choices | B, C, D, E |

Not yet ON HER LINK: everything above marked FIXED LOCALLY (commit f7c8e733 and later, not copied to her test link, not deployed).
Details and root causes: `reports/missed-2026-11-05.md`.
