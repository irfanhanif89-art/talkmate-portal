# EOFY 50% Off Sale Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display a doubled "regular" price struck through with the current price as a 50%-off "EOFY price" across all customer/rep touchpoints, creating urgency to sign up before 30 June 2026 — without changing the actual price charged.

**Architecture:** Each of the three repos (`talkmate-website`, `talkmate-portal`, `talkmate-mobile`) gets a self-contained `eofy-sale` helper holding one config (50% off, 2× regular multiplier, ends 30 June 2026 AEST) and the display logic. Display surfaces import their local helper. Real charged prices (`pricing.ts`, `pricing.js`, Stripe IDs) are untouched — the "regular" price is computed for display only, and `isSaleActive()` auto-reverts every surface on 1 July 2026.

**Tech Stack:** Next.js (website + portal), React Native/Expo (mobile), TypeScript + plain `node:assert` tests run with `npx tsx`, server-side HTML string templating for proposals.

**Spec:** `docs/superpowers/specs/2026-06-03-eofy-50-off-sale-design.md`

**Badge text (canonical, reuse verbatim):** `50% OFF · EOFY SALE · ENDS JUNE 30`

---

## File structure

| Repo | File | Responsibility |
|------|------|----------------|
| website | `src/lib/eofy-sale.ts` (NEW) | Config + `isSaleActive`/`regularPrice` |
| website | `src/components/EofySale.tsx` (NEW) | `'use client'` `EofyWas` + `EofyBadge` components (mount-gated, auto-revert) |
| website | `src/components/PricingCards.tsx` | Strike-through + badge on monthly/annual cards |
| website | `src/app/page.tsx` | Same on home page's own pricing cards (~1041/1059/1077) |
| website | `src/app/talkmate-home.css` | `.eofy-was` / `.eofy-badge` styles for the home cards |
| portal | `src/lib/eofy-sale.ts` (NEW) | Config + `isSaleActive`/`regularPrice` + `applyEofySaleToProposalHtml` |
| portal | `src/lib/proposal-send.ts` | Call `applyEofySaleToProposalHtml` at send time |
| portal | `src/lib/proposal/templates/towing-proposal.html` | CSS for `.plan-was` / `.eofy-banner` |
| portal | `src/components/sales/QuickProposalForm.tsx` | Strike-through in plan radio labels |
| portal | `src/components/sales/ProposalForm.tsx` | Strike-through in plan radio labels |
| portal | `src/lib/training-modules.ts` | Teach EOFY framing in pricing module |
| mobile | `src/lib/eofy-sale.js` (NEW) | Config + `isSaleActive`/`regularPrice` |
| mobile | `src/data/trainingModules.js` | Teach EOFY framing in pricing module |

Left unchanged on purpose: `pricing.ts`, `pricing.js`, Stripe IDs, signup/checkout, `roi.ts` (uses real annual; net unchanged), website inline "$299/mo" copy (still true), `confirmation.html` (post-acceptance).

---

## Task 1: Website EOFY sale helper

**Files:**
- Create: `talkmate-website/src/lib/eofy-sale.ts`
- Test: `talkmate-website/src/lib/eofy-sale.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// talkmate-website/src/lib/eofy-sale.test.ts
import assert from 'node:assert'
import { EOFY_SALE, isSaleActive, regularPrice } from './eofy-sale'

assert.equal(regularPrice(299), 598)
assert.equal(regularPrice(2990), 5980)
assert.equal(regularPrice(799), 1598)
assert.equal(EOFY_SALE.discountPercent, 50)
assert.equal(EOFY_SALE.badge, '50% OFF · EOFY SALE · ENDS JUNE 30')
// active during June 2026, inactive from 1 July 2026 (AEST)
assert.equal(isSaleActive(new Date('2026-06-15T12:00:00+10:00')), true)
assert.equal(isSaleActive(new Date('2026-06-30T23:00:00+10:00')), true)
assert.equal(isSaleActive(new Date('2026-07-01T00:00:01+10:00')), false)
console.log('eofy-sale (website) ok')
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd talkmate-website && npx tsx src/lib/eofy-sale.test.ts`
Expected: FAIL — `Cannot find module './eofy-sale'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// talkmate-website/src/lib/eofy-sale.ts
// EOFY 50%-off sale — DISPLAY ONLY. Net price charged is unchanged; the
// "regular" price is computed (net × 2) purely for the struck-through display.
// isSaleActive() auto-reverts every surface after the end date — no deploy needed.

export const EOFY_SALE = {
  label: 'EOFY Sale',
  discountPercent: 50,
  regularMultiplier: 2,
  // End of 30 June 2026, AEST (UTC+10).
  endsAt: new Date('2026-06-30T23:59:59+10:00'),
  badge: '50% OFF · EOFY SALE · ENDS JUNE 30',
} as const

export function isSaleActive(now: Date = new Date()): boolean {
  return now.getTime() <= EOFY_SALE.endsAt.getTime()
}

export function regularPrice(net: number): number {
  return net * EOFY_SALE.regularMultiplier
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd talkmate-website && npx tsx src/lib/eofy-sale.test.ts`
Expected: PASS — prints `eofy-sale (website) ok`.

