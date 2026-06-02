# EOFY 50% Off Sale — Design Spec

**Date:** 2026-06-03
**Author:** Claude (with Irfan & Jaden)
**Status:** Approved for planning

## Goal

Create end-of-financial-year urgency to drive signups before 30 June 2026, and
give sales reps a concrete discount lever. Achieved by **displaying** a doubled
"regular" price struck through, with the current price presented as a 50%-off
"EOFY price".

## Core decisions (locked)

| Decision | Choice |
|----------|--------|
| Pricing mechanic | **Presentational only.** Net price the customer pays = exactly today's price. Stripe prices, `pricing.ts` real values, signup/checkout — all untouched. |
| Scope | All surfaces: website public pages, proposal email + PDF, portal + mobile sales tools, sales training content. |
| Setup fee | **Left as-is.** No strike-through on setup fees ($299/$349/$399). Only the subscription gets the EOFY treatment. |
| Annual plans | **Keep both.** Show doubled annual struck through → today's annual as EOFY price, AND keep the existing "2 months free / Save $X" messaging. Net annual unchanged. |
| Expiry | **Auto-revert by date.** A date-gated sale mode reverts to normal single-price display on 1 July 2026 with no code change or deploy. |
| ACCC was/now risk | Flagged to Irfan (struck-through "regular" never actually charged = classic misleading-pricing exposure under Australian Consumer Law). Irfan chose to **build as asked** (doubled strike-through) accepting the risk. |

## Approach

Three separate repos (`talkmate-website`, `talkmate-portal`, `talkmate-mobile`),
each with its own price constants and its own deploy. No shared package exists.

**Chosen approach:** add a small `eofy-sale` helper module **in each repo**.
Each helper holds one config block and the display logic. Display components
import from their local helper.

```
SALE_LABEL         = "EOFY Sale"
DISCOUNT_PERCENT   = 50
REGULAR_MULTIPLIER = 2            // "regular" = today's net price × 2
SALE_END           = 2026-06-30T23:59:59 +10:00 (AEST)
SALE_START         = (optional; default: already active)

isSaleActive(now?) -> boolean    // now <= SALE_END
regularPrice(net)  -> number     // net × REGULAR_MULTIPLIER
saleBadge()        -> string     // "50% OFF · EOFY SALE · ENDS JUNE 30"
```

**Rejected alternatives:**
- *Hardcode struck-through markup inline* — no auto-revert; scattered; error-prone.
- *Centralise in portal `pricing.ts`, import cross-repo* — separate repos/deploys
  make cross-repo imports fragile and couple the deploy cadence.

**Why net price is safe:** the real charged values live in
`talkmate-portal/src/lib/pricing.ts` (`$299/$499/$799`) and the Stripe price IDs.
None of those change. The "regular" doubled price is computed for display only.
When `isSaleActive()` returns false (after 30 June), every surface renders exactly
the pre-sale UI.

## Display behaviour when sale is active

For each plan card / price display:
- **Big price** = today's net price (e.g. `$299/mo`), framed as the EOFY price.
- **Struck-through regular** above/beside it = `regularPrice(net)` (e.g. `$598/mo`).
- **Badge**: `50% OFF · EOFY SALE · ENDS JUNE 30`.
- **Setup fee**: rendered at current value, no strike-through.
- **Annual**: struck `$5,980/yr` → `$2,990/yr`; existing "2 months free / Save $598"
  messaging retained.
- **Urgency element**: badge copy includes the end date. (Live countdown timer is
  optional polish, not required — see Open Questions.)

When `isSaleActive()` is false: render the current (pre-sale) UI unchanged.

## Surfaces & files

### Website — `talkmate-website`
- **NEW** `src/lib/eofy-sale.ts` — config + helpers.
- `src/components/PricingCards.tsx` — monthly + annual cards: struck-through regular,
  EOFY badge, heading callout. (Used on `/pricing`.)
- `src/app/page.tsx` — home page has its **own** hardcoded pricing cards block
  (~lines 1028–1078); apply the same treatment to all three cards.
- **Left unchanged:** inline copy like "from $299/month", "TalkMate costs $299 a month",
  "Get your X for $299/mo", `paybackDays = 299 / …` — all still true (net unchanged).

### Portal — `talkmate-portal`
- **NEW** `src/lib/eofy-sale.ts` — config + helpers.
- Proposal generation (`src/lib/proposal-send.ts`, `src/lib/proposal/fill-template.ts`,
  template `src/lib/proposal/templates/towing-proposal.html` pricing table ~845–888,
  and `confirmation.html` if it shows prices): the EOFY pricing block is injected
  **at send time** (server-side), gated by `isSaleActive()`, because email HTML cannot
  run client-side date logic. If active → struck-through regular + EOFY price + badge;
  else → current pricing table.
- `src/components/sales/QuickProposalForm.tsx` and `src/components/sales/ProposalForm.tsx`
  — radio labels show "~~$598~~ $299/mo" leverage when sale active.
- `src/lib/proposal/roi.ts` — **unchanged.** Break-even uses the real annual (4990);
  net is unchanged so the maths stays correct.
- `src/lib/pricing.ts` — **unchanged** (source of truth / Stripe).

### Mobile — `talkmate-mobile`
- **NEW** `src/lib/eofy-sale.js` — config + helpers.
- The screen(s) that render `src/lib/pricing.js` plan prices — apply EOFY display.
- `src/lib/pricing.js` — **unchanged** (real values).

### Training content (both repos)
- `talkmate-portal/src/lib/training-modules.ts` and
  `talkmate-mobile/src/data/trainingModules.js` — update the pricing module copy so
  reps pitch the EOFY framing consistently ("regular $598, EOFY $299, ends June 30").

## Testing

- **Unit:** `eofy-sale` helper in each repo — `isSaleActive()` true before
  SALE_END and false after; `regularPrice()` doubling; badge string. Use injectable
  `now` so tests are deterministic (no reliance on real clock).
- **Visual/QA (per global pipeline):** website `/pricing` + home cards show
  struck-through + badge; proposal email rendered with sale active shows the block;
  proposal forms show leverage labels; mobile pricing screen; confirm setup fee is
  NOT struck through; confirm annual keeps "2 months free".
- **Revert check:** set `now` past SALE_END in tests → every surface renders pre-sale UI.

## Open questions / optional polish

- Live countdown timer (days:hours) vs. static "ends June 30" badge. Default: static
  badge (simpler, no client timer). Can add countdown if Irfan wants extra pressure.
- `SALE_START` — default is "already active now". Set a start date only if the sale
  should not appear until a specific day.

## Out of scope

- Any change to real charged prices, Stripe products/price IDs, signup, checkout,
  or `pricing.ts`/`pricing.js` real values.
- Genuine price rise (explicitly declined).
- Future-promo generalisation beyond the date-gated config already included.
