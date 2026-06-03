# Portal Redesign — Progress Log

## ⚠️ IMPORTANT — isolated worktree (read first)
A **concurrent automated session** is working in the MAIN checkout
`C:\Users\info\.claude\WEBSITE BUILD\talkmate-portal` (building "Session 3A: Industry Intelligence Packs" +
ServiceM8 integration). It resets/rebases/branch-switches the shared working tree. To avoid corruption, ALL
redesign work now happens in an **isolated git worktree**:

- **Worktree dir:** `C:\Users\info\.claude\WEBSITE BUILD\_worktrees\portal-redesign`
- **Branch:** `feature/portal-ui-redesign` (clean, based off `8deb172` = dev tip at session start)
- The original `feature/portal-redesign` branch got contaminated with a foreign `d35f317 "Session 3A"` commit
  wedged between my commits; it is ABANDONED. My 4 commits were cherry-picked clean into the worktree branch.
- **All subagents must work from the worktree dir, never the main talkmate-portal dir.**
- Do NOT merge to main / deploy to prod — Irfan audits on return.

## Branch base & clean history
`8deb172` → d8bd039 (plan docs) → 2c72cf4 (foundation) → 3818d6c (primitives) → 17edc63 (controls) → …

| Task | Screen/Unit | Status | Notes |
|------|-------------|--------|-------|
| 0 | Plan docs | ✅ | d8bd039 |
| 1-3 | Theme foundation | ✅ | 2c72cf4 — build green, tsc clean |
| 4 | ui-v2: Panel, KpiCard, Tag, AiScoreBadge | ✅ | 3818d6c |
| 5 | ui-v2: SegmentedControl, Tabs, Chips, Switch, ButtonV2 | ✅ | 17edc63 |
| 6 | ui-v2: RevenueStrip, EofyBanner, UpsellBanner, StatusCard, StatsBar | ✅ | 79ea5c6 |
| 7 | ui-v2: CallRow, BookingRow, DataTable, DetailPanel, Kanban | ✅ | 667eb9c |
| 8 | ui-v2: charts (Recharts), Meter, Waveform | ✅ | 23db8ef |
| 9 | Restyle PortalSidebar | ✅ | 57a7357 — gating/active/auth logic verified unchanged via diff |
| 10 | Restyle PortalTopbar + Shell + ThemeToggle | ✅ | e2e87a0 — toggle live, logic preserved |
| 11 | Dashboard | ✅ | 35ab37f — EOFY banner wired; data gaps → backlog |
| 12 | Calls | ✅ | 4fcfb09 — real intelligence_* wired; AiScoreBadge now hides when no score |
| 13 | Bookings | ✅ | 7972089 — week calendar wired to real bookings; Month view = placeholder |
| 14 | Analytics | ✅ | a82f0d7 — heatmap derived from real created_at; Recharts→tokens |
| 15 | SMS Activity | ✅ | c852fce — plan-gate preserved; outbound-log (no fake inbound) |
| 16 | Services/Catalog | ✅ | ad866d3 — CRUD/sync/admin-override preserved |
| 17 | AI Receptionist | ✅ | 547281e — KB categories→tabs; voice/greeting live in Settings (omitted here) |
| 18 | Customers | ✅ | ab8a6c9 — added read-only /api/contacts/[id]/calls (auth-scoped to owner business) |
| 19 | Billing | ✅ | 51c3d09 — Stripe summary + PlanComparison/isSaleActive + cancel flow preserved |
| 20 | Settings | ✅ | a217bb8 — all 6 tabs + editors + save logic preserved |
| 21 | Restyle SalesShell | ✅ | be7b552 — providers/gating preserved, toggle added |
| 22 | Sales Dashboard | ✅ | cb24288 — server component, real sprint/aggregates |
| 23 | Sales Pipeline (kanban) | ✅ | d4df77a — LeadsBoard restyled, drawer/modal/filters preserved |
| 24 | Cleanup + final verification | ✅ | 4e76deb — empty AI scores hidden, legacy hexes→tokens; final build 195/195 + tsc clean. PR NOT opened (awaiting Irfan audit) |

## ✅ ALL 24 TASKS COMPLETE 2026-06-04
Whole plan built: Phase 0 theme foundation + Phase 1 ui-v2 library + Phase 2 client shell + Phase 3 all 10
client screens + Phase 4 sales shell & 2 screens + Phase 5 cleanup. **27 commits** on `feature/portal-ui-redesign`.
Final state: `npm run build` 195/195 pages ✓, `npx tsc --noEmit` clean ✓. Branch NOT pushed, no PR, no deploy —
awaiting Irfan's audit + Playwright testing.

