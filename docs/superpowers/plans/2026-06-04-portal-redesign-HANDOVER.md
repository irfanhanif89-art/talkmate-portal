# TalkMate Portal Redesign — SESSION HANDOVER
**Written:** 2026-06-04 (context ran out; continue in a fresh session)
**Read this first, then `…-PROGRESS.md` (running log), `…-DESIGN-SPEC.md`, `…-ARCH-MAP.md`, the plan, and the
authoritative `C:\Users\info\Downloads\TalkMate Portal - Design Audit.md`.**

---

## 🚨 READ BEFORE TOUCHING ANYTHING

1. **Work in the WORKTREE, not the main repo:**
   `C:\Users\info\.claude\WEBSITE BUILD\_worktrees\portal-redesign`
   Branch: **`feature/portal-ui-redesign`**. The main checkout `…\talkmate-portal` is used by a **concurrent
   session** (Session 3/4A / ServiceM8 / Email). Do NOT edit, branch-switch, or `git add -A` there.
2. **Status:** the 12-screen redesign is DONE and has been **reconciled with dev** (merge `f6d50f1`). The branch
   is **0 behind / 40 ahead of `origin/dev`** — a future PR → dev will merge cleanly. Build **203/203 green**,
   `tsc` clean. **Nothing pushed / no PR / not deployed** — awaiting Irfan.
3. **Safety net:** `backup/portal-ui-redesign-premerge` ref = the pre-merge tip (2965abb).
4. **No agents** — Irfan asked that this build be done directly (no subagents) for the rest of the work.

## How to run / test
```
cd "C:\Users\info\.claude\WEBSITE BUILD\_worktrees\portal-redesign"
git status                      # should be clean; git log --oneline -3
npm run dev -- -p 3100          # node_modules + .env.local already provisioned (points at PREVIEW Supabase)
```
- Open **http://localhost:3100** and log in as the test BUSINESS OWNER (NOT admin — `hello@…` redirects to /admin):
  **`test-roadside@preview.local` / `AuditRedesign2026!`** (preview sandbox; safe).
- Toggle **Dark / Light** (top-right) and check BOTH themes on every screen.
- To view **Sales HQ**, recreate a temp sales rep in preview (SQL recipe is in `…-PROGRESS.md`; remember to delete it after).
- Verify every change with `npx tsc --noEmit` + `npm run build`. **Build passing does NOT catch runtime/theme
  bugs** — always open the browser (a `ThemeProvider` empty-class bug crashed every page but built fine).

---

## ✅ WHAT'S DONE
- **Theme foundation:** CSS-var tokens in `globals.css` (dark default + `.tm-light` overrides), mapped into
  Tailwind v4; `next-themes` provider + Dark/Light toggle; DM Sans/Mono via `next/font`.
- **`ui-v2` component library** (`src/components/portal/ui-v2/*`): KpiCard, Panel, Tag, AiScoreBadge,
  SegmentedControl, Tabs, Chips, Switch, ButtonV2, RevenueStrip, EofyBanner(removed from use), UpsellBanner,
  StatusCard, StatsBar, CallRow, BookingRow, DataTable, DetailPanel, Kanban, charts, Meter, Waveform.
- **Both shells** restyled (client `PortalSidebar`/`PortalTopbar`/`PortalShell`, and `SalesShell`/`SalesNav`).
- **All 12 screens** restyled to the new design + verified in both themes.
- **Design-audit alignment** (from the Downloads audit): sidebar rebuilt to the **10-item nav**
  (Dashboard · Calls · Bookings · Customers · Analytics · Engage → **CONFIGURE**: Services · AI Receptionist ·
  Billing · Settings) + conditional Dispatch/Command/White-Label; footer = avatar + name + plan only; dashboard
  decluttered (no onboarding banner/ROI hero/popups), revenue strip "Avg order lift +23%", chart Today/7/30,
  Receptionist rows (pickup/after-hours/voice/AI-score), greeting+search in topbar, sparkle removed.
- **Routes kept real, labels changed:** Customers→`/contacts`, Engage→`/sms-activity`, Services→`/catalog`,
  AI Receptionist→`/train`.
- **Orphaned features folded:** VIP Callers + Pipeline → Customers header; Callbacks → Calls; Jobs → Bookings;
  Profile + Security + Refer & Earn → topbar avatar menu; White Label → conditional sidebar.
- **EOFY removed from the portal** (kept on website/proposals/signup).
- **Reconciled with dev** (`f6d50f1`): settings = my redesign + your ServiceM8/Email cards; train-view = your
  full-functionality version (Call Flow + Industry Packs).

---

## 🔨 REMAINING WORK