- [ ] **Step 5: Commit**

```bash
git add talkmate-website/src/lib/eofy-sale.ts talkmate-website/src/lib/eofy-sale.test.ts
git commit -m "feat(website): add EOFY sale display helper"
```

---

## Task 2: Website EofyWas + EofyBadge client components

**Files:**
- Create: `talkmate-website/src/components/EofySale.tsx`

These are mount-gated (`useEffect`) so the server renders nothing for the sale and the client decides at runtime — guaranteeing auto-revert even if a page is statically generated, with no hydration mismatch.

- [ ] **Step 1: Write the component**

```tsx
// talkmate-website/src/components/EofySale.tsx
'use client'

import { useEffect, useState } from 'react'
import { EOFY_SALE, isSaleActive, regularPrice } from '@/lib/eofy-sale'

function useSaleActive(): boolean {
  const [active, setActive] = useState(false)
  useEffect(() => { setActive(isSaleActive()) }, [])
  return active
}

/** Struck-through "regular" price (net × 2). Renders nothing when the sale is off. */
export function EofyWas({ net, style }: { net: number; style?: React.CSSProperties }) {
  const active = useSaleActive()
  if (!active) return null
  return (
    <span
      style={{
        textDecoration: 'line-through',
        opacity: 0.55,
        fontWeight: 700,
        marginRight: 8,
        ...style,
      }}
    >
      ${regularPrice(net).toLocaleString('en-AU')}
    </span>
  )
}

/** EOFY sale badge pill. Renders nothing when the sale is off. */
export function EofyBadge({ style }: { style?: React.CSSProperties }) {
  const active = useSaleActive()
  if (!active) return null
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center',
        padding: '4px 11px', borderRadius: 99,
        background: 'rgba(232,98,42,0.12)',
        border: '1px solid rgba(232,98,42,0.45)',
        color: '#E8622A', fontSize: 11, fontWeight: 800,
        letterSpacing: '0.06em', whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {EOFY_SALE.badge}
    </span>
  )
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `cd talkmate-website && npx tsc --noEmit`
Expected: PASS (no errors referencing `EofySale.tsx`).

- [ ] **Step 3: Commit**

```bash
git add talkmate-website/src/components/EofySale.tsx
git commit -m "feat(website): add EofyWas + EofyBadge sale display components"
```

---

## Task 3: Website PricingCards — strike-through + badge

**Files:**
- Modify: `talkmate-website/src/components/PricingCards.tsx`

- [ ] **Step 1: Import the sale components**

At the top with the other imports (after line 5 `import { Check, Sparkles } from 'lucide-react'`), add:

```tsx
import { EofyWas, EofyBadge } from '@/components/EofySale'
```

- [ ] **Step 2: Add the badge to the section heading**

Replace the heading `<h2>` block (lines ~115–117) so the badge sits above it:

```tsx
          <div style={{ marginBottom: 14 }}>
            <EofyBadge />
          </div>
          <h2 className={isDark ? 'section-h' : 'section-h dark'}>
            One subscription. <span style={{ color: 'var(--orange)' }}>Save 2 months with annual.</span>
          </h2>
