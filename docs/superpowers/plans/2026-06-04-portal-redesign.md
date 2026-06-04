# TalkMate Portal Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.
> **Two companion docs are the source of truth — read them before any task:**
> - `2026-06-04-portal-redesign-DESIGN-SPEC.md` (the new visual system + per-screen breakdown)
> - `2026-06-04-portal-redesign-ARCH-MAP.md` (the existing code + what to preserve)
> The 12 mockup HTML files live at `_docs/portal-design-handoff/portal-design/project/portal/*.html` and are
> the pixel truth — open the relevant one for each screen task.

**Goal:** Re-skin the TalkMate client portal (10 screens) and Sales HQ (2 screens) into the new dark-first
"command-center" design system, with a working dark/light toggle, while preserving every existing data call,
auth gate, and tenant filter.

**Architecture:** Introduce a CSS-variable theme system (dark default + `.tm-light` overrides) mapped into
Tailwind v4 `@theme`, driven by the already-installed `next-themes`. Build a `ui-v2` primitive library that
encodes the design (Premium override block baked in). Then port each page file: keep the data-fetching block
untouched, replace the markup/inline-styles with `ui-v2` primitives + token utility classes.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind CSS v4, `next-themes`, shadcn/Base-UI primitives,
Recharts, `lucide-react`, `@dnd-kit`, DM Sans / DM Mono (via `next/font`).