### JOB 1 — Build the unified AI Receptionist hub (audit #21/#22)
Make **`/train`** (the "AI Receptionist" nav item) ONE tabbed page per the design:
**Voice & Personality · Greeting Script · FAQ Knowledge · Escalation Rules · Call Hours.**
- **Current state of `/train`:** after the merge it is dev's FULL-FUNCTIONALITY version (old styling): the KB
  editor with category sub-tabs + the **Call Flow tab (Session 4A)** + the **Industry Template card (Session 3A,
  `industry-template-card.tsx`)**. The redesign of this screen was intentionally dropped in the merge to preserve
  that functionality — it gets re-applied HERE.
- **The rebuild must:** restyle to the new design (ui-v2 + tokens, like the other screens) AND fold in /preserve:
  - **FAQ Knowledge** tab = the existing KB editor (`knowledge_base_entries`, `/api/knowledge-base*`, sync).
  - **Call Flow** content (keep the `CallFlowTab` component + `/api/onboarding/call-flow`).
  - **Industry Template card** (keep `IndustryTemplateCard`, shown when KB is sparse).
  - **Voice & Personality** = voice picker (`businesses.voice`; voices list is in `settings/page.tsx` ~line 44),
    tone slider + response style (store in `notifications_config`).
  - **Greeting Script** = `businesses.greeting` / `notifications_config.agent_answer_phrase` + a live preview.
  - **Escalation Rules** = `notifications_config.escalation_rules` + forward number (read-only).
  - **Call Hours** = `businesses.opening_hours` (7-day grid).
- **Server:** extend `train/page.tsx` (currently only fetches KB fields) to also load greeting/voice/agent_name/
  opening_hours/notifications_config. **Save patterns to mirror** are in `settings/page.tsx`:
  `saveBusiness()` (writes `businesses.voice` etc.), `saveAI()`/`syncAI()` (writes greeting + `notifications_config`),
  `previewVoice()` (`/api/voice/preview`). Both pages write the SAME fields → keep them consistent.
- **Note:** the design Settings page has NO "AI Voice Agent" tab — once the hub covers voice/greeting, consider
  removing the AI tab from Settings for full design alignment (currently still there, redundant).

### JOB 2 — Restyle the new dark Session 3/4A surfaces to the design (light-mode/token treatment)
These shipped "built dark" and look dark-on-light:
- Settings → Automation: `servicem8-card.tsx`, `email-responder-card.tsx`.
- `/train`: Call Flow tab + `industry-template-card.tsx` (resolved by Job 1's rebuild).
- **Email Inbox** (`/inbox`, the `EmailInbox` component), `servicem8-log`, and other Session 3/4A surfaces.
- **The rule (used throughout this redesign):** replace hardcoded `#0A1E38`/`#071829`/`#061322`/`#7BAED4`/
  `'Outfit'` and `rgba(255,255,255,…)`-on-dark with token utilities (`bg-card`/`bg-card-2`/`bg-bg`/`text-text`/
  `text-dim`/`text-faint`/`border-line`) so they auto-adapt. For surfaces that must stay dark in both themes, use
  the theme-adaptive classes `.tm-hero` / `.tm-hero-blue` / `.tm-status` (defined in `globals.css`).

## ❓ OPEN DECISIONS FOR IRFAN
- **Email Inbox nav home:** the design dropped "Inbox", but Email Inbox now ships at `/inbox`. Where does it go —
  fold Email into **Engage** (rename to SMS+Email?), under Customers, or restore an Inbox item? (The design's
  "Engage" was SMS-only.)
- Keep the conditional **Dispatch / Command Centre / White Label** sidebar items? (Currently kept, shown only when
  the business has them enabled.)
- Push the branch + open the PR to `dev`? (Not done yet.)

## ⚠️ HARD-WON LESSONS (don't repeat)
- **Always check BOTH themes in the browser.** Build/tsc green ≠ working. The `ThemeProvider` `dark:''` empty-class
  crashed every page at runtime but built fine.
- **Never put themed text on a hardcoded-dark background** → invisible in light mode (broke the billing plan hero,
  status card, sprint hero, revenue-strip labels). Make the bg theme-adaptive OR force fixed-light text.
- **Match the DESIGN, don't re-skin the old structure.** The first dashboard pass layered the design over the old
  page (ROI hero, onboarding banner, popups) and looked "completely wrong" vs the mockup. Rebuild the page body to
  the mockup, keep only the data wiring.
- **Stay isolated.** The concurrent session thrashed the shared working tree early on (branch-switching mid-build);
  the worktree is what keeps us safe.

## Key paths
- Worktree: `C:\Users\info\.claude\WEBSITE BUILD\_worktrees\portal-redesign`
- Plans/docs: `<worktree>\docs\superpowers\plans\2026-06-04-portal-redesign*.md`
- Design system: `src\app\globals.css` (tokens) · `src\components\portal\ui-v2\*` · `src\components\portal\{sidebar,topbar,portal-shell}.tsx`
- Audit (source of truth): `C:\Users\info\Downloads\TalkMate Portal - Design Audit.md`
