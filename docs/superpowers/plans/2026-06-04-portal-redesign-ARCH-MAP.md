# TalkMate Portal Redesign — ARCH MAP (existing codebase, what to preserve)

> Companion to `2026-06-04-portal-redesign.md`. Read-only survey of the live app at `talkmate-portal/`.
> **The golden rule of this redesign: restyle the JSX/markup, NEVER touch the data-fetching blocks,
> Supabase calls, `business_id`/`client_id`/`assigned_to` filters, server/client split, or `force-dynamic`
> exports.** Those are load-bearing for auth, RLS, and tenant isolation.

---

## 1. Stack & current styling
- **Next.js 16.2.4 / React 19.2.4**, App Router. Route groups `(portal)`, plus `sales/`, `admin/`, `driver/`.
- **Tailwind CSS v4** (`@import "tailwindcss"` in `globals.css`; CSS-first `@theme`, NOT the legacy TS config —
  `tailwind.config.ts` is largely vestigial under v4, don't assume editing it changes anything).
- **shadcn ^4.3.0 generator on Base UI** (`@base-ui/react`, NOT Radix). `cva`, `clsx`, `tailwind-merge`,
  `cmdk`, `sonner` (toasts), `lucide-react`, `recharts ^3.8.1`, `@dnd-kit/*`, `maplibre-gl`,
  **`next-themes ^0.4.6` (installed but UNUSED — no provider, no toggle, app is permanently dark)**.
- **Styling reality:** `src/components/ui/*` shadcn primitives reference design tokens
  (`--background/--card/--primary/--border/--ring/--radius/--font-heading`) that **are not defined** in
  `globals.css`, so they currently resolve to nothing. **The app is styled almost entirely by inline
  `style={{}}` objects with hardcoded hexes** (`#061322`, `#071829`, `#E8622A`, `#4A9FE8`, …). A global
  re-skin = define the tokens (instantly restyles the minority that use `ui/*`) **plus** a file-by-file
  inline-style migration (the majority).
- **Fonts:** Outfit only, loaded 3 redundant ways (`<link>` in `layout.tsx`, `@import` in `globals.css`,
  TS config). No `next/font`. `'Outfit, sans-serif'` hardcoded in hundreds of inline styles.

## 2. App shells (THREE separate ones)
- **Root** `src/app/layout.tsx` (server): `<html lang="en-AU">`, font links, `globals.css`, bare `{children}`.
  No providers. ← **theme provider + DM fonts get added here.**
- **Client portal** `src/app/(portal)/layout.tsx` (server, async): auth gate (`createClient()` →
  `getUser()` → redirect `/login`); super-admin bypass; resolves `businesses` row; fetches plan/call
  counts/contacts/earnings/changelog; wraps in `BusinessTypeProvider`; renders **`PortalShell`** with banners
  (Impersonation/Trial/PendingPayment/TrialExpired).
  - `src/components/portal/portal-shell.tsx` (client) — flex container, `bg #061322`, hides chrome on
    `/onboarding`. Renders `<PortalSidebar>` + `<main>`(`<PortalTopbar>` + children).
  - `src/components/portal/sidebar.tsx` — **nav is a hardcoded `sections` array** (groups Overview/Your
    Agent/Receptionist/Dispatch/Assistant/Grow/Account) of `{href,label,icon,badge?,locked?,lockTag?,show}`.
    Visibility is prop-driven (plan, portalRole, industry, hasDispatch, hasPipeline, isAdmin). Active via
    `usePathname()`. Desktop `<aside>` 240px + mobile drawer from shared `sidebarBody`. Footer = "Current plan"
    card (`getPlan(plan)`, `$price/mo`, calls progress) + avatar + business name + email + Log out.
    **Restyle freely; do NOT change the `show`/`lockTag` gating or `pathname.startsWith(href+'/')` logic.**
  - `src/components/portal/topbar.tsx` — 60px sticky; title from hardcoded `PAGE_TITLES` map (keep in sync
    with routes); date, changelog (Sparkles), bell, avatar dropdown.
- **Sales portal** `src/app/sales/layout.tsx` (server): auth via `getSalesSessionUser()` +
  `getSalesRepByUserId()`; admins→`/admin`, non-reps→`/dashboard`; renders **`SalesShell`**
  (`src/components/sales/sales-shell.tsx`) with its OWN `SalesNav` + topbar + `SalesRepProvider`.
- **Admin** `src/app/(portal)/admin/layout.tsx` → `AdminSidebarLayout` (out of scope for these 12 screens,
  but shares visual language — keep consistent if cheap).

## 3. Shared components
- **shadcn/Base-UI primitives** `src/components/ui/`: button, card, badge, input, textarea, label, select,
  checkbox, radio-group, switch, tabs, table, dialog, alert-dialog, sheet, popover, dropdown-menu, tooltip,
  progress, avatar, calendar, command, input-group, separator, sonner. **Currently token-starved** — defining
  `@theme` tokens will light them up. Prefer extending these for the new primitives where they fit.
- **Feature components** (bespoke inline-styled): `src/components/portal/*` (agent-quality-card,
  receptionist-stats, sms-usage-card, locked-preview, service-pricing-editor, services-editor,
  quotes-log-view, pipeline-stage-widget, contextual-upsell, banners, changelog-drawer, nps-modal,
  plan-comparison), `src/components/sales/*` (sales-shell, sales-nav, leads-board, commissions-table, modals,
  NotificationBell, ProposalForm, contract-view), `src/components/admin/*`, `src/components/dispatch/*`.
- **Charts:** Recharts, with a hardcoded `COLORS` array (`#E8622A` …) in `analytics/page.tsx` — must be
  re-pointed to tokens. **Utility:** `cn()` in `src/lib/utils.ts` (`twMerge(clsx())`).

## 4. The 12 target pages
| # | Screen | Page file | S/C | Data source (PRESERVE) | Renders |
|---|--------|-----------|-----|------------------------|---------|
| 1 | Dashboard | `src/app/(portal)/dashboard/page.tsx` | Server | Supabase: `businesses`, `calls`(month), `jobs`(rev); `@/lib/roi`, `@/lib/dashboard-defaults`, `@/lib/legal-docs`, `getPlan` | `DashboardClient` (`./dashboard-client.tsx`), `SocialDashboardWidget` |
| 2 | Calls | `src/app/(portal)/calls/page.tsx` | Client | client Supabase `calls` (+ `intelligence_status/score/summary/flags/actions`) by businessId | `CallMessagesSection` |
| 3 | Bookings | `src/app/(portal)/bookings/page.tsx` | Server (thin, `force-dynamic`) | `businesses{id,name}` | `BookingsView` (`./bookings-view.tsx`) |
| 4 | Analytics | `src/app/(portal)/analytics/page.tsx` | Client | client Supabase `calls` by range, businessId from `useBusinessType()` | inline Recharts |
| 5 | SMS Activity | `src/app/(portal)/sms-activity/page.tsx` | Server (`force-dynamic`) | `businesses{id,plan,sms_used_this_month,sms_reset_at}`; Starter→upsell gate | `SmsActivityView` |
| 6 | Services/Catalog | `src/app/(portal)/catalog/page.tsx` | Client | client Supabase `catalog_items` (+ admin override path) | sheet/button/input/switch, `MenuImportBanner`, `SyncAgentButton` |
| 7 | AI Receptionist | `src/app/(portal)/train/page.tsx` (Server, `force-dynamic`) + `settings` AI tab | Server | `businesses{vapi_agent_id,kb_sync_status,…}` + `knowledge_base_entries` | `TrainView` (`./train-view.tsx`) |
| 8 | Customers | `src/app/(portal)/contacts/page.tsx` | Server (`force-dynamic`) | `contacts` by `client_id` (first 100) + `/api/contacts/list` paging | `ContactsListClient`, `DemoDataBanner` |
| 9 | Billing | `src/app/(portal)/billing/page.tsx` | Client | Stripe summary via API route; `getPlan`; add-ons | `PlanComparison` (**EOFY `isSaleActive()` renders here**) |
| 10 | Settings | `src/app/(portal)/settings/page.tsx` | Client | client Supabase `businesses`; hand-rolled tabs business/ai/automation/notifications/team/integrations | `ServicePricingEditor`, `ServiceAreaEditor`, `ServicesEditor`, `DivertInstructions`, `IntelligenceAlertSettings`, `SyncAgentButton` |
| 11 | Sales Dashboard | `src/app/sales/dashboard/page.tsx` | Server (`force-dynamic`) | `requireSalesRep()` → `leads`,`commissions` by `assigned_to=repId`; `@/lib/sales-format`, `@/lib/commission` | inline KPI cards + `MissingEmailBanner` |
| 12 | Sales Pipeline | `src/app/sales/leads/page.tsx` | Server (`force-dynamic`) | `leads` by `assigned_to=rep.id` | `LeadsBoard` (`@/components/sales/leads-board.tsx`) |

## 5. Conventions / helpers to preserve
- Supabase: `src/lib/supabase/server.ts` (`createClient()` SSR RLS-scoped, `createAdminClient()`
  service-role, `createBearerClient(jwt)`) and `src/lib/supabase/client.ts` (browser). Keep every call + filter.
- **EOFY:** `src/lib/eofy-sale.ts` — `EOFY_SALE` const, `isSaleActive(now?)`, `regularPrice(net)`,
  `applyEofySaleToProposalHtml`. Display-only, auto-reverts 30 Jun 2026. Used in `plan-comparison.tsx`,
  `ProposalForm`/`QuickProposalForm`, `proposal-send.ts`, `signup-client.tsx`. **Dashboard EOFY banner is a
  NEW insertion** — call `isSaleActive()` + render `EOFY_SALE.badge`.
- **Plans/pricing:** `src/lib/plan.ts` (`PLAN_CONFIG`, `getPlan`, drives sidebar plan card) and
  `src/lib/pricing.ts` (`PRICING` + Stripe price IDs, drives checkout). Preserve both.
- Loading/error states are inline (local `loading` boolean) — no `loading.tsx`/`error.tsx` in use.
- Contexts: `BusinessTypeProvider` (`src/context/business-type-context`), `SalesRepProvider`
  (`src/context/sales-rep-context`).

## 6. Re-skin hazards
1. Inline styles dominate → budget for per-file conversion, not a token swap.
2. Defining `@theme` tokens restyles the `ui/*` minority but most screens won't visibly change from tokens alone.
3. Three shells (client/sales/admin) each independently styled — client re-skin doesn't touch sales/admin.
4. Sidebar nav + topbar `PAGE_TITLES` are hardcoded; restyle but don't break gating/active-route logic.
5. `tailwind.config.ts` vestigial under v4 — theme truth lives in `globals.css` `@theme`.
6. No theme infra today → introduce ThemeProvider + token sets + refactor inline dark hexes.
7. Recharts carries its own palette — re-point to tokens.
8. Data wiring is per-page + tenant-scoped — treat fetch blocks as untouchable.