**Process (from the repo's CLAUDE.md build pipeline — applies to EVERY task):** after implementing, run
`npm run build` and `npx tsc --noEmit` and fix all errors; VALIDATOR pass (no hardcoded data, data calls
intact, CLAUDE.md rules); QA in browser via Playwright at 1440px and 375px against the mockup; commit. Work on
branch `feature/portal-redesign` off `dev`; ship `dev`→`main` via PR only after the full set passes and Irfan
approves. There is no unit-test harness for visual components — the "test" for visual tasks is build + tsc +
visual parity with the mockup + console-clean.

**Branch setup (do once, before Task 1):**
```bash
cd "C:\Users\info\.claude\WEBSITE BUILD\talkmate-portal"
git checkout dev && git pull
git checkout -b feature/portal-redesign
```

---

## PHASE 0 — Theme Foundation

### Task 1: DM Sans / DM Mono fonts via next/font

**Files:**
- Create: `src/app/fonts.ts`
- Modify: `src/app/layout.tsx`
- Modify: `src/app/globals.css:1` (remove the Outfit `@import`)

- [ ] **Step 1: Create the font loader**

```ts
// src/app/fonts.ts
import { DM_Sans, DM_Mono } from 'next/font/google'

export const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
  variable: '--font-dm-sans',
  display: 'swap',
})

export const dmMono = DM_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-dm-mono',
  display: 'swap',
})
```

- [ ] **Step 2: Wire fonts into the root layout** (replace the `<head>` Outfit links; keep `metadata`)

```tsx
// src/app/layout.tsx
import type { Metadata } from 'next'
import './globals.css'
import { dmSans, dmMono } from './fonts'
import { ThemeProvider } from '@/components/theme-provider' // created in Task 3

export const metadata: Metadata = {
  title: { template: '%s — TalkMate', default: 'TalkMate Portal — AI Voice Agent Dashboard' },
  description: 'Manage your TalkMate AI voice agent. View calls, update settings, and grow your business.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-AU" className={`${dmSans.variable} ${dmMono.variable}`} suppressHydrationWarning>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  )
}
```

- [ ] **Step 3: Remove the Outfit `@import`** — delete line 1 of `src/app/globals.css` (the `@import url('...Outfit...')`). Leave `@import "tailwindcss";` as the new line 1.
- [ ] **Step 4: Verify** — `npx tsc --noEmit` (will still error on the not-yet-created `@/components/theme-provider`; that's expected until Task 3 — do Tasks 1→3 as a unit then build). Do NOT commit until Task 4.

### Task 2: Token system in globals.css (dark default + light overrides + Tailwind @theme)

**Files:** Modify `src/app/globals.css`

- [ ] **Step 1: Replace the `:root` block and body rule** with the full token system. Keep the existing
`--brand-*` vars (other code still references them) AND add the new design tokens. Add the `@theme` mapping
so `bg-card`/`text-dim`/`border-line`/`font-sans`/`font-mono` work and auto-switch.

```css
@import "tailwindcss";

/* ---- New design-system tokens (dark = default) ---- */
:root {
  --bg:#06101c;            --sidebar:#040c17;
  --card:#0d1b2a;          --card-2:#122234;
  --line:rgba(255,255,255,.055); --line-strong:rgba(255,255,255,.10);
  --text:#deeaf8;          --dim:#7a9ab8;   --faint:#4a6882;
  --orange:#f07832;        --orange-accent:#ee6a2c;
  --green:#2ec98a;         --green-soft:rgba(46,201,138,.13);
  --red:#f0625a;           --blue:#4a9fe8;  --gold:#f2b53c;
  --r:12px;

  /* legacy brand vars kept for un-migrated code */
  --brand-dark:#061322; --brand-navy:#0A1E38; --brand-orange:#E8622A;
  --brand-orange-hover:#C04A0F; --brand-blue:#1565C0; --brand-blue-light:#4A9FE8;
  --brand-muted:#4A7FBB; --brand-light:#F2F6FB; --sidebar-width:240px;
}

/* ---- Light theme (next-themes adds .tm-light on <html>) ---- */
.tm-light {
  --bg:#f0ebe0;            --sidebar:#e6dfd2;
  --card:#ffffff;          --card-2:#f4f0e8;
  --line:rgba(20,30,45,.10); --line-strong:rgba(20,30,45,.18);
  --text:#15202c;          --dim:#4e6070;   --faint:#8294a4;
  --green-soft:rgba(25,140,90,.13);
}

/* ---- Map tokens into Tailwind v4 ---- */
@theme inline {
  --color-bg: var(--bg);
  --color-sidebar: var(--sidebar);
  --color-card: var(--card);
  --color-card-2: var(--card-2);
  --color-line: var(--line);
  --color-line-strong: var(--line-strong);
  --color-text: var(--text);
  --color-dim: var(--dim);
  --color-faint: var(--faint);
  --color-orange: var(--orange);
  --color-orange-accent: var(--orange-accent);
  --color-green: var(--green);
  --color-red: var(--red);
  --color-blue: var(--blue);
  --color-gold: var(--gold);
  --font-sans: var(--font-dm-sans), system-ui, sans-serif;
  --font-mono: var(--font-dm-mono), monospace;
  --radius: var(--r);
}

* { box-sizing:border-box; margin:0; padding:0; }
html { scroll-behavior:smooth; }
body {
  font-family: var(--font-dm-sans), system-ui, sans-serif;
  background: var(--bg);
  color: var(--text);
  -webkit-font-smoothing: antialiased;
}
.mono { font-family: var(--font-dm-mono), monospace; font-variant-numeric: tabular-nums; }
.tnum { font-variant-numeric: tabular-nums; font-feature-settings:"tnum"; }

/* keep existing helpers */
.fade-in{opacity:0;transform:translateY(16px);transition:opacity .4s ease,transform .4s ease}
.fade-in.visible{opacity:1;transform:translateY(0)}
@keyframes upsell-pulse{0%,100%{opacity:1}50%{opacity:.35}}
.upsell-dot{width:8px;height:8px;border-radius:50%;background:var(--orange);animation:upsell-pulse 2s ease-in-out infinite;flex-shrink:0}

/* design-system keyframes */
@keyframes tm-pulse{0%{transform:scale(.6);opacity:.5}100%{transform:scale(2.2);opacity:0}}
@keyframes tm-wave{0%,100%{height:6px}50%{height:24px}}
```

- [ ] **Step 2: Verify** — visually confirm tokens compile (`npm run build`). No commit yet.

### Task 3: ThemeProvider (next-themes) + toggle component

**Files:**
- Create: `src/components/theme-provider.tsx`
- Create: `src/components/theme-toggle.tsx`

- [ ] **Step 1: Provider** — maps dark→`''`, light→`tm-light`, persists to `tm-theme`, default dark.

```tsx
// src/components/theme-provider.tsx
'use client'
import { ThemeProvider as NextThemes } from 'next-themes'

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemes
      attribute="class"
      defaultTheme="dark"
      storageKey="tm-theme"
      value={{ light: 'tm-light', dark: '' }}
      enableSystem={false}
      disableTransitionOnChange
    >
      {children}
    </NextThemes>
  )
}
```

- [ ] **Step 2: Toggle** — pill matching the mockup's Dark/Light switch (placed in topbars in later tasks).

```tsx
// src/components/theme-toggle.tsx
'use client'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return <div style={{ width: 72, height: 32 }} />
  const isLight = theme === 'light'
  return (
    <div className="flex items-center gap-0 rounded-full border border-line bg-card-2 p-[3px]">
      <button onClick={() => setTheme('dark')} aria-label="Dark mode"
        className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition ${!isLight ? 'bg-orange text-white' : 'text-dim'}`}>
        <Moon size={13} /> Dark
      </button>
      <button onClick={() => setTheme('light')} aria-label="Light mode"
        className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition ${isLight ? 'bg-white text-[#15202c]' : 'text-dim'}`}>
        <Sun size={13} /> Light
      </button>
    </div>
  )
}
```

- [ ] **Step 3: Verify + commit Phase 0** — `npm run build && npx tsc --noEmit` clean.

```bash
git add src/app/fonts.ts src/app/layout.tsx src/app/globals.css src/components/theme-provider.tsx src/components/theme-toggle.tsx
git commit -m "feat(portal): theme foundation — DM fonts, token system, dark/light provider + toggle"
```

---

## PHASE 1 — `ui-v2` Component Library

> Build under `src/components/portal/ui-v2/`. Each component bakes in the Premium override look
> (elevation shadow, tabular nums, no glow). Use token utilities (`bg-card`, `border-line`, `text-dim`).
> Use `cn()` from `@/lib/utils`. Reference DESIGN-SPEC §4 for the full catalogue and exact values.
> **Each component task = create file + a throwaway `/(portal)/_kitchen-sink` preview route entry to eyeball
> it, then build + tsc + commit.** (Delete the kitchen-sink route before the final PR.)

### Task 4: Primitives — Panel, KpiCard, Tag, AiScoreBadge

**Files:** Create `src/components/portal/ui-v2/panel.tsx`, `kpi-card.tsx`, `tag.tsx`, `ai-score-badge.tsx`

- [ ] **Step 1: Panel** (`.panel` + `.ph`)

```tsx
// src/components/portal/ui-v2/panel.tsx
import { cn } from '@/lib/utils'

export function Panel({ className, ...p }: React.ComponentProps<'div'>) {
  return <div className={cn('rounded-[var(--r)] border border-line bg-card p-[18px_20px] shadow-[0_1px_4px_rgba(0,0,0,.28)]', className)} {...p} />
}
export function PanelHeader({ title, meta, action, className }: { title: React.ReactNode; meta?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('mb-3.5 flex items-center justify-between', className)}>
      <h2 className="text-[15px] font-bold tracking-[-.2px] text-text">{title}</h2>
      {meta && <span className="text-xs text-dim">{meta}</span>}
      {action}
    </div>
  )
}
```

- [ ] **Step 2: KpiCard** (`.kpi`, accent `acc`/`ok`, trend `ctx`) — values use `.tnum`.

```tsx
// src/components/portal/ui-v2/kpi-card.tsx
import { cn } from '@/lib/utils'
type Trend = 'up' | 'down' | 'neutral'
export function KpiCard({ label, icon, value, sub, ctx, ctxTrend = 'up', accent }:
  { label: string; icon?: React.ReactNode; value: React.ReactNode; sub?: React.ReactNode; ctx?: React.ReactNode; ctxTrend?: Trend; accent?: 'orange' | 'green' }) {
  const valColor = accent === 'orange' ? 'text-orange' : accent === 'green' ? 'text-green' : 'text-text'
  const ctxColor = ctxTrend === 'up' ? 'text-green' : ctxTrend === 'down' ? 'text-red' : 'text-white/30'
  return (
    <div className="relative overflow-hidden rounded-[var(--r)] border border-line bg-card p-[17px_20px] shadow-[0_1px_4px_rgba(0,0,0,.28)]">
      <div className="flex items-center gap-[7px] text-[11.5px] font-semibold uppercase tracking-[.06em] text-dim">
        {icon}<span>{label}</span>
      </div>
      <div className={cn('tnum mt-[11px] text-4xl font-extrabold leading-none tracking-[-1.5px]', valColor)}>{value}</div>
      {sub && <div className="mt-1.5 flex items-center gap-1.5 text-[11.5px] text-dim">{sub}</div>}
      {ctx && <span className={cn('mt-1.5 block text-[11px]', ctxColor)}>{ctx}</span>}
    </div>
  )
}
```

- [ ] **Step 3: Tag** (all variants from DESIGN-SPEC §4) and **AiScoreBadge** (`score-hi/md/lo`).

```tsx
// src/components/portal/ui-v2/tag.tsx
import { cn } from '@/lib/utils'
const TAG = {
  book:'bg-green-soft text-green', quote:'bg-[rgba(238,106,44,.14)] text-orange',
  question:'bg-[rgba(91,155,217,.14)] text-blue', emergency:'bg-[rgba(240,98,90,.16)] text-red',
  missed:'bg-[rgba(240,98,90,.16)] text-red', transfer:'bg-[rgba(242,181,60,.14)] text-gold',
} as const
export function Tag({ variant, children, className }: { variant: keyof typeof TAG; children: React.ReactNode; className?: string }) {
  return <span className={cn('rounded-md px-2 py-0.5 text-[10.5px] font-bold tracking-[.02em]', TAG[variant], className)}>{children}</span>
}
```

```tsx
// src/components/portal/ui-v2/ai-score-badge.tsx
import { cn } from '@/lib/utils'
export function AiScoreBadge({ score, className }: { score: number; className?: string }) {
  const tier = score >= 8 ? 'bg-green-soft text-green' : score >= 6 ? 'bg-[rgba(242,181,60,.14)] text-gold' : 'bg-[rgba(240,98,90,.16)] text-red'
  return <span className={cn('inline-flex items-center gap-1 rounded-md px-[7px] py-0.5 text-[10.5px] font-bold', tier, className)}>{score}/10</span>
}
```

- [ ] **Step 4: Build + tsc + commit** — `git commit -m "feat(portal): ui-v2 primitives — Panel, KpiCard, Tag, AiScoreBadge"`

### Task 5: Controls — SegmentedControl, Tabs, Chips, Switch, Button

**Files:** Create `src/components/portal/ui-v2/segmented-control.tsx`, `tabs.tsx`, `chips.tsx`, `switch.tsx`, `button.tsx`
- [ ] Build each per DESIGN-SPEC §4 (seg: bg `--bg`, active `--card-2`; chips: orange-tint active; primary
  button: orange gradient `linear-gradient(135deg,#f58a42,#e86526)` + glow `0 4px 14px rgba(238,106,44,.35)`;
  Switch unifies catalog-green / receptionist-orange / settings-check via a `variant` prop). Prefer wrapping
  the existing `src/components/ui/switch.tsx` / `tabs.tsx` where the Base-UI primitive fits.
- [ ] Build + tsc + commit.

### Task 6: Banners & strips — RevenueStrip, EofyBanner, UpsellBanner, StatusCard, StatsBar

**Files:** Create `src/components/portal/ui-v2/revenue-strip.tsx`, `eofy-banner.tsx`, `upsell-banner.tsx`, `status-card.tsx`, `stats-bar.tsx`
- [ ] Build per DESIGN-SPEC §4 + the exact gradients in §6. `EofyBanner` accepts a `mode: 'strip' | 'hero'`
  prop (dashboard strip vs billing hero). `StatusCard` includes the animated waveform (40 bars, `tm-wave`
  keyframe). `UpsellBanner` reuses the existing `.upsell-dot` class.
- [ ] Build + tsc + commit.

### Task 7: Rows & lists — CallRow, BookingRow, DataTable, DetailPanel, KanbanBoard, KanbanCard

**Files:** Create `src/components/portal/ui-v2/call-row.tsx`, `booking-row.tsx`, `data-table.tsx`, `detail-panel.tsx`, `kanban.tsx`
- [ ] Build per DESIGN-SPEC §4/§5. `KanbanBoard`/`KanbanCard` should be drop-in restyle targets for the
  existing `LeadsBoard` (do NOT re-implement dnd; match its column/card data shape). `DataTable` is a generic
  grid-row table (customers). `DetailPanel` is the right-rail (customer/call detail).
- [ ] Build + tsc + commit.

### Task 8: Charts (Recharts, token-styled) — VolumeBarChart, LineVolumeChart, OutcomeBars, Heatmap, Meter, Waveform

**Files:** Create `src/components/portal/ui-v2/charts.tsx` (+ `meter.tsx`, `waveform.tsx`)
- [ ] Wrap Recharts with a token palette (`var(--orange)`, `var(--red)`, `var(--blue)`, `var(--green)`) instead
  of the hardcoded `COLORS` array. `VolumeBarChart` = stacked handled/escalated; `Heatmap` = 7×12 orange-alpha
  grid; `OutcomeBars` = horizontal % bars; `Meter` = usage gauge (orange-grad fill); `Waveform` = audio scrubber.
- [ ] Build + tsc + commit.

---

## PHASE 2 — Client Portal Shell

### Task 9: Restyle PortalSidebar to ui-v2

**Files:** Modify `src/components/portal/sidebar.tsx`
- [ ] **Preserve** the `sections` array structure, all `show`/`locked`/`lockTag` gating, the prop signature,
  the `usePathname()` active logic, the realtime SMS/admin badge subscriptions, and the mobile drawer.
  **Restyle only**: container → `bg-sidebar border-line`; brand → logo SVG (from
  `dashboard-command-center.html` lines ~180) + "Talk"+blue-300-weight "mate" wordmark; nav links → token
  classes, hover `bg-white/[.04]`, active = `bg-[rgba(240,120,50,.09)] text-text shadow-[inset_2px_0_0_var(--orange)] font-semibold`;
  `.badge` orange pill / `.nbadge` blue pill (DM Mono); footer plan card → `ui-v2` Panel styling. Map the
  existing nav groups to the canonical labels in DESIGN-SPEC §3b where they correspond.
- [ ] Build + tsc + Playwright QA (sidebar renders, all gated items still appear/hide correctly per plan, active
  route highlights, mobile drawer opens at 375px). Commit.

### Task 10: Restyle PortalTopbar + PortalShell, add ThemeToggle

**Files:** Modify `src/components/portal/topbar.tsx`, `src/components/portal/portal-shell.tsx`
- [ ] **Preserve** the `PAGE_TITLES` map, changelog/notification/avatar-dropdown behavior, the `/onboarding`
  chrome-hiding logic. **Restyle**: topbar → 68px, `border-b border-line`, token classes; add greeting subtitle
  support (used by dashboard); insert `<ThemeToggle />` in the right cluster; live pill (green-soft + pulsing
  `tm-pulse` dot); icon buttons (36px rounded-square, `bg-card border-line`). `PortalShell` container → `bg-bg`.
- [ ] Build + tsc + QA (toggle flips dark↔light and persists across reload via `tm-theme`; topbar title per
  route). Commit.

> **CHECKPOINT after Task 10:** the shell + tokens + toggle are live on every existing portal page (pages will
> look transitional — new chrome, old page bodies). Get Irfan's eyes on the shell + light/dark toggle before
> proceeding to per-screen work.

---

## PHASE 3 — Client Portal Screens (one task each)

> **Per-screen task template** (apply to Tasks 11–20):
> 1. Open the mockup (`_docs/portal-design-handoff/portal-design/project/portal/<file>.html`) and the existing
>    page + its child components (ARCH-MAP §4).
> 2. Keep the data-fetching block, Supabase calls, filters, server/client split, and `force-dynamic` exactly.
> 3. Replace the markup/inline-styles with `ui-v2` primitives + token classes to match the mockup
>    (DESIGN-SPEC §5.x). Fluidize fixed pixels (DESIGN-SPEC §3a).
> 4. `npm run build` + `npx tsc --noEmit` clean → Playwright QA at 1440px AND 375px against the mockup,
>    console clean, every button/filter/toggle works → commit `feat(portal): redesign <screen>`.

- [ ] **Task 11: Dashboard** — `(portal)/dashboard/page.tsx` + `dashboard-client.tsx`. Mockup
  `dashboard-command-center.html` (DESIGN-SPEC §5.1). NEW: wire EOFY strip via `isSaleActive()` + `EOFY_SALE`
  (ARCH-MAP §5). Compose RevenueStrip, 4 KpiCards, UpsellBanner, VolumeBarChart, CallRow list, StatusCard,
  BookingRow list. Keep `SocialDashboardWidget`.
- [ ] **Task 12: Calls** — `(portal)/calls/page.tsx` + `CallMessagesSection`. Mockup `calls.html`
  (§5.2). CallRow list (selectable) + detail (IntelPanel, transcript bubbles, Waveform player). Preserve the
  `intelligence_*` fields.
- [ ] **Task 13: Bookings** — `(portal)/bookings/page.tsx` + `bookings-view.tsx`. Mockup `bookings.html`
  (§5.3). Week calendar + day-detail rail. Fluidize `HOUR_H`.
- [ ] **Task 14: Analytics** — `(portal)/analytics/page.tsx`. Mockup `analytics.html` (§5.4). 5 KpiCards +
  LineVolumeChart + Top callers + OutcomeBars + Heatmap. Re-point Recharts `COLORS` to tokens.
- [ ] **Task 15: SMS Activity** — `(portal)/sms-activity/page.tsx` + `sms-activity-view.tsx`. Mockup
  `sms-activity.html` (§5.5). StatsBar + thread list + conversation + templates panel. Keep the Starter upsell gate.
- [ ] **Task 16: Services/Catalog** — `(portal)/catalog/page.tsx`. Mockup `catalog.html` (§5.6). Chips +
  service-card grid + sync panel. Keep `catalog_items` query, `SyncAgentButton`, `MenuImportBanner`, admin override path.
- [ ] **Task 17: AI Receptionist** — `(portal)/train/page.tsx` + `train-view.tsx` (and the Settings "AI" tab
  for voice/behavior). Mockup `receptionist.html` (§5.7). Voice cards + tone slider + response radios + hours
  grid + live-preview chat. Keep `vapi_agent_id`/`kb_sync_status`/`knowledge_base_entries` wiring.
- [ ] **Task 18: Customers** — `(portal)/contacts/page.tsx` + `contacts-list-client.tsx`. Mockup
  `customers.html` (§5.8). DataTable + DetailPanel + chips. Keep `/api/contacts/list` paging + `DemoDataBanner`.
- [ ] **Task 19: Billing** — `(portal)/billing/page.tsx` + `plan-comparison.tsx`. Mockup `billing.html`
  (§5.9). EofyBanner(hero) + PlanHero + usage Meter + payment card + next invoice + AddonCards + invoice table.
  Keep the Stripe-summary API fetch, `getPlan`, and the existing `isSaleActive()` rendering in `plan-comparison`.
- [ ] **Task 20: Settings** — `(portal)/settings/page.tsx`. Mockup `settings.html` (§5.10). SettingsSubnav +
  business-profile form (orange focus ring) + phone rows + NotifMatrix + save bar. Keep all editor child
  components and the `businesses` save logic. (Sub-routes `settings/routing|service-area|command|dispatch|security`
  inherit shell styling; restyle their bodies opportunistically, not required for this task.)

---

## PHASE 4 — Sales HQ (separate shell)

### Task 21: Restyle SalesShell (SalesNav + sales topbar)

**Files:** Modify `src/components/sales/sales-shell.tsx`, `src/components/sales/sales-nav.tsx`
- [ ] **Preserve** `SalesRepProvider`, `getSalesSessionUser`/`requireSalesRep` gating, `NotificationBell`,
  `CommissionPolicyModal`. **Restyle** to match the client shell + add the `.brand-sub` "Sales HQ" orange label
  and the Sales nav set (DESIGN-SPEC §3b). Add `<ThemeToggle />`. Footer avatar "JB" blue gradient.
- [ ] Build + tsc + QA. Commit.

### Task 22: Sales Dashboard

**Files:** `src/app/sales/dashboard/page.tsx`. Mockup `sales-dashboard.html` (§5.11).
- [ ] Keep `requireSalesRep()` + `leads`/`commissions` aggregates + `@/lib/sales-format`/`@/lib/commission`.
  Compose SprintHero (progress bar `linear-gradient(90deg,#4a9fe8,#f4843f)`), 4 KpiCards, PipelineMini,
  ActivityFeed, CommissionsCard (green gradient), QuickActions. Keep `MissingEmailBanner`.
- [ ] Build + tsc + QA at 1440/375. Commit.

### Task 23: Sales Pipeline (Kanban)

**Files:** `src/app/sales/leads/page.tsx` + `src/components/sales/leads-board.tsx`. Mockup `sales-leads.html` (§5.12).
- [ ] Keep `leads` query by `assigned_to`, `LEAD_STATUS_COLUMNS`, `LeadDrawer`, `AddLeadModal`, Grid/List
  toggle. Restyle `LeadsBoard` to the 6-column board + `.lcard` (hot/warm borders, won badge, dashed add-lead
  footers) using `ui-v2` Kanban. Add StatsBar (5 metrics) + filter selects.
- [ ] Build + tsc + QA. Commit.

---

## PHASE 5 — Finalize

### Task 24: Cleanup, full sweep, PR
- [ ] Delete the `_kitchen-sink` preview route. Grep for leftover hardcoded `#061322`/`#071829`/`Outfit`/`#E8622A`
  in the 12 touched pages + shells; migrate stragglers to tokens. Confirm `tailwind.config.ts` font/colors are
  not contradicting the new `@theme` (update or note as vestigial).
- [ ] Full `npm run build` + `npx tsc --noEmit` clean. Full Playwright sweep of all 12 screens in BOTH themes
  at 1440px and 375px; console clean on each. VALIDATOR + REVIEWER pass per CLAUDE.md (downstream risk to
  Vapi/Supabase/Stripe = none expected since data layer untouched — verify).
- [ ] Push branch, open PR `feature/portal-redesign` → `dev`. Report to Irfan: screens done, fix loops,
  validator/QA/reviewer verdicts. **Do NOT merge to `main` without explicit approval.**

---

## Self-Review notes
- **Spec coverage:** all 12 screens (Tasks 11–20, 22–23) + theme toggle (Tasks 2–3,10) + both shells
  (9–10, 21) + component catalogue (4–8) are covered. Dark+light both required → token system (Task 2) +
  provider (Task 3) + per-screen QA in both themes (Task 24).
- **Preservation guardrail** is repeated in every screen task: data block untouched.
- **Adaptation note:** visual components have no meaningful unit test; the repo has no test harness, and
  CLAUDE.md mandates a build→validate→Playwright-QA→review pipeline instead. Each task's verify step uses that
  pipeline rather than red-green TDD. This is a deliberate, user-instruction-aligned deviation from the
  skill's default TDD steps.
- **Type consistency:** `ui-v2` component names referenced in Phase 3/4 (KpiCard, Panel, Tag, AiScoreBadge,
  SegmentedControl, RevenueStrip, EofyBanner, UpsellBanner, StatusCard, StatsBar, CallRow, BookingRow,
  DataTable, DetailPanel, KanbanBoard/KanbanCard, VolumeBarChart, LineVolumeChart, OutcomeBars, Heatmap,
  Meter, Waveform) are all defined in Phase 1 (Tasks 4–8).