### ⚠️ SCOPE CAVEAT — what this redesign does NOT cover (important for the audit)
The redesign restyled the **12 target screens + the 2 portal shells + the component library + theme system**.
It did NOT migrate every page/component in the portal. Still on OLD dark-only hardcoded styling:
- **Other portal pages** not in the 12: admin/*, dispatch/*, chatbot, command-centre, commands, vip-callers,
  callbacks, team, profile, onboarding, inbox, appointments, quotes, scheduler, social, refer-and-earn, etc.
- **Shared portal components** (`src/components/portal/*` used across all pages): changelog-drawer, nps-modal,
  plan-comparison internals, banners, onboarding-checklist, etc.
**Consequence:** In DARK mode everything looks consistent (old hardcoded navy ≈ new --bg). In **LIGHT mode**,
un-migrated pages/components will render dark-on-light and look broken until separately migrated. Full
light-mode correctness across the WHOLE portal is a follow-up effort beyond these 24 tasks.

### Remaining verification for the audit (NOT done here — deferred to Irfan per his plan)
- Live Playwright sweep of all 12 screens in BOTH themes at 1440px + 375px (build+tsc are green; runtime/visual
  not yet exercised). - Confirm data still renders correctly on each screen against real prod/preview data.
- Decide whether to push branch + open PR to `dev` (preview deploy) — not done autonomously.

### To resume (next session, after limit resets)
1. `cd "C:\Users\info\.claude\WEBSITE BUILD\_worktrees\portal-redesign"` (the isolated worktree — NOT the main talkmate-portal dir).
2. Confirm: `git branch --show-current` → `feature/portal-ui-redesign`; `git status` clean; `git log --oneline -5`.
3. Continue subagent-driven execution per the plan, one task each, build+tsc+commit per task. Keep subagents pinned to the worktree dir + branch (the concurrent "Session 3A/ServiceM8" session is still in the main checkout — stay isolated).
4. Task 10 implementer prompt was already drafted (restyle topbar.tsx + portal-shell.tsx, preserve PAGE_TITLES/changelog/notif/avatar-dropdown/onboarding-hide logic, add `<ThemeToggle/>` from `@/components/theme-toggle`).
5. Nothing pushed; do NOT merge to main / deploy. Irfan audits + tests on return.

## Polish / data-gap backlog (address in Task 24 + flag to Irfan)
- **Dashboard CallRow score:** dashboard passes `score={0}` → ensure it passes `undefined` so `AiScoreBadge` hides (recentCalls query has no intelligence join). Verify AiScoreBadge hides for 0 too.
- **Dashboard "Today's bookings":** replaced with an activity panel because the jobs query lacks per-job `scheduled_at`/`customer`. To get full mockup parity, extend the server query in `dashboard/page.tsx` to fetch today's jobs (time/customer/value) and use `BookingRow`.
- **Dashboard chart:** uses 14-day daily series (no hourly "Today"); escalated breakdown is 0 (not in data). Fine, but note.
- **Calls est. job value:** shows `—` (calls↔jobs FK not linked). Date filter is a visual pill only.
- **Customers:** new route `/api/contacts/[id]/calls` resolves business by `owner_user_id` only (invited staff would 404) and reads `contact_calls` table — verify table exists + consider staff access. Bookings/Value/Years stats omitted (no backing fields).
- **Catalog:** add/edit Sheet form still uses ShadCN ui/* styling (dark) — fine, could polish later.
- **Sales pipeline (leads-board):** plan prices inlined (starter 299/growth 499/pro 799) to avoid pulling `next/headers` into the client bundle — could drift from `@/lib/pricing`; consider a client-safe pricing constant.
- **Sales dashboard:** "MRR closed" is a proxy (commission×3); "demos this week" from last-10 leads may undercount — fine for now.
- **NotificationBell** (sales topbar) panel still navy in light mode — out of scope, theme later.
- **Merge note:** the concurrent Session 3 (ServiceM8) edits `settings/page.tsx` in the main checkout; this branch also rewrote `settings/page.tsx`. Expect a merge conflict there when both reach `dev` — resolve by hand.

## Decisions
- Per-task verify = `npm run build` + `npx tsc --noEmit` + controller review. Full dual-theme Playwright QA
  staged for Task 24 + Irfan's return audit.
- Skipping the `_kitchen-sink` route — primitives exercised by real screens.
- node_modules + .env.local provisioned in the worktree (npm ci done, baseline build green).