```

- [ ] **Step 3: Add struck-through regular above the big price**

In the price block (lines ~227–237), insert `<EofyWas>` immediately before the `<span>` that renders `${formatAud(price)}`. `price` is the net monthly or annual value, which is exactly what `EofyWas` doubles:

```tsx
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
                  {isAnnual && (
                    <Sparkles size={20} color="var(--orange)" style={{ marginRight: 2, marginBottom: -2 }} />
                  )}
                  <EofyWas net={price} style={{ fontSize: 22 }} />
                  <span style={{ fontSize: 44, fontWeight: 800, color: isDark ? 'white' : 'var(--navy)', letterSpacing: '-1px' }}>
                    ${formatAud(price)}
                  </span>
                  <span style={{ fontSize: 14, color: isDark ? 'rgba(255,255,255,0.5)' : 'var(--muted)' }}>
                    {isAnnual ? '/year' : '/month'}
                  </span>
                </div>
```

- [ ] **Step 4: Verify build + typecheck**

Run: `cd talkmate-website && npx tsc --noEmit && npm run build`
Expected: PASS, no errors.

- [ ] **Step 5: Commit**

```bash
git add talkmate-website/src/components/PricingCards.tsx
git commit -m "feat(website): EOFY strike-through + badge on pricing cards"
```

---

## Task 4: Website home page pricing cards + CSS

**Files:**
- Modify: `talkmate-website/src/app/page.tsx` (price cards ~1028–1078)
- Modify: `talkmate-website/src/app/talkmate-home.css`

The home page is a server component with its own hardcoded cards. We reuse the same client components so they auto-revert.

- [ ] **Step 1: Import the sale components in page.tsx**

Add to the imports at the top of `talkmate-website/src/app/page.tsx`:

```tsx
import { EofyWas, EofyBadge } from '@/components/EofySale'
```

- [ ] **Step 2: Add the badge above the pricing section heading**

Immediately before the `<h2 className="section-title">Simple, monthly. ...` (line ~1028), add:

```tsx
            <div style={{ marginBottom: 12 }}><EofyBadge /></div>
```

- [ ] **Step 3: Add struck-through regular to each of the three cards**

For each card, insert `<EofyWas net={N} />` immediately before the `<strong>` inside `price-amount`. Starter (line ~1041), Growth (~1059), Pro (~1077):

```tsx
                <div className="price-amount"><EofyWas net={299} /><strong>$299</strong><span>/month</span></div>
```
```tsx
                <div className="price-amount"><EofyWas net={499} /><strong>$499</strong><span>/month</span></div>
```
```tsx
                <div className="price-amount"><EofyWas net={799} /><strong>$799</strong><span>/month</span></div>
```

- [ ] **Step 4: Add fallback CSS (so the inline-styled spans sit nicely)**

Append to `talkmate-website/src/app/talkmate-home.css`:

```css
/* EOFY sale display — struck-through regular price + badge spacing */
.price-amount .eofy-was { font-size: 0.6em; }
```

(`EofyWas`/`EofyBadge` carry their own inline styles; this only tunes scale inside `.price-amount`.)

- [ ] **Step 5: Verify build + typecheck**

Run: `cd talkmate-website && npx tsc --noEmit && npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add talkmate-website/src/app/page.tsx talkmate-website/src/app/talkmate-home.css
git commit -m "feat(website): EOFY strike-through + badge on home page pricing"
```

---

## Task 5: Portal EOFY sale helper (incl. proposal HTML transform)

**Files:**
- Create: `talkmate-portal/src/lib/eofy-sale.ts`
- Test: `talkmate-portal/src/lib/eofy-sale.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// talkmate-portal/src/lib/eofy-sale.test.ts
import assert from 'node:assert'
import { EOFY_SALE, isSaleActive, regularPrice, applyEofySaleToProposalHtml } from './eofy-sale'

assert.equal(regularPrice(299), 598)
assert.equal(EOFY_SALE.discountPercent, 50)
assert.equal(isSaleActive(new Date('2026-06-15T12:00:00+10:00')), true)
assert.equal(isSaleActive(new Date('2026-07-01T00:00:01+10:00')), false)

const sampleHtml = `
  <p class="plans-intro">All plans include full setup.</p>
  <div class="plan-card" data-plan="starter">
    <div class="plan-price">$299</div>
    <div class="plan-annual">or $2,990/yr · save $598</div>
  </div>`

// When active: struck-through regular injected + banner added.
const on = applyEofySaleToProposalHtml(sampleHtml, new Date('2026-06-15T12:00:00+10:00'))
assert.ok(on.includes('<div class="plan-was">$598</div>'), 'monthly was-price injected')
assert.ok(on.includes('class="eofy-banner"'), 'banner injected')
assert.ok(on.includes('$5,980'), 'annual was-price injected')

// When inactive: untouched.
const off = applyEofySaleToProposalHtml(sampleHtml, new Date('2026-07-02T00:00:00+10:00'))
assert.equal(off, sampleHtml)
console.log('eofy-sale (portal) ok')
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd talkmate-portal && npx tsx src/lib/eofy-sale.test.ts`
Expected: FAIL — `Cannot find module './eofy-sale'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// talkmate-portal/src/lib/eofy-sale.ts
// EOFY 50%-off sale — DISPLAY ONLY. Net price charged (pricing.ts / Stripe) is
// unchanged. "regular" = net × 2, shown struck through. isSaleActive() auto-reverts
// every surface after the end date with no deploy.

export const EOFY_SALE = {
  label: 'EOFY Sale',
  discountPercent: 50,
  regularMultiplier: 2,
  endsAt: new Date('2026-06-30T23:59:59+10:00'),
  badge: '50% OFF · EOFY SALE · ENDS JUNE 30',
} as const

export function isSaleActive(now: Date = new Date()): boolean {
  return now.getTime() <= EOFY_SALE.endsAt.getTime()
}

export function regularPrice(net: number): number {
  return net * EOFY_SALE.regularMultiplier
}

// Inject struck-through "regular" pricing into the static proposal HTML when the
// sale is active. Matches the hardcoded pricing cards in towing-proposal.html.
export function applyEofySaleToProposalHtml(html: string, now: Date = new Date()): string {
  if (!isSaleActive(now)) return html

  // 1. Prepend a struck-through regular monthly above each <div class="plan-price">$N</div>
  let out = html.replace(
    /<div class="plan-price">\$(\d{1,3}(?:,\d{3})*)<\/div>/g,
    (full: string, num: string) => {
      const net = Number(num.replace(/,/g, ''))
      const reg = regularPrice(net)
      return `<div class="plan-was">$${reg.toLocaleString('en-AU')}</div>${full}`
    },
  )

  // 2. Prepend a struck-through regular annual inside the plan-annual line.
  //    "or $2,990/yr · save $598" -> "or $5,980 $2,990/yr · save $598"
  out = out.replace(
    /<div class="plan-annual">or \$(\d{1,3}(?:,\d{3})*)\/yr/g,
    (full: string, num: string) => {
      const net = Number(num.replace(/,/g, ''))
      const reg = regularPrice(net)
      return `<div class="plan-annual">or <span class="plan-annual-was">$${reg.toLocaleString('en-AU')}</span> $${num}/yr`
    },
  )

  // 3. Add a sale banner immediately before the plans intro.
  out = out.replace(
    /<p class="plans-intro">/,
    `<p class="eofy-banner">${EOFY_SALE.badge}</p>\n      <p class="plans-intro">`,
  )

  return out
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd talkmate-portal && npx tsx src/lib/eofy-sale.test.ts`
Expected: PASS — prints `eofy-sale (portal) ok`.

- [ ] **Step 5: Commit**

```bash
git add talkmate-portal/src/lib/eofy-sale.ts talkmate-portal/src/lib/eofy-sale.test.ts
git commit -m "feat(portal): add EOFY sale helper + proposal HTML transform"
```

---

## Task 6: Portal — wire the transform into proposal send + template CSS

**Files:**
- Modify: `talkmate-portal/src/lib/proposal-send.ts` (after the `fillTemplate` call, ~line 110)
- Modify: `talkmate-portal/src/lib/proposal/templates/towing-proposal.html` (`<style>` near `.plan-price`, ~line 515)

- [ ] **Step 1: Add the CSS classes to the template**

In `towing-proposal.html`, find the `.plan-setup` style line (~515) and add immediately after it:

```css
    .plan-was { font-size: 11pt; color: #b0b8c4; text-decoration: line-through; margin-bottom: 1mm; }
    .pf .plan-was { color: rgba(255,255,255,0.45); }
    .plan-annual-was { text-decoration: line-through; opacity: 0.6; }
    .eofy-banner { display:inline-block; margin: 0 0 4mm; padding: 2mm 4mm; border-radius: 99px;
      background: rgba(232,98,42,0.12); border: 1px solid rgba(232,98,42,0.5);
      color: #E8622A; font-size: 8.5pt; font-weight: 800; letter-spacing: 0.4pt; }
```

- [ ] **Step 2: Import and apply the transform in proposal-send.ts**

Add to the imports near line 13 (`import { fillTemplate, featurePlan } from '@/lib/proposal/fill-template'`):

```ts
import { applyEofySaleToProposalHtml } from '@/lib/eofy-sale'
```

Then, immediately after the `proposalHtml = fillTemplate(proposalHtml, { … })` call completes (after its closing `)` near line ~150), add:

```ts
  // EOFY sale: inject struck-through regular pricing at send time (date-gated).
  proposalHtml = applyEofySaleToProposalHtml(proposalHtml)
```

(Place it after `fillTemplate` so token replacement runs first; the transform only touches the `plan-price`/`plan-annual`/`plans-intro` markup, which `fillTemplate` leaves intact.)

- [ ] **Step 3: Verify typecheck + build**

Run: `cd talkmate-portal && npx tsc --noEmit && npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add talkmate-portal/src/lib/proposal-send.ts talkmate-portal/src/lib/proposal/templates/towing-proposal.html
git commit -m "feat(portal): inject EOFY pricing into proposals at send time"
```

---

## Task 7: Portal — proposal form plan labels (rep leverage)

**Files:**
- Modify: `talkmate-portal/src/components/sales/QuickProposalForm.tsx` (plan radio label ~line 167)
- Modify: `talkmate-portal/src/components/sales/ProposalForm.tsx` (plan radio label ~line 162)

Both forms render `{opt.label} ${opt.price}/mo`. We add a struck-through regular before the net price when the sale is active.

- [ ] **Step 1: Import the helper in QuickProposalForm.tsx**

Add near the existing imports:

```tsx
import { isSaleActive, regularPrice } from '@/lib/eofy-sale'
```

- [ ] **Step 2: Compute sale state once inside the component**

Inside `QuickProposalForm()`, after the `useState` hooks, add:

```tsx
  const saleOn = isSaleActive()
```

- [ ] **Step 3: Update the radio label markup**

Replace the label span (~lines 167–174) with:

```tsx
              <span style={{ fontSize: 13, color: 'white', fontWeight: 700 }}>
                {opt.label}{' '}
                {saleOn && (
                  <span style={{ textDecoration: 'line-through', opacity: 0.5, marginRight: 4 }}>
                    ${regularPrice(opt.price).toLocaleString('en-AU')}
                  </span>
                )}
                ${opt.price}/mo
                {opt.recommended && (
                  <span style={{ marginLeft: 8, fontSize: 11, color: '#E8622A', fontWeight: 700 }}>
                    Recommended
                  </span>
                )}
              </span>
```

- [ ] **Step 4: Repeat Steps 1–3 for ProposalForm.tsx**

Apply the same import, the same `const saleOn = isSaleActive()` inside the component, and the same label-span change (its label markup at ~line 162 is identical: `{opt.label} ${opt.price}/mo`). Match the surrounding styles already present in that file.

- [ ] **Step 5: Verify typecheck + build**

Run: `cd talkmate-portal && npx tsc --noEmit && npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add talkmate-portal/src/components/sales/QuickProposalForm.tsx talkmate-portal/src/components/sales/ProposalForm.tsx
git commit -m "feat(portal): EOFY strike-through in proposal form plan labels"
```

---

## Task 8: Portal — training module copy

**Files:**
- Modify: `talkmate-portal/src/lib/training-modules.ts` (pricing content ~lines 207–280, 376)

Teach reps the EOFY framing while keeping "price is fixed at the EOFY rate — no further negotiation."

- [ ] **Step 1: Update the pricing intro (line ~207)**

Replace the `content` string at ~line 207:

```ts
        content: "EOFY SALE (ends 30 June): every plan is 50% off the regular price. Reps pitch the regular price, then the EOFY price. Regular Starter $598/mo → EOFY $299/mo. Regular Growth $998/mo → EOFY $499/mo. Regular Pro $1,598/mo → EOFY $799/mo. Each plan still has a one-off setup fee. No lock-in contracts. 14-day money-back guarantee."
```

- [ ] **Step 2: Update the pricing-rules content (line ~280)**

Replace the `content` string at ~line 280:

```ts
        content: "Every plan has a one-off setup fee: Starter $299, Growth $349, Pro $399 (setup fee is NOT discounted). There is no free trial. The offer is a 14-day money-back guarantee. EOFY SALE ends 30 June: the EOFY price is 50% off the regular price — Starter $299/mo (reg $598), Growth $499/mo (reg $998), Pro $799/mo (reg $1,598). Always frame the EOFY price as the deal that ends 30 June."
```

- [ ] **Step 3: Update the "pricing is fixed" content (line ~376)**

Replace the `content` string at ~line 376:

```ts
        content: "Pricing is fixed at the EOFY rate until 30 June: Starter $299/mo (reg $598, +$299 setup), Growth $499/mo (reg $998, +$349 setup), Pro $799/mo (reg $1,598, +$399 setup). The 50% EOFY discount IS the deal — no further negotiation, no custom deals below the EOFY price."
```

- [ ] **Step 4: Verify typecheck + build**

Run: `cd talkmate-portal && npx tsc --noEmit && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add talkmate-portal/src/lib/training-modules.ts
git commit -m "feat(portal): teach EOFY pricing framing in sales training"
```

---

## Task 9: Mobile EOFY sale helper

**Files:**
- Create: `talkmate-mobile/src/lib/eofy-sale.js`
- Test: `talkmate-mobile/src/lib/eofy-sale.test.js`

- [ ] **Step 1: Write the failing test**

```js
// talkmate-mobile/src/lib/eofy-sale.test.js
const assert = require('node:assert')
const { EOFY_SALE, isSaleActive, regularPrice } = require('./eofy-sale')

assert.equal(regularPrice(299), 598)
assert.equal(regularPrice(499), 998)
assert.equal(EOFY_SALE.discountPercent, 50)
assert.equal(isSaleActive(new Date('2026-06-15T12:00:00+10:00')), true)
assert.equal(isSaleActive(new Date('2026-07-01T00:00:01+10:00')), false)
console.log('eofy-sale (mobile) ok')
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd talkmate-mobile && node src/lib/eofy-sale.test.js`
Expected: FAIL — `Cannot find module './eofy-sale'`.

- [ ] **Step 3: Write minimal implementation**

```js
// talkmate-mobile/src/lib/eofy-sale.js
// EOFY 50%-off sale — DISPLAY ONLY. Net price (pricing.js) is unchanged.
// "regular" = net × 2. isSaleActive() auto-reverts after the end date.

const EOFY_SALE = {
  label: 'EOFY Sale',
  discountPercent: 50,
  regularMultiplier: 2,
  endsAt: new Date('2026-06-30T23:59:59+10:00'),
  badge: '50% OFF · EOFY SALE · ENDS JUNE 30',
};

function isSaleActive(now = new Date()) {
  return now.getTime() <= EOFY_SALE.endsAt.getTime();
}

function regularPrice(net) {
  return net * EOFY_SALE.regularMultiplier;
}

module.exports = { EOFY_SALE, isSaleActive, regularPrice };
```

> Note: if the mobile app uses ESM `import` elsewhere, mirror the `export` style used by `src/lib/pricing.js`. `pricing.js` uses `export const` — if so, convert this file to `export const EOFY_SALE = …; export function …` and change the test's `require` to a dynamic import or run with the project's test setup. Check `pricing.js`'s module style first and match it.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd talkmate-mobile && node src/lib/eofy-sale.test.js`
Expected: PASS — prints `eofy-sale (mobile) ok`.

- [ ] **Step 5: Commit**

```bash
git add talkmate-mobile/src/lib/eofy-sale.js talkmate-mobile/src/lib/eofy-sale.test.js
git commit -m "feat(mobile): add EOFY sale display helper"
```

> Correction note: `pricing.js` uses ESM `export const`. Before Step 3, open `talkmate-mobile/src/lib/pricing.js` and match its module syntax exactly (ESM `export`). Adjust the test import accordingly (`import` via a `.mjs` runner or the repo's existing test mechanism). The logic/values above are unchanged.

---

## Task 10: Mobile — training module copy

**Files:**
- Modify: `talkmate-mobile/src/data/trainingModules.js` (pricing content — mirror of portal `training-modules.ts`)

- [ ] **Step 1: Find the pricing strings**

Run: `cd talkmate-mobile && npx grep -n "299" src/data/trainingModules.js` (or use the editor search) to locate the pricing `content`/`price` fields (mirrors portal lines 207/280/376).

- [ ] **Step 2: Apply the same EOFY framing as Task 8**

Update the mobile pricing copy to match the portal training copy from Task 8 verbatim (regular vs EOFY prices, setup fee not discounted, EOFY price is the deal, ends 30 June). Keep any mobile-specific `price`/`setup` field shapes — only change the human-readable strings.

For any `price: "$299/mo"` style field, change to `price: "$299/mo (reg $598)"` for Starter, `"$499/mo (reg $998)"` for Growth, `"$799/mo (reg $1,598)"` for Pro. Leave `setup` fields unchanged.

- [ ] **Step 3: Sanity-check the file parses**

Run: `cd talkmate-mobile && node -e "require('./src/data/trainingModules.js'); console.log('parses ok')"`
Expected: prints `parses ok` (if it's ESM, run `node --input-type=module -e "import('./src/data/trainingModules.js').then(()=>console.log('parses ok'))"`).

- [ ] **Step 4: Commit**

```bash
git add talkmate-mobile/src/data/trainingModules.js
git commit -m "feat(mobile): teach EOFY pricing framing in sales training"
```

---

## Task 11: Full pipeline verification (per global CLAUDE.md)

No new code — this task runs the mandatory build pipeline gates across the repos that ship.

- [ ] **Step 1: Run all unit tests**

```bash
cd talkmate-website && npx tsx src/lib/eofy-sale.test.ts
cd ../talkmate-portal && npx tsx src/lib/eofy-sale.test.ts && npx tsx src/lib/proposal/roi.test.ts
cd ../talkmate-mobile && node src/lib/eofy-sale.test.js
```
Expected: each prints its `ok` line; `roi.test.ts` still prints `roi ok` (regression check — net unchanged).

- [ ] **Step 2: Typecheck + build website and portal**

```bash
cd talkmate-website && npx tsc --noEmit && npm run build
cd ../talkmate-portal && npx tsc --noEmit && npm run build
```
Expected: both PASS.

- [ ] **Step 3: QA in live browser (Playwright)**

Start each Next app (`npm run dev`) and verify on the changed pages:
- Website `/pricing` and home `/`: each card shows a struck-through doubled regular (`$598` / `$998` / `$1,598` monthly; `$5,980` / `$9,980` / `$15,980` annual) and the `50% OFF · EOFY SALE · ENDS JUNE 30` badge; the net price ($299/$499/$799) is the big number; **setup fee is NOT struck through**; annual still shows "2 months free" / "Save $X".
- Portal proposal forms (`/sales` Quick + Full proposal): plan radio labels show `~~$598~~ $299/mo` etc.
- Generate a proposal (send to the QA mailbox `testingtalkmate@gmail.com`) and confirm the PDF/email pricing cards show the struck-through regular + banner.
- Console clean; mobile viewport (375px) on website looks right.

- [ ] **Step 4: Revert sanity check**

Temporarily run the helper test with a post-EOFY date already covers this (Tasks 1/5/9 assert `isSaleActive(July) === false`). Confirm no surface hardcodes the sale outside `isSaleActive()` gating (grep each repo for `eofy` / `EOFY` and confirm every use routes through the helper).

- [ ] **Step 5: Report to Irfan**

Summarise: what shipped per repo, fix-loop count, validator result, QA result, reviewer GREEN/YELLOW/RED, and the ACCC was/now caveat already accepted. Then stop for approval before any merge to `main` / production deploy.

---

## Self-review notes

- **Spec coverage:** every surface in the spec maps to a task — website cards (T2–T4), proposal email/PDF (T5–T6), portal forms (T7), portal training (T8), mobile helper + training (T9–T10); auto-revert is built into `isSaleActive()` and asserted in T1/T5/T9; setup-fee-untouched and annual-"2 months free"-kept are verified in T11 QA.
- **Net price untouched:** no task edits `pricing.ts`, `pricing.js`, Stripe IDs, signup/checkout, or `roi.ts`; T11 re-runs `roi.test.ts` as a regression guard.
- **Type/name consistency:** `isSaleActive`, `regularPrice`, `EOFY_SALE`, `applyEofySaleToProposalHtml` are named identically wherever used; badge string is identical everywhere.
- **Known follow-up:** mobile module syntax (ESM vs CJS) must be matched to `pricing.js` at execution time (flagged in T9).
