# TalkMate Portal — Deployment Handoff

**Build version:** Master Brief v1.0 + CRM Sessions 1-3 + Session 4 (Admin client management) + Session 5 (Industry service fields) + Session 6 (Trial mode + auto agent brief) + Session 8 (Self-serve signup) + Session 9 (Receptionist features) + Session 10 (Dispatcher system) + Hotfix 025 (Duplicate-owner DB guard) + Session 12 (Services fix + TalkMate Command) + Session 12b (Vapi webhook receiver fix) + Session 11 (Security foundations) + Session 13 (Admin portal parity + Sync Agent expansion) + Session 14 (Distance quoting engine + scheduler foundation) + Session 15 (Accounts, VIP bypass, native scheduler, Twilio SMS, waitlist, public holidays) + Session 16 (Locked preview pattern + scheduler route display) + Session 17B (Audit fixes -- create_booking sync, Make.com retirement, check_caller logging, dead handler removal) + Session 18 (Call Intelligence -- AI-scored call quality, alerts, SMS recovery) + Session 19 (SMS visibility + AI SMS verification) + Session 20 (Admin Go-Live Verification Checklist) + Hotfix 035 (sms_used_this_month counter not incrementing) + Session 21 (Sales HQ — rep portal, CRM pipeline, commissions, contract signing, admin sales team management) + Session 22 (Pricing overhaul — setup fees, annual billing, commission bonus, website + portal + Sales HQ)
**Repo:** [irfanhanif89-art/talkmate-portal](https://github.com/irfanhanif89-art/talkmate-portal)
**Target environment:** Vercel + Supabase (Sydney region recommended)

---

## SESSION 34 — Proxima White-Label Partner Demo (2026-05-23)

### Branch
`feature/session-34-proxima-demo` (from `dev`)

### What ships
1. **New public route — `/wl-preview/proxima/demo`.** Renders a Proxima-branded partner-portal preview for Monique. Subdomain gate at the top of the page calls `notFound()` for anything other than `proxima`, so `/wl-preview/foo/demo` returns 404 instead of serving Proxima's network masquerading as another partner. The route inherits the existing middleware bypass on `/wl-preview` (Session 27), so it is reachable anonymously.
2. **Static demo data — `src/lib/wl-demo-data.ts`.** Defines `DemoClient` / `DemoCall` interfaces, the `PROXIMA_DEMO` constant (4 sample sub-clients, 5 sample call rows, partner name + tagline), and `getProximaDemoStats()` which computes totals across all clients. The aggregate intentionally **includes the `setup`-status client** so Monique sees the full network potential ($524/mo royalty across 4 agents) rather than only live-paying agents ($449.25). The file has zero database calls — when TalkMate ships a real partner portal, replace this module with live queries.
3. **Demo dashboard layout — `src/app/wl-preview/[subdomain]/demo/page.tsx`.** Inline-styled (no Tailwind in `wl-preview` context). Brand tokens locked at the top of the file: navy `#1B4FBB`, dark navy `#0A1E38`, accent orange `#E8622A`, muted text `#94A3B8`. Sections:
   - **Header** with "P" navy monogram + "Proxima Agent" / "Partner Portal" labels and a green "Live Network" pill.
   - **Stats row** — CSS Grid with `repeat(auto-fit, minmax(180px, 1fr))` so the four cards reflow to 2 columns on tablet and stack on phone. Card 3 (Your Royalty) renders the value in accent orange — this is the headline metric for Monique.
   - **Agent cards** — one per `PROXIMA_DEMO.clients`. Live agents show calls / bookings / score / royalty in a `flexWrap: 'wrap'` row so the inner detail line wraps on narrow viewports instead of overflowing. The `setup`-status client (Northside Real Estate) omits the detail row and shows an orange "Setting up" badge instead of the green "Live" badge.
   - **Recent call activity** — 5 rows with outcome badges (`Booked` green, `Missed` red), score, and relative time.
   - **Partner earnings projection** — accent-tinted card with the current royalty plus 20-agent (~$2,500/mo) and 100-agent (~$12,500/mo) projections. Three projection cards use CSS Grid (not flex) so they stack vertically on phones.
4. **Login-page link to the demo.** `src/app/wl-preview/[subdomain]/page.tsx` gains a "View partner demo →" link below the disabled login button, gated on `subdomain === 'proxima'`. Other partners do not see the link. Placed inside the existing login card so it inherits its width and centering, above the Proxima-suppressed "Powered by TalkMate" footer.

### Routes that ship
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/wl-preview/proxima/demo` | none — middleware bypass | Proxima partner portal demo (static data; subdomain-gated 404 for any other slug) |

### Middleware
No change required. `src/middleware.ts:97-100` already short-circuits any request whose pathname starts with `/wl-preview` before the auth lookup runs.

### Database
No reads or writes against `bookings`, `calls`, `businesses`, or any client-data table. The only DB read in this code path is the existing `white_label_configs` lookup on the parent route — unchanged. No new migration.

### Demo URL
- Production: https://app.talkmate.com.au/wl-preview/proxima/demo
- Vercel preview: substitute the preview deployment host for the same path.

### Donna's smoke test
1. Open `/wl-preview/proxima/demo` in an incognito browser. Should load without any login redirect.
2. Confirm the header reads "Proxima Agent · Partner Portal" with a "P" navy monogram and a green "Live Network" pill.
3. Confirm "Powered by TalkMate" is **not** shown (`hide_talkmate_branding = true` on the row).
4. Stat cards: `4 / 3 live`, `$2,096 MRR`, **$524.00/mo royalty in accent orange**, `571 calls`.
5. Agent cards: Northside Real Estate shows the orange "Setting up" badge and **no detail row**; the other three show calls/bookings/score/royalty.
6. Open `/wl-preview/foo/demo` — should return a Next.js 404.
7. Open `/wl-preview/proxima` — login page intact, with a "View partner demo →" link below the disabled button. Click it and verify it routes to the demo.

### Future enhancement (deferred)
- Click-through from each agent card to a per-client mock detail page (call list, booking calendar, individual call transcripts). Out of scope for the Monique demo, which only needs the network overview.

### Build status
`npm run build` — clean. Compiled successfully, no TypeScript errors. The new route appears as `ƒ /wl-preview/[subdomain]/demo` alongside the existing `ƒ /wl-preview/[subdomain]`.

---

## SESSION 33 — Bookings Cleanup + Stripe Pagination (2026-05-23)

### Branch
`feature/session-33-bookings-cleanup` (from `dev`)

### What ships
1. **Legacy bookings column references removed (5 files, atomic with Migration 046).**
   - `src/lib/command-executor.ts` — `viewBookings()` selects `caller_name, truck_type, description, scheduled_start, status, created_at` and formats `scheduled_start` via `toLocaleString('en-AU')`. Display uses `truck_type.replace(/_/g, ' ')` (lowercase acceptable for Telegram admin command — `formatTruckLabel()` in `bookings-view.tsx` does the title-cased version for UI).
   - `src/app/(portal)/admin/clients/admin-feature-tabs.tsx` — `AdminBooking` interface drops `service_requested`, `preferred_date`, `preferred_time` and adds `truck_type`, `description`, `scheduled_start`. Both display blocks (pending + other) show `truck_type ?? description ?? '—'`; the pending row's date now formats `scheduled_start` only when present (no `'Not scheduled'` fallback — matches the existing conditional-render pattern). GET list route in `src/app/api/admin/businesses/[id]/bookings/route.ts` uses `select('*')` — no change needed; Postgres simply omits the dropped columns.
   - `src/app/api/admin/businesses/[id]/bookings/[bookingId]/route.ts` — `ALLOWED_FIELDS` whitelist no longer accepts `booking_type`, `service_requested`, `preferred_date`, `preferred_time`, `notes`. `actual_start`, `actual_end`, `no_show`, `cancellation_reason` retained (would otherwise break mark-complete, no-show flow, and cancellation reason capture). `sms_confirmation_sent` intentionally omitted from admin whitelist.
   - `src/app/api/portal/bookings/[id]/route.ts` — Same `ALLOWED_FIELDS` cleanup as the admin route.
   - `src/app/(portal)/bookings/bookings-view.tsx` — `Booking` interface drops the six legacy optional fields. `formatScheduled()` signature changed from `Pick<Booking, 'scheduled_start' | 'preferred_date' | 'preferred_time'>` to `(booking: Booking)` (the Pick would have failed compilation after the field removals). Single `scheduled_start` branch; returns `'Time TBC'` if null. `truckLabel` drops the `service_requested`/`booking_type` fallbacks (now `formatTruckLabel(b.truck_type) ?? '—'`). `hasNotesAction` checks `description` only. `ConfirmModal` time fallback preserved as `'the time discussed'` — no `null` render. `NotesModal` reads `description` only.

2. **Migration 046 — drop legacy bookings columns.**
   - File: `supabase/migrations/046_drop_legacy_bookings_columns.sql`.
   - Backfills `sms_confirmation_sent` from `confirmation_sms_sent` and `description` from `notes` (both idempotent — only update rows missing the modern value).
   - Drops six columns with `DROP COLUMN IF EXISTS` in a single `ALTER TABLE` (idempotent, safe to re-run): `confirmation_sms_sent`, `booking_type`, `service_requested`, `preferred_date`, `preferred_time`, `notes`.
   - **Pre-migration safety checks (documented as SQL comments for Donna):**
     1. `confirmation_sms_sent = true AND sms_confirmation_sent IS DISTINCT FROM true` should be 0.
     2. `preferred_date IS NOT NULL AND scheduled_start IS NULL` should be 0.
     3. `(service_requested OR booking_type) IS NOT NULL AND truck_type IS NULL AND description IS NULL` should be 0 — includes the `COALESCE` backfill statement to run if non-zero.
     4. `notes IS NOT NULL AND description IS NULL` should be 0.
   - For GM Towing and Spectrum Towing (the two live clients) every booking is agent-created post-Session-15 and already populates the modern columns; checks are expected to all return 0.

3. **L7 — Stripe pagination fix.** `src/app/api/cron/stripe-sync/route.ts` now wraps the existing per-subscription loop in a `do { ... } while (startingAfter)` that pages 100 at a time via `starting_after`. Loop body unchanged — verbatim copy into the new structure. Safety cap of `pageCount > 50` stops after 5,000 subscriptions in a single run.

### Migration application order

Parts 1 (code) and 2 (Migration 046) **must ship as a single atomic unit.** The legacy columns are still being read by old code paths; pushing the migration without the code update would 500 the Telegram command `view bookings` and the admin/portal bookings UI. Vercel's deploy pipeline gives the migration roughly 30–60 seconds after the code lands — within that window only a few requests are exposed. Donna applies the migration only **after** the deploy has gone green.

### Donna's run book
1. Pull `feature/session-33-bookings-cleanup`, verify the build (`npm run build`) — should be clean.
2. Merge into `dev`, push, wait for the Vercel preview to go green.
3. Run the four pre-migration SQL checks against production Supabase (each should return `0`).
4. If any check returns > 0, run the backfill statement in the comment above that check, re-run, confirm `0`.
5. Apply `046_drop_legacy_bookings_columns.sql` to production via the Supabase SQL editor or `mcp__supabase__apply_migration`. The migration is idempotent (`DROP COLUMN IF EXISTS`) and safe to re-run.
6. Smoke test: Telegram `/view bookings`, admin client modal Bookings tab, portal `/bookings` page (pending + confirmed + all tabs), create new booking via the New Booking modal, confirm SMS still sends.

### Migrations
- `046_drop_legacy_bookings_columns.sql`

### Build status
`npm run build` — clean. Compiled successfully, 146/146 pages generated, 0 TypeScript errors, no new warnings beyond the pre-existing "middleware → proxy" deprecation notice from Next 16.

### Known follow-up
- Proxima partnership demo still deferred pending timeline.

---

## SESSION 32 — Dashboard Fixes Bundle (2026-05-22)

### Branch
`feature/session-32-dashboard-fixes` (from `dev`)

### What ships
1. **M34 — Nurture column on Sales kanban.** `LEAD_STATUS_COLUMNS` in `src/lib/sales-format.ts` now includes `'nurture'` between `'lost'` and `'bad_lead'`. Leads moved to Nurture via the lead drawer no longer disappear from the board.
2. **M5 — Dashboard label fix.** Card now reads `Calls missed this month` (the underlying data was always `stats.missedMonth` — only the label was wrong).
3. **M8 — Missed-call over-count fixed.** `src/app/(portal)/dashboard/page.tsx` now selects `intelligence_status` and filters with the three terminal scored states (`'resolved' | 'review' | 'critical'`). In-progress calls (`intelligence_status IN ('pending', 'error')`) are no longer counted as missed. Filter requires both a finalised scoring status AND a sub-5-second duration for the null-outcome path.
4. **L5 — Annual ROI calculation.** `/billing` page now derives `totalPaid` from `biz.billing_cycle`. Annual subscribers ($2990/$4990/$7990 upfront) get years × annual price; monthly subscribers keep months × monthly price. New local var named `billingCycleForCalc` to avoid shadowing the `billingCycle` state at line 120.
5. **M35 — Commission paid email.** New `commissionPaidEmailHtml` template in `src/lib/sales-notify.ts` (mirrors the existing `commissionRevokedEmailHtml` structure, uses `emailWrap` + `escapeHtml`). `/api/admin/commissions/[id]` PATCH fires the email to the rep on `action === 'pay'`. Rep name + business name come from the existing `sales_reps` + `leads` JOIN — **no separate `businesses` table query** (there is no `business_name` column on `businesses`; it lives on `leads`).
6. **M6 — Help link in sidebar.** `<a href="mailto:hello@talkmate.com.au?subject=TalkMate%20Portal%20Help">` rendered as a one-off inside the sidebar `<nav>` below the section loop (so `mailto:` doesn't go through Next.js `<Link>`/`router.push`). Uses `HelpCircle` from `lucide-react`. Never highlights as active.
7. **L1 — Centralised hardcoded estimates.** New `src/lib/dashboard-defaults.ts` exports `INDUSTRY_AVG_UPSELL_PER_CALL = 6.20` and `INDUSTRY_AVG_CALL_VALUE = 85`. Five literal occurrences replaced across `dashboard-client.tsx`, `dashboard/page.tsx`, and `billing/page.tsx`. The `+$6.20` was a JSX string literal — replaced with a template expression; the `$85` cases were numeric literals and substituted directly.

### Migrations
None.

### Build status
`npm run build` — clean. 146/146 pages generated, 0 TypeScript errors.

### Known follow-up
- Legacy bookings column drop (Session 31 deferred item) remains open.
- Stripe pagination (L7) still uses default page size — not a problem at current scale.
- Proxima partnership demo still deferred pending scope.

---

## SESSION 31 — Bookings Cleanup + Legacy Removal (2026-05-22)

### Branch
`feature/session-31-bookings-cleanup` (from `dev`)

### What ships
1. **Backfill cron retired.** Both live Vapi agents (GM Towing `25443e10`, Spectrum Towing `8121a8b0`) verified by Donna in Session 30 to have the correct `serverUrl: /api/vapi/functions`. The one-shot `/api/cron/backfill-server-url` route is deleted; the entry is removed from `vercel.json`.
2. **Legacy Stripe checkout routes removed.** `/api/stripe/checkout/route.ts` and `/api/stripe/create-checkout-session/route.ts` had zero in-repo callers (verified via grep) and were superseded by `/api/stripe/embedded-checkout` (session) and the billing portal. Both deleted.
3. **Bookings page modernized.**
   - `Booking` interface rewritten with the modern schema (`scheduled_start`, `truck_type`, `description`, `pickup_address`, `dropoff_address`, `confirmation_ref`, `dispatcher_notified_at`, `sms_confirmation_sent`). Legacy fields (`booking_type`, `service_requested`, `preferred_date`, `preferred_time`, `notes`, `confirmation_sms_sent`) kept as optional fallbacks so old rows still render.
   - SMS flag references switched from the never-written `confirmation_sms_sent` to the modern `sms_confirmation_sent` in the optimistic update.
   - Date column now reads `scheduled_start` with title-cased formatting (`Mon, 1 Jun, 09:30`) and falls back to legacy `preferred_date`/`preferred_time` for old rows, or `Time TBC` if neither exists.
   - Service column now shows the formatted truck label (`Loaded tilt tray`, not `loaded_tilt_tray`) with fallback to legacy `service_requested`/`booking_type`. Route line (`pickup → dropoff`) renders underneath when either address exists.
   - REF badge appears next to the caller name when `confirmation_ref` is set (monospace, blue-tinted pill).
   - `ConfirmModal` SMS-preview line uses `scheduled_start` with a legacy date fallback.
   - `NotesModal` now sources from `description` first, then legacy `notes`.
4. **New Booking modal.** A `+ New Booking` button in the page header opens a modal that POSTs to the existing `/api/portal/bookings` endpoint. Fields: caller name, caller phone, truck type (dropdown — only the 3 enum values the endpoint accepts), pickup/dropoff addresses, scheduled date+time (`<input type="datetime-local">`), notes. On success the list reloads; on failure the error message surfaces in the toast. Inputs reuse the `ConfirmModal` palette (`#071829` background, `rgba(255,255,255,0.06)` border). No new API; the endpoint already handles optional SMS confirmation server-side. Built for Starter clients without scheduler access; usable by Growth/Pro too.

### Migrations
None. Legacy bookings column drop (`confirmation_sms_sent`, `booking_type`, `service_requested`, `preferred_date`, `preferred_time`, `notes`) deferred to Session 32 after a backfill migration is written.

### vercel.json
Removed the trailing `{ "path": "/api/cron/backfill-server-url", "schedule": "0 12 * * *" }` entry. Trailing comma on the previous (`expire-pending-payments`) entry removed to keep valid JSON.

### Build status
`npm run build` — clean. Turbopack reports 146/146 pages generated, 0 errors.

### Known follow-up (Session 32)
- Backfill any legacy `preferred_date`/`preferred_time`/`notes`/`service_requested`/`booking_type` into the modern columns, then DROP them. A migration file should be added once the backfill SQL is reviewed.

---

## SESSION 30 — Operational Fixes Bundle (2026-05-22)

### Branch
`feature/session-30-fixes` (from `dev`)

### What ships
1. **Sync routes write the correct `serverUrl`.** `/api/vapi/sync` and `/api/admin/vapi/sync` now point newly-stamped assistants at `/api/vapi/functions` (the live function endpoint), not the legacy `/api/webhooks/vapi`.
2. **One-shot backfill cron** at `/api/cron/backfill-server-url` walks every active/trial/pending/pending_payment business with a `vapi_agent_id`, reads the assistant from Vapi, and PATCHes `serverUrl` if it doesn't match. Idempotent — re-runs as `skipped`.
3. **Calls page no longer hangs on "Loading…"** when no Supabase user is present (sets `loading=false` in the early return).
4. **Comma-separated `ADMIN_EMAIL` / `INTERNAL_ALERT_EMAIL`** in the super-admin allowlist. Both env vars now `.split(',').map(trim+lower)`.
5. **Dollar-sign validator exception** for known plan prices (`$299`, `$499`, `$799` + 10× annual variants) — these no longer surface `DOLLAR_SIGN_IN_PROMPT` against pricing copy in agent prompts.
6. **Admin PATCH whitelist expanded:** all 7 valid `account_status` values (`active`, `pending`, `pending_payment`, `trial`, `expired`, `suspended`, `cancelled`) + new fields `billing_cycle`, `setup_fee_waived`, `setup_fee_amount`. Edit modal exposes them in a new "Billing cycle & setup fee" section on the Billing tab.
7. **SMS infrastructure-failure Telegram alerts.** `sendSMS` fires `sendAdminTelegram` on `twilio_error` / `config_missing` / `invalid_phone` (the three reasons that indicate something is broken, not a business-rule rejection). Plan-rule rejections (`plan_starter`, `plan_quota`) stay silent.
8. **Owner booking notification.** New SMS type `owner_booking_notification` + template + call site in `createBooking`. Gated on `notifications_config.alert_owner === true` + `owner_number`. Bypasses plan quota (operational alert).
9. **Welcome email moved to approve-agent.** Removed from `/api/onboarding/complete` (premature — agent wasn't live yet). Now fires from `/api/admin/approve-agent` after Twilio provisioning succeeds, **only when `failingChecks.length === 0`** (no override path).
10. **Impersonation route redirect mode.** `/api/admin/clients/[id]/impersonate?redirect=1&next=/path` now 302s to the magic-link view-as URL instead of returning JSON. 7 admin stub pages (bookings, callbacks, contacts, dispatch fallback, settings, settings/command fallback, settings/security) now redirect through impersonation into the real client portal pages.

### Migration 045
`045_session30_fixes.sql` — drops + re-creates `sms_log_sms_type_check` with 22 types (21 existing + `owner_booking_notification`).

### vercel.json
Adds the daily backfill cron: `{ "path": "/api/cron/backfill-server-url", "schedule": "0 12 * * *" }`.

### Cron cleanup (Session 31)
`/api/cron/backfill-server-url` is idempotent. After two consecutive runs return `fixed: 0`, **remove from `vercel.json` and delete the route in Session 31** — it has done its job.

### Env vars (no new ones)
- `ADMIN_EMAIL` / `INTERNAL_ALERT_EMAIL` now accept comma-separated lists. Existing single-email values continue to work.

### Behaviour summary
- Both live clients have `notifications_config.alert_owner = null` — owner SMS is silently skipped for them until they opt in.
- Twilio failures, missing config, or unparseable phone numbers now ping the admin Telegram chat in real time.
- Admin stubs (e.g. `/admin/clients/<id>/portal/bookings`) take Irfan straight into the client's actual `/bookings` page via magic link.

### Build status
`npm run build` — clean. `npx tsc --noEmit` — exit 0.

---

## SESSION 23 — Contractor Agreement Flow (2026-05-20)

End-to-end contractor onboarding lifecycle: admin invites a sales contractor,
the contractor signs the agreement electronically via a public link, a populated
PDF is generated server-side, stored in a private Supabase Storage bucket, and
emailed back through Make.com. Admin sees the contractor in a new
`/admin/contractors` tab, with full commission tracking, script acknowledgement
history, and termination flow. Sales scripts are version-controlled in a new
`/admin/sales-scripts` tab with single-active enforcement.

### Branch
Pushed to `feature/session-23-contractor-flow` (branched from `dev`). Vercel
will auto-build a preview on push.

### What ships

- **Migration 038** (`supabase/migrations/038_contractor_agreement_flow.sql`):
  5 new tables (`contractors`, `contractor_agreements`, `sales_scripts`,
  `script_acknowledgements`, `contractor_commissions`) plus indexes,
  `update_updated_at_column` re-creation (idempotent), and the
  `enforce_single_active_script` trigger so only one script can ever be active.
- **PDF generator** (`src/lib/generate-contractor-pdf.ts`): uses `pdf-lib` to
  load `/public/templates/contractor-agreement-template.pdf` if present, or
  fall back to a self-contained inline agreement. Always appends a signature
  page with the contractor's name, signed-at timestamp, IP, ABN, and script
  acknowledgement record.
- **Commission rate table** (`src/lib/contractor-commission.ts`): hardcoded
  server-side so commission amounts are never trusted from client input.
- **Webhook helpers** (`src/lib/contractor-webhooks.ts`): best-effort POSTs to
  the two Make.com scenarios - missing env vars or 5xx responses log a warning
  but never block the API response.
- **Public onboarding** (`/contractor-onboarding/[token]`): a 5-step flow
  (welcome -> review agreement with scroll-to-bottom gate -> details -> sign
  with required checkboxes -> confirmation). Sits at the app root so it is
  outside portal auth and accessible without login.
- **Public onboarding APIs** (`/api/contractor-onboarding/[token]/*`): verify
  token, save details, sign (generates + uploads PDF + creates agreement and
  acknowledgement rows).
- **Admin Contractors UI** (`/admin/contractors`): list with status badges and
  earned-commission rollup; detail page with profile, agreement status, script
  acknowledgements, commissions sub-table with status transitions, and a
  Danger Zone terminate flow.
- **Admin Sales Scripts UI** (`/admin/sales-scripts`): list with active/draft/
  superseded badges, editor modal for new versions, viewer modal, activate
  confirmation that warns the previous active version will be deactivated.
- **Admin APIs** (`/api/contractors/*`, `/api/sales-scripts/*`,
  `/api/contractor-commissions/*`): all gated by `requireAdmin()` and using
  the service role key (no RLS passthrough for contractor data, since the
  contractors themselves never authenticate against the portal).

### Manual steps before the flow works end-to-end

1. **Run migration 038** on preview (`rgifivtzmjvanzqwgadq`), verify the 5
   tables and 4 triggers, then run it on production.
2. **Create Supabase Storage bucket** named `contractor-agreements` on both
   preview and production. Set it to **private** (not public) - the API
   creates 365-day signed URLs for delivery.
3. **Upload the PDF template** to `/public/templates/contractor-agreement-template.pdf`.
   Source DOCX is `TalkMate_Sales_Contractor_Agreement_v2.docx`. Irfan to
   convert and commit. Until this lands the flow still works (fallback inline
   PDF generation).
4. **Build the two Make.com scenarios** (Donna):
   - **Scenario A: Contractor Invite Email** - webhook trigger, Resend
     branded email with `invite_url` CTA, link expires in 7 days.
   - **Scenario B: Contractor Signed PDF Delivery** - webhook trigger, HTTP
     GET to download the signed PDF, Resend to contractor with PDF attached,
     Resend copy to `irfanhanif89@gmail.com` with `[NEW CONTRACTOR SIGNED]`
     subject prefix.
5. **Add Vercel env vars** once Make.com URLs exist:
   - `CONTRACTOR_AGREEMENT_WEBHOOK_URL` (Scenario A)
   - `CONTRACTOR_SIGNED_PDF_WEBHOOK_URL` (Scenario B)
   - `NEXT_PUBLIC_APP_URL` should already be `https://app.talkmate.com.au` -
     verify, since it powers the invite link generation.

### Decisions made during the build

- **Admin route placement.** The brief specified Sales HQ
  (`/sales-hq/contractors`), but the existing portal puts admin tooling
  under `/admin/*` (`/admin/sales-team`, `/admin/clients`, etc.). To stay
  consistent with the live IA, the contractor and scripts admin UIs live at
  `/admin/contractors` and `/admin/sales-scripts`. Both are linked from the
  admin landing nav.
- **PDF template fallback.** If the template PDF is missing, the build does
  not fail and the signing flow still produces a meaningful signed PDF
  (self-contained inline agreement plus signature page). Once the branded
  template is uploaded, future signings will use it transparently.
- **Status lifecycle.** Contractors go `invited` -> `agreement_sent` on
  invite -> `active` on sign. `signed` is reserved as an intermediate value
  but the sign endpoint jumps straight to `active` since the PDF is already
  generated and stored.
- **Script editing.** Activated scripts cannot be edited via PATCH - admins
  must create a new version. This preserves the audit trail of what
  contractors actually acknowledged.
- **Commission amounts.** Hardcoded server-side in `contractor-commission.ts`.
  The Add Commission modal previews the amount but the server always recomputes
  from plan + billing cycle so a tampered request body cannot inflate payouts.
- **Storage URL strategy.** The DB stores the storage *path*, not a URL.
  Signed URLs are minted on demand: 365 days for the Scenario B email payload,
  24 hours for the admin "View signed PDF" button.

### Files added

```
supabase/migrations/038_contractor_agreement_flow.sql
src/lib/generate-contractor-pdf.ts
src/lib/contractor-commission.ts
src/lib/contractor-webhooks.ts
src/app/contractor-onboarding/[token]/page.tsx
src/app/contractor-onboarding/[token]/onboarding-client.tsx
src/app/api/contractor-onboarding/[token]/route.ts
src/app/api/contractor-onboarding/[token]/save-details/route.ts
src/app/api/contractor-onboarding/[token]/sign/route.ts
src/app/api/contractors/route.ts
src/app/api/contractors/invite/route.ts
src/app/api/contractors/[id]/route.ts
src/app/api/contractors/[id]/terminate/route.ts
src/app/api/sales-scripts/route.ts
src/app/api/sales-scripts/active/route.ts
src/app/api/sales-scripts/[id]/route.ts
src/app/api/sales-scripts/[id]/activate/route.ts
src/app/api/sales-scripts/[id]/acknowledge/route.ts
src/app/api/contractor-commissions/route.ts
src/app/api/contractor-commissions/[id]/clear/route.ts
src/app/api/contractor-commissions/[id]/clawback/route.ts
src/app/api/contractor-commissions/[id]/paid/route.ts
src/app/(portal)/admin/contractors/page.tsx
src/app/(portal)/admin/contractors/contractors-view.tsx
src/app/(portal)/admin/contractors/invite-contractor-modal.tsx
src/app/(portal)/admin/contractors/[id]/page.tsx
src/app/(portal)/admin/contractors/[id]/contractor-detail-view.tsx
src/app/(portal)/admin/sales-scripts/page.tsx
src/app/(portal)/admin/sales-scripts/scripts-view.tsx
```

### npm dependency

`pdf-lib@^1.17.1` added to `package.json`.

---

## SESSION 22B — Admin Quality Alerts (2026-05-20)

Admin (Irfan) now gets a Telegram ping the moment a call is scored as
worrying, and a daily digest every morning. Closes the internal quality
loop without exposing anything to clients.

### What ships

- **`src/lib/notifications.ts`** — new `notifyAdminOfQualityIssue()`.
  Fires a formatted Telegram message via `TELEGRAM_BOT_TOKEN` to
  `TELEGRAM_ADMIN_CHAT_ID`. Markdown-formatted with score emoji, flag
  chips, caller, summary, and a link to the admin calls view for that
  client. Wrapped in try/catch — never throws. Silent no-op when
  Telegram env vars are missing.
- **`src/lib/score-call-async.ts`** — wired in immediately after the
  intelligence persistence step. Trigger logic:
  - Fire when `duration >= 10s` AND (`score < 5` OR a critical flag is
    present OR `sms_verification.status === 'mismatch'`)
  - Suppress when the only flags are noisy ones (`short_call`,
    `no_resolution`)
  - Suppress when duration is under 10 seconds (silent caller / test
    call territory — Session 22 hotfix already handles those)
  - Critical flag set: `agent_error`, `sms_mismatch`, `missed_lead`,
    `dropped_call`, `wrong_info`
- **`src/app/api/cron/daily-quality-digest/route.ts`** — new endpoint.
  Pulls yesterday's scored calls (AEST day boundary), rolls them up by
  client, and posts one of three digest messages:
  - Empty day: "All quiet yesterday — no calls scored."
  - All scored 7+: "All clear — N calls scored, all above 7/10."
  - Otherwise: count, average, flagged count, per-client breakdown,
    lowest-scoring call with a portal link.
- **`vercel.json`** — `daily-quality-digest` registered at
  `0 22 * * *` (22:00 UTC = 08:00 AEST in Brisbane, no DST). Note:
  the brief asked for `0 8 * * *` but Vercel crons run in UTC, which
  would fire at 6pm AEST. Used `0 22 * * *` for the intended morning
  delivery.

### Required env vars (Vercel — all three environments)

| Var                       | Where               |
|---------------------------|---------------------|
| `TELEGRAM_BOT_TOKEN`      | Production, Preview, Development |
| `TELEGRAM_ADMIN_CHAT_ID`  | Production, Preview, Development |
| `CRON_SECRET`             | Already set — used by all cron routes |

If either Telegram var is missing the alerts silently no-op (no error
in logs, no broken scoring).

### Behaviour summary

- Quality alerts fire within ~60 seconds of a flagged call ending
  (the Vapi webhook kicks off scoring; once the Anthropic call
  returns, persistence + notify happen synchronously inside
  `scoreCallAsync`).
- Daily digest fires at 08:00 AEST. Confirm the cron appears in the
  Vercel dashboard after first deploy.
- Threshold for alerts: `score < 5 OR critical flag OR sms_mismatch`
  AND `duration >= 10s` AND not noisy-flags-only.
- Brief referenced a portal link at `/admin/clients/{id}/calls` but
  the actual route is `/admin/clients/{id}/portal/calls`. Both the
  per-call alert and the daily digest use the real path.

### Testing

1. Trigger a low-scoring call (or use the new
   `POST /api/admin/rescore-calls` endpoint with a low `max_score`).
2. Wait up to 10 minutes for the cron to rescore (immediate if the
   Vapi webhook scores it on first finish).
3. Confirm a Telegram message arrives at `TELEGRAM_ADMIN_CHAT_ID`.
4. Click the "Review transcript" link — should land on
   `/admin/clients/{businessId}/portal/calls`.

---

## HOTFIX (2026-05-20) — Call Intelligence scoring false-negatives

The Anthropic supervisor model was flagging the standard GM Towing
greeting ("GM Towing, how can I help? Just so you know, this call may
be recorded.") as a wrong-response, dragging legitimate calls down to
2–5/10 even when the agent behaved correctly. Same problem on silent
caller hang-ups and short calls where the caller dropped immediately.

### What changed

- **`src/lib/call-intelligence.ts`** — SYSTEM_PROMPT extended with two
  new calibration sections inserted before the existing rules:
  1. *KNOWN CORRECT BEHAVIOURS* — the greeting line, silent-caller
     handling, recording notice placement, and the mandatory account
     question are now explicitly listed as correct.
  2. *SMS VERIFICATION CALIBRATION* — under-15-second calls with no
     booking shouldn't be flagged as `sms_mismatch`; recovery SMS on
     short calls is correct behaviour.
- **`src/app/api/cron/score-pending-calls/route.ts`** — now also
  resets up to 5 false-negative candidates per tick (status in
  resolved/review/critical, score ≤ 4, scored within last 7 days,
  exactly one flag of type `short_call`) back to `intelligence_status
  = 'pending'` so the existing sweep rescores them with the new
  prompt. Response now includes `{ false_neg_reset: N }`.
- **`src/app/api/admin/rescore-calls/route.ts`** — new one-shot
  endpoint for ad-hoc rescores. Admin only (`requireAdmin`). Body:
  `{ days_back?: number, max_score?: number }` (defaults 7 and 4,
  bounds 1–90 and 1–10). Hard cap of 500 rows per call. Returns
  `{ reset_count, days_back, max_score }`. Calls reset go back through
  the regular cron — next tick is at most 10 minutes away
  (`vercel.json`).

Note: the brief refers to `intelligence_status = 'scored'`, but the
actual column stores `'pending' | 'error' | 'resolved' | 'review' |
'critical'`. "Scored" in this codebase means any of resolved/review/
critical; both new code paths use that interpretation.

### Manual step Donna must take

The GM Towing Vapi system prompt needs a small refresh to smooth the
account-question flow. That's a Vapi API change, not a portal code
change — see the separate Vapi brief.

### Build status

`npm run build` passes with zero TypeScript errors on
`feature/session-22-pricing`.

---

## SESSION 22 — Pricing Overhaul (2026-05-20)

Adds setup fees, annual billing, and a 2.5% annual commission bonus across the
website, client portal, admin, and Sales HQ. Migration `037_pricing_overhaul.sql`
adds `billing_cycle`, `setup_fee_waived`, `setup_fee_amount` to `businesses`,
`won_billing_cycle` to `leads`, and `bonus_amount` to `commissions`. All
additive — safe to re-run.

### Pricing reference (hardcoded server-side)

| Plan    | Monthly | Annual (10mo) | Annual savings | Setup fee | Monthly commission | Annual bonus | Annual total |
|---------|---------|---------------|----------------|-----------|--------------------|--------------|---------------|
| Starter | $299/mo | $2,990/yr     | $598           | $299      | $299               | $74.75       | $373.75       |
| Growth  | $499/mo | $4,990/yr     | $998           | $349      | $349               | $124.75      | $473.75       |
| Pro     | $799/mo | $7,990/yr     | $1,598         | $399      | $399               | $199.75      | $598.75       |

Annual bonus = annual price × 2.5%. Source of truth: `src/lib/commission.ts`
(COMMISSION_MAP) and `src/lib/pricing.ts` (PRICING). Never read commission or
price amounts from the client request body.

### What ships (portal)

- **Sales HQ Won modal**: live commission breakdown — base + bonus + total
  updates as plan and billing cycle change. Bonus only shows when annual.
- **`/api/sales/leads/[id]/won`**: accepts `billing_cycle`, computes bonus
  server-side from COMMISSION_MAP, inserts `commissions.bonus_amount` and
  records `leads.won_billing_cycle`.
- **`/sales/commissions` ledger**: Total column shows base + bonus breakdown,
  Billing pill (Monthly/Annual), CSV export includes base/bonus/total columns.
- **`/sales/commission-policy` modal (first login)**: Updated to show both
  monthly and annual rate cards plus "push annual" line.
- **`/admin/sales-team` Commissions tab**: Billing column, Total column with
  base+bonus breakdown, CSV export columns updated.
- **Admin Create Client modal**: Billing cycle toggle (monthly/annual) and
  setup fee waiver checkbox. Waiver is admin-only — written through the
  `requireAdmin()`-gated `/api/admin/clients/create` route. Sales reps have
  no path to call it.
- **Admin Clients list**: Two new columns — Billing (Monthly/Annual pill),
  Setup Fee ($ amount or "Waived").
- **`/subscribe`**: Monthly/Annual toggle above plan cards with "2 MONTHS
  FREE" badge. Each plan card shows the right price, savings badge in green
  when annual, and the one-off setup fee.
- **`/api/stripe/embedded-checkout`**: Accepts `billingCycle`, switches to
  the annual price ID when annual, and always appends the setup fee as a
  second line item unless `businesses.setup_fee_waived = true`. Saves the
  chosen cycle on the business row immediately so the dashboard reflects it.
- **Client `/billing` page**: Plan card now shows a Billing pill (Monthly
  vs. Annual) and a Setup Fee pill (paid amount, waived, or included).

### What ships (website)

- **PricingCards rewritten as a client component**: monthly/annual toggle,
  annual view shows the annual price prominently with savings badge and
  sparkle accent, "Best Value" badge on the Most Popular plan when annual,
  setup fee line under each price, subtle scale-up animation on toggle.
- **Setup fee explainer**: low-key grey card below cards explaining what
  the setup fee covers.
- **Annual upsell pill**: replaces the old "No setup fees on any plan. Ever."
  pill with "2 months free on annual plans".
- **Trust signals** changed: `No setup fees` → `Setup included`,
  `No lock-in` → `No lock-in contracts`.
- **Copy cleanup**: removed every "no setup fees" / "no setup fee" reference
  across `Hero.tsx`, `app/layout.tsx` (meta), `app/receptionist/[slug]/page.tsx`,
  `app/faq/page.tsx`, `app/pricing/page.tsx`, `app/terms/page.tsx`
  (clause 3.3 fully rewritten), and `app/blog/data/posts.ts`.

### Stripe products Donna must create

Six new Stripe products are required before the toggle is functional in
production. Until they exist the embedded checkout will return a clear
"Stripe price ID for X annual is not configured" error.

Three **subscription** prices (one per plan, billed yearly):

| Plan    | Price        | Env var                            |
|---------|--------------|------------------------------------|
| Starter | $2,990 AUD/y | `STRIPE_STARTER_ANNUAL_PRICE_ID`   |
| Growth  | $4,990 AUD/y | `STRIPE_GROWTH_ANNUAL_PRICE_ID`    |
| Pro     | $7,990 AUD/y | `STRIPE_PRO_ANNUAL_PRICE_ID`       |

Three **one-off** setup fee prices (one per plan):

| Plan    | Setup fee    | Env var                            |
|---------|--------------|------------------------------------|
| Starter | $299 AUD     | `STRIPE_STARTER_SETUP_PRICE_ID`    |
| Growth  | $349 AUD     | `STRIPE_GROWTH_SETUP_PRICE_ID`     |
| Pro     | $399 AUD     | `STRIPE_PRO_SETUP_PRICE_ID`        |

Add all six to Vercel env (preview + production). Existing monthly env
vars (`STRIPE_PRICE_STARTER`, `STRIPE_PRICE_GROWTH`, `STRIPE_PRICE_PROFESSIONAL`)
remain in use.

### Migration to run

Run `supabase/migrations/037_pricing_overhaul.sql` on preview Supabase
(`rgifivtzmjvanzqwgadq`) before testing. Production run after merge to main.

After running:
- `businesses` gains `billing_cycle` (CHECK monthly/annual, default monthly),
  `setup_fee_waived` (default false), `setup_fee_amount`
- `leads` gains `won_billing_cycle` (CHECK monthly/annual)
- `commissions` gains `bonus_amount` (default 0)
- `idx_businesses_billing_cycle` index created

### Deviations / notes

- The existing `/api/stripe/create-checkout-session` route was NOT updated.
  It's a legacy duplicate of `/api/stripe/embedded-checkout` and isn't called
  by the current subscribe flow. Update only if you bring it back into use.
- The `/api/admin/clients/create` route's existing per-plan price object
  (created at admin-create-client time) still bills monthly. The route writes
  the chosen `billing_cycle` to `businesses` so the value is correct in the
  database; the actual annual payment switch happens through the embedded
  checkout when the client later subscribes. If you want admin-created clients
  to start on an annual payment link, that's a follow-up — wire the route to
  use `STRIPE_*_ANNUAL_PRICE_ID` when `billing_cycle === 'annual'`.
- The `/signup` page (self-serve trial path) was NOT updated with a billing
  cycle toggle. Trial signups don't pay at signup time so the cycle is
  irrelevant until they convert. They land on `/subscribe` which has the
  toggle. If you want it earlier in the funnel, add it to `/signup`.
- Setup fee waiver is **admin only**. The waiver checkbox is in the admin
  client-create modal, and `/api/admin/clients/create` is gated by
  `requireAdmin()`. There is no path for a sales rep or self-serve signup
  to set `setup_fee_waived = true`.

### Build status

Both repos: `npm run build` passes with zero TypeScript errors.
Pre-existing `/icon` prerender error on website is unrelated to this session
(verified by stashing changes and rebuilding).

---

## SESSION 21 — Sales HQ (2026-05-20)

Full sales rep portal at `/sales/*` with admin management at `/admin/sales-team`.
Migration `036_sales_hq.sql` adds 6 tables (sales_teams, sales_reps, leads,
lead_activities, commissions, rep_contracts) plus `is_super_admin()` and
`current_rep_id()` helper functions, all with RLS enabled.

### What ships

- **Rep portal** (`/sales/*`): dashboard, kanban + list pipeline, lead drawer
  with activity log + autosave + status changes, won/lost/bad-lead flows,
  onboard-client flow (after admin approval), clients, commission ledger
  with CSV export, contract signing (typed-name with IP + UA capture),
  profile. Commission policy modal on first login (one-time acknowledgement).
- **Admin** (`/admin/sales-team`): three tabs — Reps (invite, contract upload,
  deactivate), Leads (approval queue, all-leads with filters + CSV, top-rep
  leaderboard), Commissions (approve/pay/revoke with CSV).
- **API**: `/api/sales/*` (gated by `requireSalesRep`), `/api/admin/sales-reps/*`,
  `/api/admin/leads/[id]/approve`, `/api/admin/commissions/[id]` (gated by
  `requireAdmin`).
- **Storage**: `rep-contracts` bucket, private, signed URLs only (1-hour
  expiry), policy restricts rep reads to their own folder.
- **Notifications**: Telegram on win submitted, bad lead flagged, contract
  signed (uses existing `TELEGRAM_BOT_TOKEN` / `TELEGRAM_ADMIN_CHAT_ID`).
  Resend emails for rep invite, contract ready, contract signed, deal
  approved, deal rejected, commission revoked, client welcome.

### Commission rates (hardcoded server-side)

| Plan    | Commission |
|---------|------------|
| Starter | $299       |
| Growth  | $349       |
| Pro     | $399       |

Source: `src/lib/commission.ts`. **Never read from the client request body.**
14-day clawback rule applies on cancellation — admin can revoke any
commission with a reason; the rep is emailed automatically.

### Deviations from the original brief

1. **`profiles` → `users`.** Brief specified adding `role` to a `profiles`
   table. This codebase uses `users` (Migration 001). To avoid colliding
   with the existing `users.role` values (`owner` / `admin` / `manager` /
   `staff`), we identify sales reps purely by presence in the `sales_reps`
   table — no role column required. Admin identification continues to use
   the existing email allowlist pattern, wrapped in `is_super_admin()`
   for use inside RLS policies.
2. **`businesses.owner_id` → `owner_user_id`.** Brief used the wrong column
   name; the actual column is `owner_user_id` (Migration 001).
3. **`businesses.account_status` for new clients.** Brief said `pending_setup`;
   the existing CHECK only allows `active|pending|suspended|cancelled`
   (extended elsewhere to add `trial|pending_payment|expired`). We use
   `pending` to stay inside the constraint and signal "not active yet."
4. **`businesses.onboarded_by`.** Migration 011 limited this to
   `self|admin|partner`. Migration 036 extends to add `sales_rep`.
5. **Kanban drag-and-drop is deferred.** The brief requested desktop
   HTML5 drag to move cards between columns. v1 ships with click-card →
   open-drawer → status-dropdown, which works on both desktop and mobile
   identically. Drag-to-move is queued for a follow-up; the dropdown UX
   is acceptable for v1 and avoids pulling in a drag library.
6. **CSV lead import is deferred.** Brief mentions `POST /api/admin/leads/import`
   but the admin UI specs do not include an import button. Punted to a
   follow-up. Admin can insert leads directly in Supabase for now.
7. **`sales_lead` role.** Reserved as an allowed value in the brief — not
   used since we don't store role on users. The team_lead concept can be
   reintroduced via a `is_team_lead` flag on `sales_reps` when needed.

### Migration to run on preview Supabase

Run `supabase/migrations/036_sales_hq.sql` against the preview project
`rgifivtzmjvanzqwgadq` (talkmate-preview, ap-southeast-2). It is fully
idempotent — safe to re-run.

After running:
- 6 new tables created
- `rep-contracts` storage bucket created
- `is_super_admin()` and `current_rep_id()` helper functions installed
- `businesses_onboarded_by_check` constraint widened to include `sales_rep`
- Default `sales_teams` row "TalkMate Sales" inserted

### Pre-flight: creating test reps

Sales reps cannot register themselves — admin invites them via
`/admin/sales-team` → Invite Rep. The flow:

1. Admin clicks Invite Rep, enters name + email + (optional) phone
2. Backend calls `supabase.auth.admin.inviteUserByEmail()` and inserts
   into `sales_reps` with `status='active'`
3. The rep receives Supabase's invite email + a backup Resend invite
4. On first login, rep is redirected to `/sales/dashboard` and shown the
   one-time commission policy modal
5. Admin uploads their contract PDF; rep signs from `/sales/contract`
   with a typed-name match against their `full_name`

### RLS verification before merge

The brief mandates two test rep accounts to verify data isolation. To
run:

1. Invite Rep A (test-rep-a@example.com) via the admin UI
2. Invite Rep B (test-rep-b@example.com)
3. Insert a sample lead assigned to Rep A
4. Sign in as Rep B and verify Rep A's lead does not appear in `/sales/leads`
5. Try hitting `/api/sales/leads/<rep-a-lead-id>` as Rep B — must return 404
6. Try `POST /api/admin/sales-reps/invite` as Rep B — must return 403
7. Confirm signed contract URLs expire after 1 hour
8. Deactivate Rep A from the admin UI and confirm Rep A cannot sign in

### Environment variables

No new env vars required for the build to compile — all existing keys
are reused:
- `TELEGRAM_BOT_TOKEN` + `TELEGRAM_ADMIN_CHAT_ID` (already in use for SMS alerts)
- `RESEND_API_KEY` (already in use)
- `INTERNAL_ALERT_EMAIL` (already in use, defaults to hello@talkmate.com.au)
- `SUPABASE_SERVICE_ROLE_KEY` (already in use)
- `NEXT_PUBLIC_PORTAL_URL` (optional; defaults to https://app.talkmate.com.au)

### Branch + push

Built on `feature/session-21-sales-hq` (branched from `dev`, which was
created from `main` per the brief). Donna merges to `dev` first for
preview review, then to `main` for production rollout.

---

## HOTFIX 035 — sms_used_this_month counter not incrementing (2026-05-19)

### Symptom

GM Towing had one `sms_log` row with `sms_type='other'`, `status='sent'`,
sent 2026-05-16. But `businesses.sms_used_this_month` was still 0. The
`'other'` type is NOT in `BYPASS_PLAN_LIMIT_TYPES`, so the counter
should have incremented.

### Root cause

The read-then-update pattern at the bottom of `sendSMS()` was
swallowing the `.update()` error silently:

```ts
await supabase
  .from('businesses')
  .update({ sms_used_this_month: used + 1 })
  .eq('id', opts.clientId)
```

No `error` check, no logging. Combined with `used = bizPost?.sms_used_this_month ?? 0`
treating null as 0, the counter could stay stuck at 0 indefinitely. None
of the four Supabase mutations inside `sendSMS` (rejected-log, failed-log,
sent-log, counter increment) checked their `error` return — every single
one could fail silently.

### Migration 035 (idempotent)

`supabase/migrations/035_sms_counter_fix.sql`:

1. **`increment_sms_used(p_client_id uuid)` RPC** — atomic, server-side
   `COALESCE(sms_used_this_month, 0) + 1` increment with self-healing
   null. Returns the new value (null if no row matched). Granted to
   service_role only.
2. **Backfill `sms_reset_at` where null** — set to the start of the
   current month so `ensureMonthlyReset()` doesn't double-reset.
3. **Backfill `sms_used_this_month`** — recount from `sms_log` for every
   business, including only `status='sent'` rows of non-bypass types
   sent since the business's `sms_reset_at`. Bypass types
   (`call_intelligence_alert`, `dropped_call_recovery`, `early_hangup_recovery`,
   `missed_lead_recovery`) are explicitly excluded — they correctly skip
   the counter and must not be backfilled into it.

### Code changes

`src/lib/sms.ts`:

- Replaced the read-then-update at the end of `sendSMS()` with
  `supabase.rpc('increment_sms_used', { p_client_id: opts.clientId })`.
  Single round trip, atomic, no race window, null source rows self-heal
  via the RPC's `COALESCE`.
- Added `console.error` on every Supabase mutation: the four `sms_log`
  inserts (rejected/plan, rejected/quota, failed, sent), the
  `ensureMonthlyReset` counter zero, and the new RPC call.
- The post-reset `bizPost` read now also logs on error and uses a
  stricter `typeof rawUsed === 'number'` check so a null source field
  never silently becomes `0`.
- Bypass logic (`BYPASS_PLAN_LIMIT_TYPES` for `call_intelligence_alert`,
  `dropped_call_recovery`, `early_hangup_recovery`, `missed_lead_recovery`)
  is unchanged. Those types still skip both the quota check AND the
  counter increment.

### Donna handoff after deployment

1. Run `035_sms_counter_fix.sql` in Supabase. The backfill is the same
   query above; it's safe to re-run.
2. Spot-check the backfill:
   ```sql
   select b.name, b.plan, b.sms_used_this_month, b.sms_reset_at,
          (select count(*) from sms_log s
            where s.client_id = b.id
              and s.status = 'sent'
              and s.sent_at >= b.sms_reset_at
              and s.sms_type not in (
                'call_intelligence_alert','dropped_call_recovery',
                'early_hangup_recovery','missed_lead_recovery'
              )) as recounted
   from businesses b
   order by b.created_at desc;
   ```
   `sms_used_this_month` should equal `recounted` for every row after
   the migration.
3. Trigger a test SMS to GM Towing through `/api/portal/sms/send`. The
   counter should now increment by exactly 1 and the Vercel function
   logs should be clean (no `[sms]` error lines).

---

## SESSION 20 — Admin Go-Live Verification Checklist (2026-05-19)

Admin-only per-client checklist that mixes 12 automated checks (recomputed
server-side on every read) and 12 manual confirmation items (Irfan ticks
after physically verifying each step). When every check passes, the
business is stamped `golive_verified = true` and a green badge appears
in the admin clients list.

### Brief vs reality

| Brief assumed | Actual |
|---|---|
| Admin gate is `user.email === process.env.ADMIN_EMAIL` | Uses `requireAdmin()` from `lib/admin-auth.ts` (checks `users.role === 'admin'` OR super-admin emails: `INTERNAL_ALERT_EMAIL`, `hello@talkmate.com.au`, `irfanhanif89@gmail.com`). No `ADMIN_EMAIL` env var exists. |
| `businesses.business_name` | `businesses.name` (mapped in the API response so the frontend still sees `business_name`) |
| `businesses.vapi_phone_number` | No such column. `check_vapi_phone_number` checks `agent_phone_number` (admin-set during onboarding) with `talkmate_number` as fallback. |
| `intelligence_alert_config.enabled === true` | Session 18 schema uses `alert_owner` + `owner_number`. The check is `alert_owner === true && owner_number is non-empty`. |
| `calls.intelligence_status === 'scored'` | Session 18 values are `resolved | review | critical | pending | error`. "Scored" means `intelligence_status IN ('resolved', 'review', 'critical')`. |
| `sms_log.status IN ('delivered', 'sent')` | No `delivered` state in our system; we use `sent`. Check is `status = 'sent'`. |

### Migration

Run `supabase/migrations/034_golive_checklist.sql`. Idempotent. Adds:

- `client_golive_checklist` — one row per business, 12 auto check booleans
  + 12 manual check booleans + `verified_at` + `verified_by` + `notes` +
  `unique(business_id)`. No RLS (service-role only). Brief seed runs
  inline at the bottom of the migration so the row exists for every
  current business after a single migration apply.
- `businesses.golive_verified` (boolean, default false) +
  `businesses.golive_verified_at` (timestamptz). These power the admin
  list badge so the badge doesn't require a checklist join on every list
  load.

### What changed

| Area | Files |
|---|---|
| **Auto-check engine.** `computeAutoChecks()` reads businesses + counts from calls/bookings/sms_log in parallel and returns a flat `Record<AutoCheckKey, boolean>`. Plain-English remediation hints live alongside the labels so the failed-items box can surface "what to fix" text without inline copy in the page. Starter plan auto-passes `check_intelligence_scored` per brief. | [src/lib/golive-checks.ts](src/lib/golive-checks.ts) |
| **API.** `GET /api/admin/golive-checklist/[businessId]` recomputes auto checks, upserts them, and returns the full checklist + pass counts + `isFullyVerified`. `PATCH` accepts a strict allow-list of `manual_*` keys + `notes`; after saving, recomputes auto checks and if everything passes, stamps `verified_at` + `verified_by` and flips `businesses.golive_verified`. `POST /reset` clears manual checks + the verified stamp (auto checks recompute on next GET). All three routes gate on `requireAdmin()`. | [src/app/api/admin/golive-checklist/[businessId]/route.ts](src/app/api/admin/golive-checklist/%5BbusinessId%5D/route.ts), [src/app/api/admin/golive-checklist/[businessId]/reset/route.ts](src/app/api/admin/golive-checklist/%5BbusinessId%5D/reset/route.ts) |
| **Page.** `/admin/clients/[clientId]/golive` is a server component that computes auto checks on render and hands a snapshot to a client component. Two-column grid: automated checks (with red failing-items summary box at the top) on the left, manual tickboxes + notes textarea on the right. Header shows overall badge (Verified / Partially complete / Not verified), progress bar, "Run Auto Checks" (router.refresh), and "Reset Checklist" (confirm dialog). When fully verified, a green banner reports who verified it and when. | [src/app/admin/clients/[clientId]/golive/page.tsx](src/app/admin/clients/%5BclientId%5D/golive/page.tsx), [src/app/admin/clients/[clientId]/golive/golive-view.tsx](src/app/admin/clients/%5BclientId%5D/golive/golive-view.tsx) |
| **Admin clients list.** New "Go-Live" column with a green "Verified" / red "Not Verified" badge that links to the per-client checklist page. | [src/app/(portal)/admin/clients/page.tsx](src/app/%28portal%29/admin/clients/page.tsx), [src/app/(portal)/admin/clients/admin-clients-view.tsx](src/app/%28portal%29/admin/clients/admin-clients-view.tsx), [src/app/(portal)/admin/clients/types.ts](src/app/%28portal%29/admin/clients/types.ts) |
| **Admin impersonation sidebar.** New "Go-Live" link in a dedicated Admin section at the bottom. Routes outside the `/portal/*` subtree to the sibling `/admin/clients/[id]/golive` URL. | [src/components/admin/admin-portal-shell.tsx](src/components/admin/admin-portal-shell.tsx) |

### Auto-check logic (12 items)

1. **`check_escalation_number`** — `businesses.escalation_number` matches `/^\+61\d{8,10}$/`.
2. **`check_notifications_config_match`** — `notifications_config.escalation_number === businesses.escalation_number` (exact string match).
3. **`check_intelligence_alert_config`** — `intelligence_alert_config.alert_owner === true` AND `owner_number` non-empty string.
4. **`check_vapi_agent_id`** — non-empty `vapi_agent_id`.
5. **`check_vapi_phone_number`** — non-empty `agent_phone_number` OR non-empty `talkmate_number`.
6. **`check_sms_reset_at`** — `sms_reset_at` is not null.
7. **`check_account_status`** — `account_status === 'active'`.
8. **`check_plan_set`** — plan in `('starter', 'growth', 'pro', 'professional')`.
9. **`check_first_call_logged`** — at least one call with `duration_seconds > 10`.
10. **`check_first_booking_created`** — at least one row in `bookings` for `client_id` (brief correctly notes bookings uses `client_id`).
11. **`check_first_sms_sent`** — at least one `sms_log` row with `status = 'sent'` (no `delivered` state in our system).
12. **`check_intelligence_scored`** — at least one call with `intelligence_status IN ('resolved', 'review', 'critical')`. Starter plan auto-passes.

### Donna handoff after deployment

1. Run `034_golive_checklist.sql` in Supabase. The migration already
   seeds a row for every current business, so step 2 from the brief
   ("seed existing clients") is unnecessary.
2. Open `/admin/clients` and confirm the new "Go-Live" column shows
   "Not Verified" for every business.
3. Open `/admin/clients/[id]/golive` for GM Towing. Confirm:
   - The 12 auto checks land with reasonable pass/fail values.
   - The failing-items summary box explains each failure in plain English.
   - Ticking a manual check saves instantly and the progress bar updates.
   - The "Reset Checklist" button clears manual checks and the verified stamp.
4. No new env vars.

---

## SESSION 19 — SMS Visibility + AI SMS Verification (2026-05-19)

Client-facing SMS visibility (reassuring, no flag/mismatch commentary) +
full admin SMS supervision (every flag, mismatch, failed delivery
visible) + Claude now verifies that the SMS we sent matches what the
call required.

### Brief vs reality

The brief described several pre-existing entities that don't match the
live schema (it predates Session 18). This implementation uses the real
column and type names:

| Brief assumed | Actual |
|---|---|
| `sms_log.business_id / recipient_phone / message_body / twilio_message_sid / created_at` | `client_id / to_phone / message / twilio_sid / sent_at` (migration 031) |
| `sms_type` values `intelligence_alert / intelligence_recovery / callback_reminder_sms / dispatch_confirmation` | `call_intelligence_alert / dropped_call_recovery / early_hangup_recovery / missed_lead_recovery` (migration 032) |
| `intelligence_flags` is `TEXT[]` | `jsonb` array of `{type, detail}` (migration 032) — `sms_mismatch` lands as a regular flag object |

### Migration

Run `supabase/migrations/033_sms_visibility.sql`. Idempotent. Adds:

- `sms_log.call_id` (uuid, references `calls(id)` on delete set null) +
  partial index on non-null `call_id`. Enables direct call→SMS linkage at
  send time; the 10-minute time-window join handles historical rows.
- `calls.sms_verification_status` (text, checked) + `sms_verification_note`
  (text). Status values: `correct | mismatch | no_sms | unverified | error`.
- `admin_sms_failures` view — service-role only, surfaces every failed
  send with the client name joined in.
- RLS on `sms_log` was already present from migration 031 — leaves it as-is.

### Required env var

`TELEGRAM_ADMIN_CHAT_ID` — Irfan's personal Telegram chat ID. Used by
`notifyAdminOfSmsFailure()` to route failed-SMS alerts to Irfan only,
never to clients. Without it the helper silently no-ops; admin UI still
surfaces failures via the SMS Failures page.

### What changed

| Area | Files |
|---|---|
| **SMS label library.** Plain-English `getSmsLabel()` for every sms_type, `ADMIN_ONLY_SMS_TYPES` filter set (currently `call_intelligence_alert`), coarse-grained `SMS_FILTER_BUCKETS` for the activity page filter tabs, AU phone formatter, client vs admin status presenters (client never sees "Failed"). | [src/lib/sms-labels.ts](src/lib/sms-labels.ts) |
| **AI SMS verification.** `scoreCall()` now accepts a `related_sms` list, the system prompt instructs the model to evaluate each SMS against the transcript and emit a `sms_verification` block, and the result coerces into a validated `{ status, note }`. New `sms_mismatch` flag type (auto-added if the model returns mismatch but forgets the flag). | [src/lib/call-intelligence.ts](src/lib/call-intelligence.ts) |
| **Orchestrator.** Before scoring, queries `sms_log` in the [call_end, call_end+10min] window, backfills `call_id` on unlinked rows, and passes the list into the scorer. After scoring, persists `sms_verification_status` + `sms_verification_note`. Calls `notifyAdminOfSmsFailure()` (fire-and-forget) when any window SMS has `status='failed'` or `status='rejected'`. | [src/lib/score-call-async.ts](src/lib/score-call-async.ts) |
| **Admin Telegram helper.** `notifyAdminOfSmsFailure()` sends a single Telegram message to `TELEGRAM_ADMIN_CHAT_ID` summarising the failure. Silent no-op when either env var is unset. Never throws. | [src/lib/notifications.ts](src/lib/notifications.ts) |
| **Dashboard SMS Usage card.** Self-fetches from `/api/dashboard/sms-usage`. Shows `used / cap` with a progress bar (amber 75%, red 90%) and the next reset date. Starter plan sees "SMS not included" with an upgrade CTA. Card links to `/sms-activity`. | [src/components/portal/sms-usage-card.tsx](src/components/portal/sms-usage-card.tsx), [src/app/api/dashboard/sms-usage/route.ts](src/app/api/dashboard/sms-usage/route.ts), [src/app/(portal)/dashboard/dashboard-client.tsx](src/app/%28portal%29/dashboard/dashboard-client.tsx) |
| **/sms-activity client page.** Server component reads sms_log for the calling client, strips admin-only types and never surfaces "Failed" status. Client view renders a month selector, filter buckets (All / Booking confirmations / Reminders / Missed call follow-ups / Waitlist / Cancellations), summary stats (total / delivered / pending), and a row-expand for long messages. Starter plan gets a dedicated upgrade page at the same URL — no SMS data shown. | [src/app/(portal)/sms-activity/page.tsx](src/app/%28portal%29/sms-activity/page.tsx), [src/app/(portal)/sms-activity/sms-activity-view.tsx](src/app/%28portal%29/sms-activity/sms-activity-view.tsx) |
| **Call detail modal — messages section.** `<CallMessagesSection callId>` self-fetches the call's linked messages and any in the 10-min window. Renders nothing when there are no client-visible messages; `call_intelligence_alert` (admin-only) is filtered server-side. Also filters `sms_mismatch` out of the client Agent Analysis flag chips. | [src/components/portal/call-messages-section.tsx](src/components/portal/call-messages-section.tsx), [src/app/api/portal/calls/[id]/messages/route.ts](src/app/api/portal/calls/%5Bid%5D/messages/route.ts), [src/app/(portal)/calls/page.tsx](src/app/%28portal%29/calls/page.tsx) |
| **Admin client list — SMS column.** New `SMS / Mo` column showing `used / cap` (amber at 75%, red at 90%, `0 / —` for Starter). | [src/app/(portal)/admin/clients/page.tsx](src/app/%28portal%29/admin/clients/page.tsx), [src/app/(portal)/admin/clients/admin-clients-view.tsx](src/app/%28portal%29/admin/clients/admin-clients-view.tsx), [src/app/(portal)/admin/clients/types.ts](src/app/%28portal%29/admin/clients/types.ts) |
| **Admin SMS Log per client.** New page at `/admin/clients/[clientId]/portal/sms-log` listing the full unfiltered SMS log: plain-English label + raw sms_type, full status (including red Failed rows), Twilio SID, full message body, error message, call link. Linked from the admin impersonation shell. | [src/app/admin/clients/[clientId]/portal/sms-log/page.tsx](src/app/admin/clients/%5BclientId%5D/portal/sms-log/page.tsx), [src/components/admin/admin-portal-shell.tsx](src/components/admin/admin-portal-shell.tsx) |
| **Admin calls — SMS verification dot + chip.** Admin impersonation calls view adds a dedicated SMS column (green tick / red mismatch / grey no-sms-or-unverified / orange error). `sms_mismatch` rows highlight the row red and display the verification note inline below the summary. `sms_mismatch` flag chip rendered in red (admin only — filtered out of the client modal). | [src/app/admin/clients/[clientId]/portal/calls/page.tsx](src/app/admin/clients/%5BclientId%5D/portal/calls/page.tsx) |
| **Admin SMS Failures.** New page at `/admin/sms-failures` reads from the `admin_sms_failures` view. Sidebar gets a red badge with the 24h failure count (driven by `/api/admin/sms-failures-count`). | [src/app/(portal)/admin/sms-failures/page.tsx](src/app/%28portal%29/admin/sms-failures/page.tsx), [src/app/api/admin/sms-failures-count/route.ts](src/app/api/admin/sms-failures-count/route.ts), [src/components/portal/sidebar.tsx](src/components/portal/sidebar.tsx) |
| **SMS Activity sidebar link.** Added under "Your Agent" below Contacts. Visible on all plans; non-paid plans see a `GROWTH` lock tag. Starter plan still reaches the page but lands on the upgrade view. | [src/components/portal/sidebar.tsx](src/components/portal/sidebar.tsx) |

### Client portal rules (enforced in code)

- Never render raw `sms_type` values — always `getSmsLabel()`.
- Never render `Failed` status — `clientSmsStatus()` collapses failed and
  rejected sends to `Pending` for client view.
- Never render `sms_mismatch` flag in client modal — filtered in
  `/calls/page.tsx`.
- Never include `call_intelligence_alert` in client SMS lists — filtered
  in the `/sms-activity` server component and the messages-after-call
  API route.

### Admin parity (enforced in code)

- `admin_sms_failures` view surfaces every failure with the client name
  joined in. Service-role only.
- Admin SMS Log shows raw sms_type alongside the plain label.
- Admin calls page renders `sms_mismatch` chip in red and shows
  `sms_verification_note` inline.
- Telegram alert fires to `TELEGRAM_ADMIN_CHAT_ID` on every failed send
  during the post-call SMS window.

### Donna handoff after deployment

1. Run `033_sms_visibility.sql` in Supabase SQL editor.
2. Confirm `sms_log.call_id` and `admin_sms_failures` exist.
3. Add `TELEGRAM_ADMIN_CHAT_ID` to Vercel (Production, Preview, Development).
   Get the value from Irfan.
4. Test: trigger a deliberate Twilio failure (invalid recipient number).
   Within seconds, Irfan's Telegram chat should receive an alert; the
   row should appear at `/admin/sms-failures`.
5. Test client view: log in as a Growth/Pro client; `/sms-activity`
   should load with the month + filter controls and no "Failed" rows.
6. Test admin view: open a recent call in `/admin/clients/[id]/portal/calls`
   and confirm the SMS verification dot + note are visible.

---

## SESSION 18 — Call Intelligence (2026-05-19)

AI-powered call quality supervisor. Every transcript scored by Claude
`claude-sonnet-4-6` the moment a call ends. Status dots, flagged filter,
and Agent Analysis panel surface results in the portal. Owner / dispatcher
get an SMS alert only when something needs attention. Dropped calls,
early hang-ups, and missed pricing enquiries trigger an automatic
caller-recovery SMS from the TalkMate Twilio number.

### Migration

Run `supabase/migrations/032_call_intelligence.sql`. Idempotent — safe to
re-run. Adds:

- `calls.intelligence_score` (int), `intelligence_status` (text, checked),
  `intelligence_summary` (text), `intelligence_flags` (jsonb),
  `intelligence_actions` (jsonb), `intelligence_scored_at` (timestamptz),
  `owner_alerted` (bool), `alert_reason` (text).
- Two indexes: `calls_intelligence_retry_idx` (partial, for the cron
  retry sweep) and `calls_intelligence_status_business_idx` (Flagged filter).
- `call_intelligence_log` table — one row per scoring attempt
  (success / failed / skipped) with model, tokens, and error message.
  RLS: clients see their own rows.
- `businesses.intelligence_alert_config` (jsonb) — per-client alert
  routing config: owner / dispatcher toggles + numbers + alert-type flags.
- `sms_log.sms_type` check constraint extended with four new types:
  `call_intelligence_alert`, `dropped_call_recovery`,
  `early_hangup_recovery`, `missed_lead_recovery`.

### Required env var

`ANTHROPIC_API_KEY` — Anthropic API key. Server-side only, no
`NEXT_PUBLIC_` prefix. Add to Vercel Production, Preview, and Development
before going live. Without it, scoring fails fast and logs
`intelligence_status = 'error'`; call save path is unaffected.

### What changed

| Area | Files |
|---|---|
| **Scoring service.** `scoreCall()` calls Anthropic Messages API (`claude-sonnet-4-6`, temp 0, max 800 tokens) with the system + user prompts from the brief. Parses + coerces JSON output, clamps score to 1-10, filters flags/actions to known types. Throws on HTTP error or malformed output; never logs the API key. | [src/lib/call-intelligence.ts](src/lib/call-intelligence.ts) |
| **Orchestration.** `scoreCallAsync()` loads call + business + active VIPs, calls `scoreCall`, persists results to `calls.intelligence_*`, logs to `call_intelligence_log`, fires alert SMS per the per-business routing config, and decides if a caller-recovery SMS should fire. Fully self-contained — catches every error and never throws. | [src/lib/score-call-async.ts](src/lib/score-call-async.ts) |
| **SMS service.** Added new `SmsType` values and a `BYPASS_PLAN_LIMIT_TYPES` set. Intelligence alerts and recovery SMS skip the plan/quota check and do not increment `sms_used_this_month`. Three new recovery templates: `templateDroppedCallRecovery`, `templateEarlyHangupRecovery`, `templateMissedLeadRecovery`. | [src/lib/sms.ts](src/lib/sms.ts) |
| **Webhook integration.** After the call save completes successfully, `scoreCallAsync()` is fired without `await` so the webhook returns immediately. Defensive `.catch` attached. | [src/app/api/webhooks/vapi/route.ts](src/app/api/webhooks/vapi/route.ts) |
| **Retry cron.** `/api/cron/score-pending-calls` runs every 10 minutes (`*/10 * * * *`). Finds up to 10 calls with `intelligence_status` in `('pending','error')`, created within the last 24h, with a non-null transcript — and re-runs `scoreCallAsync`. CRON_SECRET-gated. | [src/app/api/cron/score-pending-calls/route.ts](src/app/api/cron/score-pending-calls/route.ts), [vercel.json](vercel.json) |
| **Calls page.** New Status column with coloured dot + tooltip, Flagged + Critical filter tabs alongside the existing outcome filters, Agent Analysis panel in the transcript modal (flag chips, action buttons including `tel:` callback, "Owner alerted via SMS" indicator), intelligence summary shown in place of the Vapi summary when present, dedicated empty state for the Flagged filters. | [src/app/(portal)/calls/page.tsx](src/app/%28portal%29/calls/page.tsx) |
| **Dashboard.** New Agent Quality card alongside the existing stat cards. Shows last-7d average score, trend arrow vs prior 7d, and either "All clear today" or "N flagged today →" linking to `/calls?filter=flagged`. Self-fetches from `/api/dashboard/agent-quality`. | [src/components/portal/agent-quality-card.tsx](src/components/portal/agent-quality-card.tsx), [src/app/api/dashboard/agent-quality/route.ts](src/app/api/dashboard/agent-quality/route.ts), [src/app/(portal)/dashboard/dashboard-client.tsx](src/app/%28portal%29/dashboard/dashboard-client.tsx) |
| **Settings (client).** "Call Intelligence Alerts" section added to the Notifications tab. Toggles for owner alert + dispatcher alert + per-type flags (warm lead, missed lead, VIP failure, agent promise, dropped call). Owner number pre-fills from `escalation_number`. Self-fetches from `/api/portal/settings/intelligence-alerts` and PATCHes the same. Strict allow-list on writable keys server-side. | [src/components/portal/intelligence-alert-settings.tsx](src/components/portal/intelligence-alert-settings.tsx), [src/app/api/portal/settings/intelligence-alerts/route.ts](src/app/api/portal/settings/intelligence-alerts/route.ts), [src/app/(portal)/settings/page.tsx](src/app/%28portal%29/settings/page.tsx) |
| **Admin parity.** Admin client list shows a quality indicator dot next to each business name (green ≥8 last 7d, yellow 5-7, red <5 or any critical today, grey for no scored calls yet). Admin impersonation calls view shows the same dots + Agent Analysis chips + per-call score column. Admin impersonation settings page mounts the same `IntelligenceAlertSettings` component pointed at `/api/admin/businesses/[id]/intelligence-alerts` so Irfan can configure alerts on behalf of a client. | [src/app/(portal)/admin/clients/page.tsx](src/app/%28portal%29/admin/clients/page.tsx), [src/app/(portal)/admin/clients/admin-clients-view.tsx](src/app/%28portal%29/admin/clients/admin-clients-view.tsx), [src/app/admin/clients/[clientId]/portal/calls/page.tsx](src/app/admin/clients/%5BclientId%5D/portal/calls/page.tsx), [src/app/admin/clients/[clientId]/portal/settings/page.tsx](src/app/admin/clients/%5BclientId%5D/portal/settings/page.tsx), [src/app/api/admin/businesses/[id]/intelligence-alerts/route.ts](src/app/api/admin/businesses/%5Bid%5D/intelligence-alerts/route.ts) |

### Alert routing rules

`scoreCallAsync()` only sends an alert SMS when ALL of the following hold:

1. The model set `should_alert_owner: true` (system prompt enforces:
   critical status, or any flag in `{vip_not_transferred, agent_promise,
   warm_lead, or missed_lead with > 20s caller interaction}`).
2. At least one of `alert_on_critical`, `alert_on_warm_lead`,
   `alert_on_missed_lead`, `alert_on_vip_failure`, `alert_on_agent_promise`,
   `alert_on_dropped_call` matches the actual result.
3. `alert_owner` is on with a valid owner number, OR `alert_dispatcher`
   is on with a valid dispatcher number. (Owner number falls back to
   `escalation_number` if blank.)

The alert SMS body is taken from the model's `alert_message` field
(< 160 chars by prompt contract). A fallback message is built if the
model returned null.

### Recovery SMS rules

After scoring + alerting, `maybeSendRecoverySms()` checks the call for
caller-recovery candidates in priority order:

1. **Missed lead recovery** (`missed_lead_recovery`) — flag includes
   `missed_lead` AND duration > 45s.
2. **Early hang-up recovery** (`early_hangup_recovery`) — duration in
   [10, 45]s AND flag includes `warm_lead` or `missed_lead`.
3. **Dropped call recovery** (`dropped_call_recovery`) — flag includes
   `no_resolution`, duration > 15s, outcome not `completed`/`transferred`.

Cooldown: any recovery SMS to a given caller is suppressed if any
recovery SMS was sent to that same number in the prior 4 hours. Recovery
SMS bypass plan limits and do not count against the client's monthly
allowance. `business_phone` for the SMS body uses
`notifications_config.live_transfer_number` then falls back to
`escalation_number`.

### Donna handoff after deployment

1. Add `ANTHROPIC_API_KEY` to Vercel Production, Preview, and Development.
   Without it, scoring sets `intelligence_status='error'` and logs the
   reason; nothing else breaks.
2. Run migration `032_call_intelligence.sql` in Supabase SQL editor.
3. Confirm intelligence columns exist on `calls` and the
   `call_intelligence_log` table exists.
4. Make a test call to GM Towing. After it ends, wait 30-60 seconds and
   reload `/calls` — the row should have a coloured dot and a summary.
5. Confirm `/api/cron/score-pending-calls` shows in the Vercel Crons
   dashboard with the `*/10 * * * *` schedule.
6. Confirm the Agent Quality card appears on `/dashboard`.
7. Confirm the Call Intelligence Alerts section appears on `/settings`
   under Notifications, with owner_number pre-filled from the existing
   escalation number.

---

## SESSION 17B — Audit fixes from Session 17A (2026-05-19)

### No migration required

Code only. All migrations 001-031 already live.

### What changed

| Fix | Files |
|---|---|
| **FIX 1** -- `create_booking` Vapi tool now synced to Growth/Pro agents. Handler rewritten against the Session 15 bookings schema. Sets `booking_source = 'agent'`, fires direct Twilio SMS via `/lib/sms.ts` when `scheduler_settings.booking_confirmation_sms = true`, stamps `sms_confirmation_sent` on success. Drops the legacy `MAKE_BOOKING_WEBHOOK` fire-and-forget. | [src/app/api/vapi/sync/route.ts](src/app/api/vapi/sync/route.ts), [src/app/api/admin/vapi/sync/route.ts](src/app/api/admin/vapi/sync/route.ts), [src/app/api/vapi/functions/route.ts](src/app/api/vapi/functions/route.ts) |
| **FIX 3** -- Every remaining `MAKE_BOOKING_WEBHOOK` call site removed. The booking-confirm endpoint now sends confirmation SMS via `/lib/sms.ts` instead of firing the Make.com webhook. Env var declaration left intact per brief. | [src/app/api/portal/bookings/[id]/confirm/route.ts](src/app/api/portal/bookings/%5Bid%5D/confirm/route.ts), [src/app/api/vapi/functions/route.ts](src/app/api/vapi/functions/route.ts) |
| **FIX 4** -- `check_caller` now logs every invocation to Vercel function logs with `raw_phone`, `normalised_phone`, `last9`, `vip_match`, `bypass_match`, `account_match`, `contact_match`, `candidates_total`, `result_type`, and `client_id`. Helps diagnose phone-format mismatches that may cause VIPs not to be recognised. | [src/app/api/vapi/functions/route.ts](src/app/api/vapi/functions/route.ts) (inside `checkCaller`) |
| **FIX 5** -- Five dead Vapi handlers removed (`get_wait_time`, `get_availability` alias, `check_dispatch_availability`, `create_dispatch_job`, `get_job_types`). None of them were ever synced to a Vapi agent and Session 15's scheduler functions superseded them. Removed alongside: `activeDriverIds` helper and `DispatchConfig` interface (unused without those handlers). `VALID_FNS` set + switch dispatch trimmed. ~405 lines deleted. | [src/app/api/vapi/functions/route.ts](src/app/api/vapi/functions/route.ts) |

### FIX 2 -- noop (audit-report error)

The Session 17A report said `/admin/audit-log` 404s because
`src/app/admin/audit-log/page.tsx` was missing. That was wrong: the page
already lives at [src/app/(portal)/admin/audit-log/page.tsx](src/app/%28portal%29/admin/audit-log/page.tsx)
and routes correctly to `/admin/audit-log` thanks to the `(portal)`
route group. Confirmed in this build's route table: `├ ƒ /admin/audit-log`.
No code change needed.

### `create_booking` flow now

1. Agent calls `create_booking` with `caller_name`, `caller_phone`,
   `scheduled_date` (YYYY-MM-DD), `scheduled_time` (HH:MM 24h preferred,
   AM/PM tolerated), plus optional pickup/dropoff address + contacts,
   `truck_type`, `rate_type`, `description`, `account_id`, `driver_id`,
   `call_id`.
2. Handler combines date + time into ISO `scheduled_start`.
3. Reads `scheduler_settings` for `default_duration_tilt_minutes` /
   `default_duration_sideloader_minutes` / `default_duration_minutes` to
   compute `scheduled_end` (defaults to 60min if no settings row).
4. Inserts into `bookings` with `booking_source = 'agent'`, `status =
   'pending'`, all addresses + contacts, truck + rate types, account
   and driver linkage.
5. Links the booking back to `calls.booking_id` via `call_id` when
   provided.
6. If `scheduler_settings.booking_confirmation_sms = true`, calls
   `sendSMS(...)` with `templateBookingConfirmation(...)`. On success,
   updates the booking row with `sms_confirmation_sent = true`. Plan
   limits / quota enforced inside `sendSMS`.
7. Returns `{ booking_id, scheduled_start, sms_sent, confirmation_message }`.

### Deliberately unchanged

- **VIP sync architecture** (Session 17A confirmed correct -- brief
  explicitly said don't change it).
- `MAKE_CALLBACK_WEBHOOK`, `MAKE_DISPATCH_JOB_WEBHOOK` env var references
  (the dispatcher-job webhook fire was removed alongside
  `createDispatchJob` -- the env var itself stays).
- `MAKE_BOOKING_WEBHOOK` env var declaration stays per brief (no remaining
  call sites in code).

### Verification

- `npm run build` -- 130 routes, zero TypeScript errors in changed
  files. `middleware -> proxy` deprecation warning is pre-existing.
- `/admin/audit-log` registered in the route table.
- `create_booking` tool will be added to Growth/Pro Vapi agents on the
  next Sync Agent press. Donna should trigger Sync Agent for GM Towing
  and Spectrum Towing after deploy to push the new tool live.

### Donna handoff after deployment

1. Confirm Vercel deploy is green.
2. Press Sync Agent for **GM Towing** and **Spectrum Towing** to push
   `create_booking` onto their assistants.
3. Verify the new tool appears in the Vapi dashboard under each
   assistant's tool list.
4. Send a test inbound call to confirm `check_caller` logs surface in
   Vercel function logs with the new structured payload.

---

## SESSION 16 — Locked preview pattern + scheduler route display (2026-05-17)

### No migration required

UI only. All schema (migrations 001-031) already live.

### The pattern

Every plan-gated page now renders a full preview of the feature instead
of a blank "upgrade your plan" wall. Three layers:

1. **Upgrade banner** sticky at the top of the page content (orange
   gradient for upgrade variants, blue for the towing-only Command info
   banner). Holds the title, subtitle, feature pills, a `See what's
   included` ghost link to talkmate.com.au/pricing, and a primary
   `Upgrade to Plan -- $X/mo` button pointing at the Stripe payment
   link for the target plan.
2. **Demo content** rendered at full opacity inside an `aria-hidden`
   wrapper with `pointer-events: none` and `user-select: none`. Buttons,
   tables, inputs all visually present but inert. No blur, no overlay.
3. **Lock bar** sticky at the bottom with `Plan feature preview` label,
   a bold "This is a preview of X" headline, a muted one-liner, and the
   same upgrade button as the top banner.

When `adminClientId` is passed, both upgrade buttons swap to a single
**"Upgrade this client"** action that links to `/admin/clients/[clientId]`
so Irfan can lift the plan from inside the admin view.

### Files added

| File | What it does |
|---|---|
| [src/lib/extract-suburb.ts](src/lib/extract-suburb.ts) | `extractSuburb(address)` walks AU address strings backwards looking for a state code (VIC/NSW/QLD/SA/WA/TAS/NT/ACT) and returns the suburb word(s) before it. `routeLabel(pickup, dropoff, fallback)` returns `Suburb → Suburb` for the scheduler blocks, falling back to the truck type when both addresses are null. |
| [src/components/portal/locked-preview.tsx](src/components/portal/locked-preview.tsx) | Shared shell -- banner + demo wrapper + lock bar. Variants: `upgrade` (orange + Stripe link) and `info` (blue, no upgrade button). Respects `adminClientId` to swap to "Upgrade this client". |
| [src/components/portal/dispatch-locked-demo.tsx](src/components/portal/dispatch-locked-demo.tsx) | Static dispatch board demo: 4 stat cards, 4 active job rows, 3 driver rows. |
| [src/components/portal/scheduler-locked-demo.tsx](src/components/portal/scheduler-locked-demo.tsx) | Static week-view calendar demo with 10 bookings across Mon-Sat + stats bar. |
| [src/components/portal/quotes-locked-demo.tsx](src/components/portal/quotes-locked-demo.tsx) | Static quotes log demo: 4 stat cards + 3-row history table. |
| [src/components/portal/command-locked-demo.tsx](src/components/portal/command-locked-demo.tsx) | Telegram conversation mockup (3 sent / 3 received bubbles) + Commands Today stat card + Recent commands list. |
| [src/app/(portal)/settings/command/command-client.tsx](src/app/(portal)/settings/command/command-client.tsx) | Renamed from the old `page.tsx`. The 'use client' Command settings UI now lives behind the new server-rendered gate. |

### Files changed

| File | What changed |
|---|---|
| [src/app/(portal)/dispatch/page.tsx](src/app/(portal)/dispatch/page.tsx) | Dropped `.single()` on `businesses` in favour of the layout's account_status priority filter (no more 500s on owners with multiple business rows). Towing + non-Pro renders `LockedPreview` + `DispatchLockedDemo`. Pro path falls through to the existing dispatch-board unchanged. |
| [src/app/(portal)/scheduler/page.tsx](src/app/(portal)/scheduler/page.tsx) | Same account_status filter. Starter renders `LockedPreview` + `SchedulerLockedDemo`. Growth/Pro fall through to `SchedulerView` unchanged. |
| [src/app/(portal)/quotes/page.tsx](src/app/(portal)/quotes/page.tsx) | Converted from a one-liner client wrapper to a server page that fetches the plan and gates Starter to `QuotesLockedDemo`. |
| [src/app/(portal)/settings/command/page.tsx](src/app/(portal)/settings/command/page.tsx) | New server page. Non-towing -> blue info banner with no upgrade button. Towing + Starter -> orange upgrade preview. Towing + Growth/Pro -> the renamed `CommandSettingsClient`. |
| [src/components/portal/scheduler-view.tsx](src/components/portal/scheduler-view.tsx) | Week-view block (`WeekDayColumn`) and day-view lane block now show `routeLabel(pickup, dropoff, truck_type)` on line 2. Day view's time row em dash replaced with `--` per the no-em-dash rule. |
| [src/components/portal/sidebar.tsx](src/components/portal/sidebar.tsx) | Dispatch Board and TalkMate Command are now always visible for towing clients with a muted `lockTag` chip when the client doesn't have the plan (`PRO` for non-Pro, `GROWTH` for non-paid). Chip style matches the brief: 9px / 700 weight / muted text / 1px-by-5px padding / 4px radius. "Current plan" label added above the plan name. Upgrade buttons rewritten as `<a href={NEXT_PUBLIC_STRIPE_*_LINK}>` (fallback `/billing`). Pro now shows "You are on our top plan". |
| [src/components/portal/portal-shell.tsx](src/components/portal/portal-shell.tsx) | New `industry` prop forwarded to `PortalSidebar`. |
| [src/app/(portal)/layout.tsx](src/app/(portal)/layout.tsx) | Forwards `business.industry` to `PortalShell`. |
| [src/app/admin/clients/[clientId]/portal/dispatch/page.tsx](src/app/admin/clients/%5BclientId%5D/portal/dispatch/page.tsx) | Replaces the bare `AdminPagePlaceholder` with the plan-gated locked preview when the client is non-Pro towing. `adminClientId={clientId}` swaps the CTAs to "Upgrade this client". |
| [src/app/admin/clients/[clientId]/portal/scheduler/page.tsx](src/app/admin/clients/%5BclientId%5D/portal/scheduler/page.tsx) | Adds Starter -> locked preview branch above the existing `SchedulerView`. |
| [src/app/admin/clients/[clientId]/portal/quotes/page.tsx](src/app/admin/clients/%5BclientId%5D/portal/quotes/page.tsx) | Adds Starter -> locked preview branch above `QuotesLogView`. |
| [src/app/admin/clients/[clientId]/portal/settings/command/page.tsx](src/app/admin/clients/%5BclientId%5D/portal/settings/command/page.tsx) | Adds non-towing info banner + Starter towing upgrade preview branches; Pro/Growth towing falls through to the existing `AdminPagePlaceholder`. |

### Gate logic summary

| Page | Real-page access | Locked variant |
|---|---|---|
| `/dispatch` | Pro towing only | Towing + Starter/Growth: orange `Upgrade to Pro -- $799/mo`. Non-towing: existing industry Notice unchanged. |
| `/scheduler` | Growth/Pro | Starter: orange `Upgrade to Growth -- $499/mo` + week-view demo. |
| `/quotes` | Growth/Pro | Starter: orange `Upgrade to Growth -- $499/mo` + log demo. |
| `/settings/command` | Growth/Pro towing | Towing + Starter: orange upgrade preview. Non-towing any plan: blue info banner, no upgrade button. |

### Scheduler block route display

Both week view (`WeekDayColumn`) and day view (`DayGrid` lane blocks)
now show the route on line 2. Logic in `routeLabel`:

- `pickup` + `dropoff` both extract a suburb -> `Suburb → Suburb`
- only one extracts -> show that one
- neither extracts -> show truck type (e.g. `Loaded Tilt Tray`)
- truck type missing too -> show description fallback (week/day) or dash

`extractSuburb` handles the AU format `"5/53 Horne St, Campbellfield VIC 3061"`:
split by comma, walk parts in reverse, find the chunk containing a state
code, return the words before it. Fallback truncates to 24 chars when no
state code is present.

### Sidebar plan-gate nav badges

Two muted chips next to nav items when the client doesn't have access:

- **Dispatch Board** -> `PRO` chip when towing + not Pro
- **TalkMate Command** -> `GROWTH` chip when towing + not Growth/Pro

Items remain clickable -- they route to the page, which renders the
locked preview. This is intentionally separate from the existing
`locked` field on `Command Centre` (which routes to `/billing` for
"coming soon" items like Google Reviews).

### Stripe payment links

Upgrade CTAs (sidebar plan card + locked preview banners + lock bars)
all read `process.env.NEXT_PUBLIC_STRIPE_GROWTH_LINK` and
`process.env.NEXT_PUBLIC_STRIPE_PRO_LINK`. If unset, the sidebar plan
card falls back to `/billing`; the locked-preview buttons fall back to
`router.push('/billing')`. **Confirm these env vars are set in Vercel
before Spectrum Towing or any Starter client tests the upgrade flow --
trial-banner.tsx already references them, so the values should already
be wired up in production.**

### Verification

- `npm run build` -- compiles cleanly. 130 routes generated, zero
  TypeScript errors. The `middleware->proxy` deprecation warning is
  pre-existing and unrelated.
- No new dependencies, no migrations, no API route changes, no Make.com
  or Vapi changes required.
- Spectrum Towing (Starter, towing) will now see the full Dispatch demo
  with the upgrade banner instead of the blank "being set up" notice.

---

## SESSION 15 — Accounts, VIP bypass, native scheduler, Twilio SMS, waitlist, public holidays (2026-05-16)

### Migration

**Run before deploy:** `supabase/migrations/031_accounts_vip_scheduler.sql`

Adds:
- `vip_callers` extended with `account_type` (account / vip), `company_name`, `abn`, `billing_contact_name`, `billing_contact_email`, `linked_numbers` (jsonb), `vip_bypass` (boolean). The existing `active` column was kept — the brief mentioned `is_active` in places but the live table uses `active`.
- `bookings` extended with `description`, route fields (`pickup_address` + contacts, `dropoff_address` + contacts), lat/lng, `distance_km`, `duration_minutes`, `truck_type`, `rate_type`, `account_id` (FK to vip_callers), `driver_id` (FK to drivers), `booking_source` (agent/manual/google_calendar/walk_in), `estimated_value`, `scheduled_start`/`scheduled_end`, `actual_start`/`actual_end`, `no_show`, SMS-tracking flags (`sms_confirmation_sent`, `sms_reminder_24h_sent`, `sms_reminder_2h_sent`), `cancellation_reason`, `waitlist_position`.
- `waitlist` table (RLS) with `position`, `status` (waiting/offered/claimed/expired/cancelled), `offered_at`, `offer_expires_at`, `claimed_at`, `booking_id`, `call_id`.
- `public_holidays` table (no RLS) sourced from data.gov.au. National holidays are fanned out into one row per state on sync so the scheduler can do `where state = $1` cleanly.
- `sms_log` table (RLS) with `to_phone`, `message`, `twilio_sid`, `status`, `sms_type`, `booking_id`, `waitlist_id`, `sent_at`, `error_message`.
- `businesses` extended with `sms_used_this_month`, `sms_reset_at`.
- `scheduler_settings` extended with `default_duration_tilt_minutes`, `default_duration_sideloader_minutes`, `default_duration_minutes`, `reminder_24h_enabled`, `reminder_2h_enabled`, `waitlist_auto_notify`, `waitlist_claim_window_minutes`, `cancellation_policy_enabled`, `cancellation_notice_hours`, `cancellation_fee_aud`, `overridden_holidays`.

All statements are idempotent.

### What landed

1. **`src/lib/sms.ts`** — single Twilio SMS service. Normalises phone numbers to +61 E.164, enforces plan SMS limits (Starter 0 / Growth 200 / Pro 500), opportunistically resets the monthly counter on the first send of the month, calls Twilio's REST `Messages.json` endpoint, writes every send (success or failure) to `sms_log`, and increments `businesses.sms_used_this_month`. Eight templated message types: `templateBookingConfirmation`, `templateReminder24h`, `templateReminder2h`, `templateCancellation`, `templateWaitlistOffer`, `templateWaitlistClaimed`, `templateWaitlistExpired`, `templateVipMissedCall`. **Direct Twilio replaces Make.com for all booking SMS** going forward.
2. **`POST /api/portal/sms/send`** — manual SMS send for the portal UI; routes through `sendSMS`.
3. **`/vip-callers` redesigned** with two tabs:
   - **Accounts tab**: card layout with company name, ABN, billing contact, linked-number chips, active toggle, edit + view history. New `POST/GET/PATCH/DELETE /api/portal/accounts` and `/api/portal/accounts/[id]/history` endpoints (admin equivalents under `/api/admin/businesses/[id]/accounts`).
   - **VIP Callers tab**: existing table layout with a green "Direct Transfer" badge on every bypass VIP. The "Add VIP" modal now shows the bypass info banner and defaults `vip_bypass = true` for every new entry.
   - Tab state mirrored in URL (`?tab=accounts` / `?tab=vip`).
4. **`/scheduler` page** with three tabs:
   - **Calendar**: toggle between **week view** (52px time gutter + 7 day columns, today highlighted, hour rows from operating hours, closed hours use diagonal stripe hatch, agent jobs orange / manual blue / in-progress green / cancelled red) and **day view** (driver-lane layout — each active driver gets a horizontal row, plus an "Unassigned" lane; job blocks are absolutely positioned with left offset by start time and width by duration; sticky time header; "OPEN" tint on empty cells; live "now" indicator). Click a slot to open Add Job pre-filled with that date/time/driver.
   - **Job List**: table with status filter, columns Date/Time, Customer, Route, Truck, Driver, Source badge, Status badge. No price column.
   - **Settings**: operating hours grid (per-day open/close + enabled), buffer minutes, max concurrent jobs, default durations (tilt/sideloader for towing; appointment duration for others), SMS toggles (locked on Starter), waitlist toggles, cancellation policy, state + timezone with auto-mapping. Saves via `/api/portal/scheduler-config` and triggers `silentSyncAgent()`.
5. **Bookings API** — `GET` extended with `from`/`to` filters for the scheduler grid; **new `POST`** for manual bookings (auto-resolves `account_id` from caller phone against `vip_callers.linked_numbers`, fires SMS confirmation when scheduler setting is on). `PATCH /api/portal/bookings/[id]` extended to allow updating all scheduler fields plus cancellation. Cancelling a booking now sends a cancellation SMS and pings `/api/portal/waitlist/offer` for the now-open slot. Admin equivalents under `/api/admin/businesses/[id]/bookings`.
6. **Waitlist engine**: `GET/POST /api/portal/waitlist`, `PATCH/DELETE /api/portal/waitlist/[id]`, `POST /api/portal/waitlist/offer` (internal — gated by `INTERNAL_API_SECRET` or `VAPI_WEBHOOK_SECRET`; picks the next waiting entry, marks it offered, sends the SMS, stamps the expiry).
7. **Three new Vercel cron jobs** (added to `vercel.json`):
   - `/api/cron/waitlist-expiry` every 15 minutes — flips offered → expired past the claim window, sends the expired SMS, then pushes the offer to the next entry on each affected client.
   - `/api/cron/sms-reminders` hourly — sends 24h and 2h reminders for upcoming bookings, gated by `scheduler_settings.reminder_24h_enabled` / `reminder_2h_enabled` and the plan SMS allowance. Window logic: 24h between now+23h and now+25h, 2h between now+1h45m and now+2h15m. Flips `sms_reminder_*_sent` on success only.
   - `/api/cron/sync-public-holidays` annually (Jan 1) — pulls current + next year from `data.gov.au` resource `33673aca-0857-42e5-b8f0-9981b4755686`, parses YYYYMMDD dates, maps `nat`/`act`/`nsw`/`nt`/`qld`/`sa`/`tas`/`vic`/`wa`, fans out national holidays per state, upserts on `(state, holiday_date)`. Can be invoked on-demand by hitting the endpoint with `Authorization: Bearer ${CRON_SECRET}`.
8. **`GET /api/portal/public-holidays`** — read-only list for the scheduler settings banner.
9. **`check_caller` rewritten** to detect:
   - **Accounts**: matches inbound phone against `vip_callers.phone` AND any `linked_numbers[].phone` using last-9-digit comparison. Returns `caller_type: 'account'` with `account_id`, `company_name`, `billing_contact_name/email`, `rate_type: 'account'`.
   - **VIP bypass**: returns `caller_type: 'vip_bypass'` with `transfer_number` (from `notifications_config.live_transfer_number`), `vip_name`, `business_name`.
   - **Regular VIP** (legacy non-bypass) and **existing contact** / **unknown** flows are preserved.
10. **Three new Vapi functions** appended:
    - `check_availability` — checks operating hours + public holidays + concurrent job count + driver availability (towing). Returns `{ available, message, scheduled_start, scheduled_end }` on success or a reason code (`closed_day`, `outside_hours`, `public_holiday`, `capacity`, `no_drivers`).
    - `add_to_waitlist` — inserts into waitlist with auto-incrementing position. Returns the position and a natural-language message.
    - `cancel_booking` — finds by `booking_id` or `caller_phone + scheduled_start`, applies cancellation policy notice if configured, sets status to cancelled, fires waitlist offer.
    - `reschedule_booking` — finds the booking, reuses `check_availability` for the new slot, updates `scheduled_start`/`scheduled_end`, resets the SMS-reminder flags.
11. **Sync routes** (both `/api/vapi/sync` and `/api/admin/vapi/sync`) ensure the four new scheduler tools on Growth/Pro, strip them on Starter, inject a `VIP CALLER HANDLING:` prompt block on all plans, and inject a `SCHEDULER AND BOOKINGS:` block on Growth/Pro.
12. **Sidebar nav**: added `Scheduler` entry (CalendarDays icon) between Quotes and Analytics in both the client sidebar and the admin portal shell. Admin parity routes added for `/admin/clients/[clientId]/portal/scheduler`.
13. **Website updates** (talkmate-website repo): pricing page plans rebuilt — Starter lost "SMS confirmations" (booking SMS is a Growth/Pro feature now), Growth gained Job scheduler + 200 booking SMS / month + waitlist + distance quoting + account management, Pro gained 500 booking SMS / month. Features page added three highlighted cards (Job scheduler, Live distance quoting, SMS confirmations/reminders) plus Waitlist and Account client management. Removed WhatsApp from `IntegrationsRow.tsx`.

### New API endpoints

Portal:
- `POST /api/portal/sms/send`
- `GET / POST / PATCH / DELETE /api/portal/accounts(/[id])` + `GET /api/portal/accounts/[id]/history`
- `POST /api/portal/bookings` (was GET-only)
- `GET / PATCH /api/portal/scheduler-config`
- `GET / POST /api/portal/waitlist`, `PATCH / DELETE /api/portal/waitlist/[id]`
- `POST /api/portal/waitlist/offer` (internal)
- `GET /api/portal/public-holidays`

Admin:
- `GET / POST / PATCH / DELETE /api/admin/businesses/[id]/accounts(/[accountId])` + history
- `GET / PATCH /api/admin/businesses/[id]/scheduler-config`
- `POST /api/admin/businesses/[id]/bookings` (was GET-only)
- `GET /api/admin/businesses/[id]/drivers` (read-only)

Crons:
- `GET/POST /api/cron/waitlist-expiry`
- `GET/POST /api/cron/sms-reminders`
- `GET/POST /api/cron/sync-public-holidays`

### Environment variables

- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` — required by `src/lib/sms.ts`.
- `CRON_SECRET` — required for the three new cron routes.
- `INTERNAL_API_SECRET` (or `VAPI_WEBHOOK_SECRET` fallback) — gates `/api/portal/waitlist/offer`.
- `NEXT_PUBLIC_APP_URL` — used by the cron job's internal `fetch` for follow-up waitlist offers.

### Deviations from brief

- Brief mentioned `is_active` on `vip_callers` in places, but the live table uses `active`. Migration 031 respects the existing column name.
- Brief lists "no SMS on Starter" but the legacy Starter copy on the website previously included "SMS confirmations". Removed from Starter feature list to match the new plan gating.
- Cancellation policy is enforced as a soft notice (the agent advises the caller of the fee but proceeds with the cancellation). Hard enforcement (refuse to cancel) was not in scope.
- Scheduler dashboard uses the Booking table directly — no separate "calendar events" table. This simplifies the data model and means the agent and the portal always agree.
- The `/icon` prerender error on the website repo pre-existed Session 15 and only surfaces on Windows local builds; Vercel deploys it cleanly.

### Testing checklist

- Run migration 031 in Supabase SQL editor. Confirm `vip_callers` has the new columns, `bookings` has the scheduler columns, `waitlist`/`public_holidays`/`sms_log` exist, `businesses` has `sms_used_this_month`, `scheduler_settings` has the new fields.
- POST `/api/cron/sync-public-holidays` with `Authorization: Bearer ${CRON_SECRET}` and confirm `public_holidays` has VIC entries for 2026 and 2027.
- Go to `/vip-callers` as GM Towing → Accounts tab loads → add an account with two linked numbers → save → tag chips render → View History opens the side drawer.
- Switch to VIP Callers tab → add a VIP → the info banner about bypass is visible → save → "Direct Transfer" badge shows in the table.
- Go to `/scheduler` → Day view shows driver lanes including an "Unassigned" row → click an empty cell → Add Job modal pre-fills with that slot and driver.
- Save a booking → it appears immediately on the calendar → if the customer phone is set and `booking_confirmation_sms` is on, a row appears in `sms_log` and `sms_used_this_month` increments.
- Open Settings tab → toggle reminders → Save → settings persist → silent sync fires.
- In the Vapi dashboard, confirm GM Towing's assistant now has `check_availability`, `add_to_waitlist`, `cancel_booking`, `reschedule_booking` tools and both new prompt blocks. Starter clients have none of those tools or the scheduler block.
- Disable the Make.com Booking SMS scenario (5684594) **after** confirming a live test booking sends via Twilio successfully.

### Manual handoff for Donna

1. Run `031_accounts_vip_scheduler.sql` in Supabase SQL editor.
2. Confirm `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`, `CRON_SECRET` are all present in Vercel (Production + Preview).
3. Trigger public holiday sync manually: `curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://app.talkmate.com.au/api/cron/sync-public-holidays`. Verify `public_holidays` table has VIC entries for 2026.
4. After Vercel deploys, hit "Sync Agent" on GM Towing to push the new tools and prompt blocks to the live Vapi assistant.
5. Send one test booking through the portal → confirm SMS lands → only **then** disable Make.com Booking SMS scenario (5684594). Do not delete it; mark inactive in Make.com.
6. Report back.

---

## SESSION 14 — Distance quoting engine + scheduler foundation (2026-05-16)

### Migration

**Run before deploy:** `supabase/migrations/030_distance_quoting_and_scheduler.sql`

Adds:
- `businesses.service_area_radius` (int, default 100)
- `businesses.service_area_mode` (text, default `radius`, check radius/postcodes)
- `businesses.service_area_postcodes` (jsonb, default `[]`)
- `businesses.quote_config` (jsonb, default `{}`)
- `quotes` table — every quote the agent gives, with RLS scoped by `client_id`. `call_id` is text and references `calls(vapi_call_id)` so Vapi's own call identifier writes through directly.
- `scheduler_settings` table — one row per client, foundation for Session 15. Default mode is `native`, timezone `Australia/Melbourne`, with the operating-hours JSONB pre-seeded to a standard 8-6 weekday window.
- `scheduler_settings_touch_updated_at` trigger so `updated_at` stays current on edits.

All statements are idempotent (`IF NOT EXISTS`, `DROP POLICY IF EXISTS`, etc.).

### What landed

1. **`/api/maps/distance` route** — server-side only. Uses `GOOGLE_MAPS_SERVER_KEY` for Geocoding + Distance Matrix, never exposed to the browser. Gated by `INTERNAL_API_SECRET` (falls back to `VAPI_WEBHOOK_SECRET` if unset) on an `x-internal-secret` header. Returns `origin/destination_resolved`, `origin/destination_lat/lng`, `distance_km`, `duration_minutes` (traffic-aware), `within_service_area`, and `origin/destination_confidence` (high = ROOFTOP/RANGE_INTERPOLATED, low otherwise). Service area check supports both radius (Haversine against geocoded `business_address`) and postcode/suburb modes.
2. **Two new Vapi functions** appended to `/api/vapi/functions/route.ts`:
   - `calculate_job_quote` — plan-gated (Starter returns `plan_locked`). Calls `/api/maps/distance` internally, applies POA bands (>100km tilt tray, >30km sideloader), rounds distance UP to the nearest 10km band, builds the exact service-name pattern (`Loaded Tilt Tray - Private 20 to 30km` etc), reads the price from `businesses.services` (never hardcoded), applies `after_hours_surcharge_percent` if outside the scheduler operating hours, enforces `minimum_job_fee`, writes a row to `quotes`, and returns the natural-language `message` the agent should speak.
   - `log_quote_addon` — looks up the add-on price from `businesses.services`, appends to `quotes.addons`, recalculates `total_price`, returns the updated total.
3. **Sync routes updated** (both `/api/vapi/sync` and `/api/admin/vapi/sync`): on Growth/Pro plans they ensure the two new tools are present on the assistant and inject a `DISTANCE QUOTING:` system-prompt block. On Starter they actively strip both tools and the block (handles plan downgrades). The four existing baseline tools (`check_caller`, `log_outcome`, `get_team`, `schedule_callback`) and the VIP block are untouched.
4. **Service Area + Quote settings UI** at `/settings/service-area` (client) and `/admin/clients/[clientId]/portal/settings/service-area` (admin). Both render the same `QuoteServiceAreaPanel` component, parameterised by `adminClientId`. Mode toggle (Radius / Postcodes / Suburbs), radius slider (10-500 km), postcode tag list (max 200 entries), quote validity dropdown (1/2/4/8 hours), after-hours surcharge %, minimum job fee, and a Save button that fires `silentSyncAgent()` on success. On Starter the entire panel renders a locked state with an upgrade CTA.
5. **`/quotes` log page** at `/quotes` (client) and `/admin/clients/[clientId]/portal/quotes` (admin). Both use the shared `QuotesLogView`. Four stat cards (Total this month, Accepted, Declined, Avg distance). Table columns match the brief: Date / Time, Caller, Pickup, Dropoff, Distance, Truck Type, Rate, Total, Status, Actions. POA quotes show `POA` instead of a dollar total. Actions dropdown lets the client/admin mark quotes Accepted / Declined / Reset to Given and jump to the linked call.
6. **Sidebar nav updates** (`src/components/portal/sidebar.tsx` + `src/components/admin/admin-portal-shell.tsx`): added `Quotes` entry in the Overview section right after `Calls`, and `Service Area` under `Your Agent` near `Agent Settings`.

### New API endpoints

- `POST /api/maps/distance` — internal, gated by `INTERNAL_API_SECRET` / `VAPI_WEBHOOK_SECRET`.
- `GET / PATCH /api/portal/quote-config` — client portal service area + quote_config. Starter PATCHes return 403.
- `GET /api/portal/quotes` — list + monthly stats for the calling client.
- `PATCH /api/portal/quotes/[id]` — update status (given/accepted/declined/expired).
- `GET / PATCH /api/admin/businesses/[id]/quote-config` — admin equivalent, audit-logged via `logAdminAction('quote_config_updated')`.
- `GET /api/admin/businesses/[id]/quotes` — admin list + stats for a target client.
- `PATCH /api/admin/businesses/[id]/quotes/[quoteId]` — admin status update.

### Environment variables

- `GOOGLE_MAPS_SERVER_KEY` — required for `/api/maps/distance`. Must NOT have a `NEXT_PUBLIC_` prefix. Distance Matrix + Geocoding APIs must be enabled on the GCP project.
- `INTERNAL_API_SECRET` — optional. If unset, `/api/maps/distance` falls back to `VAPI_WEBHOOK_SECRET` so existing production deployments already have a value.
- `NEXT_PUBLIC_GOOGLE_PLACES_API_KEY` — untouched. Still browser-side for address autocomplete only.

### Quote logic deviations from brief

- The brief listed 9 existing Vapi functions; the actual codebase has 10 (`get_wait_time`, `get_availability` alias, `check_dispatch_availability`, `get_job_types` in addition to the rest). Session 14 appended cleanly — no existing function was removed or renamed.
- The brief's example response (`This quote is valid for 2 hours`) is generated dynamically from `quote_config.quote_validity_minutes` so it stays accurate when clients change the validity dropdown.
- Service-name matching is case-insensitive and trims whitespace. `enabled === false` services are skipped. Prices accept either `number` or `string` (e.g. `"356"`) — the existing GM Towing catalog mixes both.
- POA quotes still write a `quotes` row with `is_poa = true` and `base_price = null`. The quotes log shows them as `POA` in the Total column so Donna can spot them and call back with a manual price.

### Testing checklist

- Run migration 030 in the Supabase SQL editor. Confirm `service_area_*` and `quote_config` columns exist on `businesses`; `quotes` and `scheduler_settings` tables exist with RLS enabled.
- Sign in as GM Towing → `/settings/service-area` loads with radius mode and a 100km default; switching to Postcodes mode lets you add/remove entries. Save persists across reload. Save fires `silentSyncAgent()` (check that the agent's "last synced" timestamp updates).
- Verify in the Vapi dashboard that GM Towing's assistant now has `calculate_job_quote` and `log_quote_addon` tools and a `DISTANCE QUOTING:` block at the end of the system prompt.
- Sign in as a Starter-plan client → `/settings/service-area` shows the locked state with an Upgrade CTA. Their Vapi assistant has neither quote tool nor the prompt block.
- Call the agent and ask for a tow quote inside the service area — expect "approximately Xkm... around Y minutes... the price is $Z... this quote is valid for 2 hours." A new row appears in `/quotes` immediately after the call.
- Try a quote that exceeds 100km for tilt tray or 30km for sideloader — agent should respond with the POA message and offer a callback. The `/quotes` log shows the entry with `POA` in the Total column.
- Try a pickup outside the service area — agent should politely refuse. `/quotes` does not log it (function exits before the insert).
- `/admin/clients/[clientId]/portal/quotes` and `/admin/clients/[clientId]/portal/settings/service-area` load with the amber admin banner. Editing the service area as admin audit-logs `quote_config_updated`.
- `npm run build` passes with zero errors.

### Manual handoff for Donna

1. Run migration `030_distance_quoting_and_scheduler.sql` in the Supabase SQL editor.
2. Confirm `GOOGLE_MAPS_SERVER_KEY` is set in Vercel project settings (Production + Preview). Enable Distance Matrix API + Geocoding API on the GCP project if not already.
3. After deploy, hit "Sync Agent" on GM Towing from `/settings` so the assistant picks up the two new tools and the prompt block.
4. Report back the migration result and any sync errors.

---

## SESSION 13 — Admin portal parity + Sync Agent expansion (2026-05-15)

No new migrations. All schema changes (agent_last_synced_at on businesses) were already live via migration 029.

### What landed

1. **Admin portal parity route group** at `/admin/clients/[clientId]/portal/*`. The admin (irfan@) stays signed in as themselves — no session swap — and the layout fetches the scoped business with the service-role client. An amber "Admin view — [Business] — Changes are live" banner is sticky at the top of every page in the tree, with a "Back to Admin" button.
2. **Mirrored 13 portal sub-routes** under that tree: `/dashboard`, `/calls`, `/contacts`, `/catalog`, `/team`, `/vip-callers`, `/bookings`, `/callbacks`, `/dispatch`, `/settings`, `/settings/command`, `/settings/security`, `/settings/routing`. Where a clean admin-aware mirror was practical (dashboard snapshot, calls list, vip-callers, team, catalog, settings/routing), inline rendering reuses the existing view components and routes data calls through `/api/admin/businesses/[id]/*`. For pages that depend on the client's own RLS session (contacts merging, dispatch live websocket, security/staff, command setup), the admin sees a placeholder with an "Open as client" button that triggers the existing `/api/admin/clients/[id]/impersonate` magic-link flow in a new tab.
3. **Admin sidebar** (`src/components/admin/admin-portal-shell.tsx`) shows the same nav layout as the client portal but prefixed with the admin path, and only contains entries relevant to a single client.
4. **`SyncAgentButton` extended** with an optional `adminClientId` prop. When set, the button (and the `silentSyncAgent()` helper) routes through the new `/api/admin/vapi/sync?clientId=…` endpoint instead of `/api/vapi/sync`. The existing client endpoint was NOT modified — the brief explicitly forbade that. The two endpoints share the same tool definitions and VIP-block logic.
5. **Sync Agent button now appears on** `/catalog`, `/team`, `/vip-callers`, and `/settings/routing` in both client and admin portal views. `silentSyncAgent()` also fires after routing-settings save (in addition to the existing add/edit/delete triggers on the VIP and team pages). The catalog page now also auto-syncs after every item add, edit, delete, toggle, or feature change.
6. **`/admin/clients` entry point** — every row in the admin client list now has a 🏢 button next to the existing 👁 impersonate button. It links straight to `/admin/clients/[clientId]/portal/dashboard`. The 8-tab edit modal also gained an "Open Client Portal" CTA in its header.
7. **Command Centre setup page** is Telegram-only. Removed the WhatsApp Business option from the setup wizard at `/command-centre`, simplified the connection flow to a single Telegram step, and updated the subtitle to "Connect your Telegram bot in two minutes". WhatsApp Business notifications on the main `/settings` Integrations tab were left alone — that's a separate feature scope.

### New admin API endpoints

- `POST /api/admin/vapi/sync?clientId=…` — admin-scoped Vapi sync. Mirrors `/api/vapi/sync` but takes the target client from the query string. Uses `requireAdmin()` + service-role client.
- `PATCH /api/admin/businesses/[id]/vip-callers/[callerId]` — update a VIP caller as admin.
- `DELETE /api/admin/businesses/[id]/vip-callers/[callerId]` — remove a VIP caller as admin.

Existing admin endpoints reused: `/api/admin/businesses/[id]/team` (+ PATCH/DELETE on `[memberId]`), `/api/admin/businesses/[id]/vip-callers` (GET/POST), `/api/admin/businesses/[id]/escalation` (PATCH for routing).

### Security — Prompt injection incidents

While reviewing the repo for Session 13, the following prompt-injection artefacts were found and remediated:

- **`/AGENTS.md`** at the repo root contained a `nextjs-agent-rules` block that instructed AI coding agents to "read the relevant guide in `node_modules/next/dist/docs/` before writing any code." This pointed them at a file under `node_modules/next/dist/docs/index.md` which contained a comment instructing the agent to add a non-existent `unstable_instant` export from Next.js. The AGENTS.md file has been overwritten with a stub:
  ```
  # TalkMate Portal
  This file intentionally contains no AI agent instructions.
  ```
- **`/CLAUDE.md`** previously contained a single `@AGENTS.md` import line. Replaced with the same stub so Claude Code doesn't follow the injection.
- **`node_modules/next/dist/docs/index.md`** still contains the original injection on disk (line 11). Per the brief we did NOT modify `node_modules` because `npm install` would overwrite the fix on the next deploy. The risk is contained: AGENTS.md and CLAUDE.md no longer point any agent at that file. If we ever need to neutralise the source we should either pin a known-good `next` version, vendor a patched copy via `patch-package`, or report the package upstream.
- A repo-wide search for `unstable_instant`, `AI agent hint`, and `nextjs-agent-rules` outside `node_modules` returned no other matches.

### Testing checklist

- Log in as irfan@talkmate.com.au, go to `/admin/clients`, click the 🏢 button for GM Towing → lands on `/admin/clients/[id]/portal/dashboard`.
- The amber "Admin view — GM Towing — Changes are live" banner is visible on every page in the tree.
- All 13 portal sub-routes load without errors. Dashboard shows live counts; vip-callers, team, catalog and settings/routing are fully inline-editable.
- Sync Agent button is visible on `/catalog`, `/team`, `/vip-callers`, `/settings/routing` AND on the same pages inside `/admin/clients/[id]/portal/*`. In admin mode it hits `/api/admin/vapi/sync?clientId=…`.
- After a VIP edit / team edit / routing save / catalog change, `agent_last_synced_at` updates on the corresponding business row.
- `/settings/command` and `/command-centre` show no WhatsApp references in the setup UI.
- `npm run build` exits with 0 errors. ✅ Verified during Session 13.

---

## SESSION 11 — Security foundations (2026-05-15)

Branch: `security-foundations` — do NOT merge to main. Donna PRs after review.

### What landed

1. **Multi-factor authentication (TOTP)** on /settings/security. Optional
   per user; once enrolled, the login page does an AAL step-up challenge
   automatically. Supabase's native `auth.mfa.*` flow — no custom factor
   storage.
2. **Password strength enforcement.** Server-side `validatePassword()`
   in `src/lib/password.ts` is now applied by `/api/auth/signup`,
   `/api/auth/register`, `/api/auth/change-password`, and
   `/api/auth/accept-invite`. UI rule checklist via the
   `<PasswordStrength />` component on every password input.
3. **Basic RBAC.** New `staff_members` table (separate from the existing
   `team_members` directory). Roles: `owner` (businesses.owner_user_id),
   `manager` (edit services/team/routing, no billing), `staff`
   (view-only across operational pages). `useRole()` hook resolves
   role client-side; layout SSR resolves role server-side and threads
   `portalRole` into the sidebar so nav items are gated without a
   client-flash. Sensitive nav entries (Billing, top-level Settings,
   Agent Settings, Call Routing, White Label) are hidden for staff
   /manager based on `ROLE_PERMISSIONS`.
4. **Staff invite + accept flow.** Owner-only "Team Access" panel at
   /settings/security. `/api/portal/staff/invite` stores a SHA-256
   hash of the token (plaintext only in the email link), sends a
   Resend email, and creates a pending `staff_members` row.
   `/accept-invite?token=...` looks up the invite, asks for a
   password, calls `auth.signUp()`, stamps `auth_user_id` +
   `accepted_at`, and logs the user in.
5. **Admin audit log.** New `admin_audit_log` table (service-role only,
   no RLS). `src/lib/audit.ts` exposes `logAdminAction()` +
   `diffFields()`. Integrated into: client create, client PATCH
   (auto-derives `plan_changed`/`account_status_changed`/`client_updated`),
   activate, suspend, cancel, start/convert/end/extend/reactivate
   trial, dispatch enable + config update, team-member add/update/delete.
   New `/admin/audit-log` page with filters (business name / action /
   date range) and an expandable before/after diff panel.
6. **Data retention infrastructure.** New
   `businesses.data_retention_days` column (default 365). Monthly cron
   at `/api/cron/data-retention` runs on the 1st at 00:00 UTC; counts
   eligible rows in `calls`, `bookings`, `callbacks`, `dispatch_jobs`
   older than the per-client cutoff. **Defaults to dry-run mode** —
   never deletes anything unless `DRY_RUN_RETENTION=false` is
   explicitly set in Vercel. Logs each pass to `admin_audit_log`.

### Migration — `supabase/migrations/026_rbac_and_audit.sql`

Adds the three pieces above. Idempotent. **Run after 028 (already in
production)** — Postgres applies in filename order but Supabase tracks
each migration independently, so a back-filled 026 lands cleanly on a
database that already has 027/028 applied.

### Required Donna setup

1. **Run migration 026** in the Supabase SQL editor.
2. **Enable TOTP in Supabase Auth.** Supabase Dashboard →
   Authentication → Sign In Methods → MFA → enable
   Time-based One-Time Password (TOTP).
3. **Set Vercel env vars** if not already present:
   - `RESEND_API_KEY` (already used elsewhere; confirms staff invite
     emails will send).
   - `CRON_SECRET` (already present; the data-retention cron uses the
     shared `verifyCron` helper).
   - `DRY_RUN_RETENTION` — leave **unset** or `true`. Setting to
     `false` enables real deletion in the monthly cron. Do NOT flip
     this without an explicit decision.
4. **Add the call-recording consent disclosure** to every active Vapi
   assistant's first message. Queensland legal requirement. Either at
   the start, or rolled into the greeting:
   - `"This call may be recorded for quality and training purposes."`
   - Or: `"Good [morning/afternoon], [Business Name], [Agent Name] speaking. Just to let you know this call may be recorded. How can I help you today?"`

   Assistants to update (Donna handles in Vapi dashboard, no code
   change):
   - All active client assistants — GM Towing, and any other live
     client agents
   - All 13 demo agents (TalkMate's industry demo numbers)

### What changed for existing users

- Anyone with a current `owner` role keeps full access. The sidebar's
  Account section grows a "Security" link for everyone, and (admin
  only) an "Audit Log" link.
- Signup + register + change-password now require an uppercase letter,
  a number, and a special character on top of the 8-char minimum.
- Login gets a TOTP step-up challenge only for users who have explicitly
  enrolled MFA — everyone else logs in exactly as before.

---

## SESSION 12b — Vapi webhook receiver fix (2026-05-14)

### Why nothing was being logged after calls

`calls.id` is a Postgres `uuid PRIMARY KEY` (migration 001). Both the
existing Vapi webhook receiver (`/api/webhooks/vapi`) and the mid-call
`log_outcome` function (`/api/vapi/functions`) were trying to write
Vapi's `call_xxx` string identifier into that UUID column. Postgres
silently rejected the cast, so every upsert / update no-op'd and
nothing reached the database. Vapi was sending — the receiver was
dropping.

### What changed

1. **Migration `028_vapi_call_id.sql`** — adds
   `calls.vapi_call_id text` with a partial UNIQUE index (NULLs
   allowed for legacy rows). All Vapi-driven writes now key on this
   column. No data migration needed; existing rows stay untouched.

2. **`/api/webhooks/vapi/route.ts`** rewritten end-to-end:
   - Validates `VAPI_WEBHOOK_SECRET` via plain header
     (`x-vapi-secret` or `x-webhook-secret`), `Authorization: Bearer`,
     or HMAC-SHA256 (`x-vapi-signature`). When the env var is unset
     the route accepts unauthenticated requests so Donna's first
     probe doesn't 401 — set the secret before going live.
   - Looks up the business by `vapi_agent_id` column first, then
     `notifications_config->>'vapi_assistant_id'` as a fallback for
     legacy-wired clients. Unmatched assistants log a warning and
     return 200 (no Vapi retry storm).
   - Upserts the call row keyed on `vapi_call_id` — never tries to
     write a string into the UUID `id`.
   - Upserts contacts on `(client_id, phone)` using the post-008
     contacts shape (`client_id`, `last_seen`, `call_count`).
     Increments call_count for known callers, creates a new row for
     unknown ones.
   - Preserves the industry side-effect inserts (`jobs`,
     `appointments`, `orders`) using the canonical UUID `call_id`.
   - Always returns `{ received: true }` 200 on non-auth failures so
     Vapi doesn't retry; internal failures hit `console.error`.

3. **`/api/vapi/functions` `log_outcome`** — now upserts on
   `vapi_call_id` rather than updating by the UUID `id`. log_outcome
   and end-of-call-report can land in any order and merge into the
   same row. The `summary` parameter now writes to the dedicated
   `summary` column instead of being aliased onto `transcript`.

### Donna setup — REQUIRED before bots / Vapi can log

1. **Run migration 028** in the Supabase SQL editor (idempotent).
2. **Set Vercel env var `VAPI_WEBHOOK_SECRET`** to a random string
   (`openssl rand -hex 32`). Leaving it unset means the route accepts
   anonymous traffic.
3. **For every Vapi assistant**, in the Vapi dashboard → assistant →
   **Server URL** field, set:
   - URL: `https://app.talkmate.com.au/api/webhooks/vapi`
   - Server URL Secret: paste the same `VAPI_WEBHOOK_SECRET` value
     (Vapi sends it as `x-vapi-secret`).
   - Enable the `end-of-call-report` event (other events accepted
     too, but this is the one that persists the call).

   Assistants to update (audit in progress):
   - [ ] GM Towing
   - [ ] (other live assistants — fill in as Donna audits)

4. (Recommended) Verify by placing a test call to a configured
   assistant and confirming a row appears in `calls` with the
   expected `vapi_call_id`, `transcript`, and `recording_url`.

---

## SESSION 12 — Services fix + TalkMate Command (2026-05-14)

### Part A — Services fix (Settings + /catalog)

**The bug:** The Settings → AI Voice Agent tab and the /catalog page both
showed a read-only price list with "Contact us to update" for clients
whose pricing had been pre-configured by admin (e.g. GM Towing with 55
real prices). Clients couldn't edit their own data.

**The fix:**

1. **Settings → AI Voice Agent** — removed the gate that hid
   `ServicesEditor` when `notifications_config.services` had rows.
   `ServicesEditor` (`mode="client"`) is now always rendered; the
   read-only grouped list block was deleted.

2. **Backfill seed** — when `businesses.services` is empty but
   `notifications_config.services` has data, the Settings page
   transforms those rows into editable `Service[]` entries on load
   (custom rows, default unit "per job"). The seed is in-memory only;
   the rows persist to `businesses.services` on the first save.

3. **/catalog** — for clients whose `catalog_items` table is empty,
   the page now falls back to displaying `businesses.services` (or
   `notifications_config.services` as a legacy fallback) inside a
   read-only "These prices are managed in Agent Settings" panel with a
   button that deep-links to /settings. No "No services yet" for
   GM Towing.

**Source of truth going forward:** `businesses.services` is the single
editable source for towing-style pricing. The legacy
`notifications_config.services` is read only as a seed when
`businesses.services` is empty; admins should migrate clients to the
editor as they're touched.

**Admin Agent Setup tab:** already renders `ServicesEditor` in admin
mode (`edit-client-modal.tsx:633`); no change needed.

### Part B — TalkMate Command

Per-client Telegram + WhatsApp bots for towing Growth+ clients. Plain-
English commands parsed by Grok and executed against the dispatcher
schema. **Each client gets their own bot with their own token** —
total isolation between clients. Donna's existing OpenClaw bot
(`TELEGRAM_BOT_TOKEN`) is untouched.

#### Migration — `supabase/migrations/027_talkmate_command.sql`

New tables:
- `command_bots` — one row per client (UNIQUE on `client_id`). Holds
  Telegram token/username/chat_id and WhatsApp number assigned from
  the Twilio pool. RLS read scoped via `get_current_client_id()`.
- `command_history` — every parsed + executed command. RLS read
  scoped per client. Indexed for the recent-history view.
- `businesses.command_enabled` — feature gate. Flipped to TRUE by
  the bot auto-creator on towing Growth+ activation.

#### NEW env vars (Donna must set in Vercel before bots go live)

| Var | Purpose |
|---|---|
| `TELEGRAM_BOTFATHER_TOKEN` | **Reserved name** — present so deploy parity tooling sees it. Not actually used by the code path because BotFather can't be driven via the bot API (see "Manual bot creation" below). Safe to leave unset for now. |
| `TELEGRAM_WEBHOOK_SECRET` | **Required.** Random string shared with every per-client Telegram webhook. Generate with `openssl rand -hex 32` and paste into Vercel before flipping the first client live. |
| `TWILIO_WHATSAPP_POOL_NUMBER` | **Required for WhatsApp.** A Twilio WhatsApp-enabled number (E.164, no `whatsapp:` prefix) that gets assigned to new towing clients automatically on activation. Without this, clients still get a Telegram bot but no WhatsApp number. |
| `NEXT_PUBLIC_APP_URL` | Optional. Used to compute the per-client webhook URL when finalising a Telegram bot (`/api/admin/clients/[id]/command` PATCH). Falls back to `https://${VERCEL_URL}` then to the request origin. |
| `TWILIO_SKIP_SIGNATURE` | **Do not set in production.** Integration tests only. Skips Twilio signature validation on the WhatsApp webhook. |

#### Manual bot creation (REQUIRED — not optional)

The Telegram Bot API cannot drive BotFather. BotFather is itself a
bot, and only a *userbot* (a regular Telegram user account using
MTProto / TDLib) can create child bots. Spinning up a userbot in a
SaaS backend is not appropriate.

The shipped flow assumes manual creation:

1. **Client activation** — `POST /api/admin/clients/[id]/activate`
   automatically inserts a `pending` `command_bots` row for towing
   Growth+ clients, with a candidate name (`<Business> TalkMate`) and
   candidate username (`talkmate_<slug>_<4 digits>_bot`). It also
   sets `businesses.command_enabled = true` so the client's portal
   shows the /settings/command page even before the token is set.
2. **Donna creates the bot** in Telegram:
   - Open Telegram, message `@BotFather`.
   - `/newbot` → paste the candidate name when prompted.
   - Paste the candidate username when prompted (or pick another
     `talkmate_*_bot` if it's taken).
   - Copy the token BotFather returns.
3. **Donna pastes the token** into the admin Edit Client modal →
   **Command** tab → "Paste Telegram bot token" → Save. The PATCH
   endpoint verifies the token with `getMe`, saves it, and sets the
   webhook to
   `https://app.talkmate.com.au/api/command/telegram/<clientId>`
   with the `TELEGRAM_WEBHOOK_SECRET`.
4. The client opens Telegram and messages the bot. The first
   message pins their `chat_id` and triggers a welcome message.

#### Command behaviour — deviations from the brief

- **set_wait_time** writes to `dispatch_config.default_wait_minutes`,
  not `dispatch_config.wait_time_minutes`. The former is the field
  already read by `/api/vapi/functions` and the dispatch board, so
  the voice agent actually sees the updated wait when a client says
  "we're busy for 2 hours".
- **toggle_availability** writes
  `dispatch_config.accepting_jobs: boolean` rather than upserting to
  `driver_availability`. The brief's upsert was missing `driver_id`
  (the table is per-driver). A business-level flag is the right model
  for "stop taking jobs" / "back online"; the voice agent reads this
  flag to decide whether to accept new jobs.
- **Migration numbering** — the brief specifies `027` even though `025`
  is the latest committed migration. Honored as `027` so the brief and
  the file system match; `026` is reserved for a parallel session.

#### Vapi assistants — call-recording consent disclosure

The brief notes a separate audit of Vapi assistants that need the
call-recording consent disclosure added. **No code change in this
repo.** Donna to confirm:

- [ ] GM Towing — recording disclosure added
- [ ] (other live assistants — fill in as Donna audits)

---

## HOTFIX — Duplicate-owner DB guard + stronger phone-dup warnings (2026-05-12)

Prevents the same `auth.users` row ending up with two `businesses`
records — the underlying cause of the login-loop incident where a
"cancelled" client could still be hit by an active session pointing at
the old row.

### Migration — `supabase/migrations/025_businesses_owner_unique.sql`

Apply in the Supabase SQL editor **after** running the pre-flight
duplicate check below. Idempotent.

**Pre-flight (REQUIRED before applying):**

```sql
SELECT owner_user_id, COUNT(*)
FROM businesses
WHERE owner_user_id IS NOT NULL
GROUP BY owner_user_id
HAVING COUNT(*) > 1;
```

If any rows come back, **stop** and report them to Irfan — merge or
null out the stale rows manually before continuing. The migration's
`ADD CONSTRAINT … UNIQUE` will fail loudly on duplicates, which is the
desired safe-stop behaviour.

**Schema changes:**

1. `businesses.owner_user_id` — `NOT NULL` is dropped.
2. New CHECK constraint `owner_user_id_required_when_active`:
   `account_status IN ('cancelled', 'expired') OR owner_user_id IS NOT NULL`.
   Active rows still must have an owner; cancelled/expired can be
   nulled so a stale link can never strand a user.
3. New UNIQUE constraint `businesses_owner_user_id_unique` on
   `owner_user_id`. Postgres treats multiple NULLs as distinct, so any
   number of cancelled/expired rows can sit at NULL without colliding.

**Operational follow-up:** on cancellation, set `owner_user_id = NULL`
on the businesses row so the same auth user can sign up again later
without the unique constraint blocking them.

### UI changes — duplicate phone warning (admin modal + signup)

`/api/admin/clients/create` and `/api/auth/signup` now return
`existing_business_status` alongside `existing_business_name` on the
soft phone-duplicate 409 response. Both the admin **Create client**
modal (`src/app/(portal)/admin/clients/create-client-modal.tsx`) and
the public signup page (`src/app/signup/signup-client.tsx`) now show
a **red** warning banner (was amber) when a duplicate is detected:

- Header reads `⚠ WARNING: Duplicate phone number`.
- Body lists the existing business name **and status** and the
  consequence (login issues).
- **Create anyway** is disabled until the user types the literal
  word `CONFIRM` into a text field. Button is red when armed,
  greyed-out otherwise.

Trade-off: this adds friction for the rare legitimate case where one
owner runs two businesses on the same phone. That friction is
intentional — the typing gate stops a panicked second signup from
silently breaking a working login.

---

## SESSION 10 — Dispatcher system for towing businesses (2026-05-12)

Builds the full dispatcher system gated by `businesses.dispatch_enabled`
+ Growth-plan + `industry = 'towing'`. Driver directory, vehicle
registry with capability matching, weekly shift schedules, live
availability overrides, job queue with auto-assignment, capacity
manager with auto-calculated wait time, and three new Vapi functions
that let the agent make routing decisions mid-call.

Builds on top of Session 9 (`team_members` table, `/api/vapi/functions`
endpoint, call-outcome logging). Drivers optionally link back to a
`team_members` row so the same person doesn't get double-keyed when
they're also a transfer destination.

### Deviations from the brief (read before merging)

1. **`dispatch_jobs.call_log_id` → `call_id`** to match Session 9's
   convention (the canonical table is `calls`).
2. **Brief listed admin CRUD endpoints for vehicles / drivers / jobs.**
   Built only the admin dispatch-config GET/PATCH endpoint
   (`/api/admin/businesses/[id]/dispatch`). The admin Dispatcher tab is
   read-only with an enable-toggle and a summary; per-resource
   management lives in the client portal (impersonate to make changes).
   The CRUD admin endpoints can be added later if needed.
3. **`/dispatch/availability` calendar view scoped down.** A full
   calendar is overkill — the dispatch board's per-driver
   Available/On Job/Off buttons already provide the block-time
   functionality (each click inserts a `driver_availability` row).
4. **Job number generation.** The brief specifies a global sequence
   (`job_number_seq`). The Vapi-side function uses the sequence; the
   manual portal-side creation uses a `count(*) + 1` per-business
   counter to avoid burning sequence values on UI clicks. Both produce
   `JOB-XXXX` strings; uniqueness is enforced by the `job_number` UNIQUE
   constraint and the schema retries on conflict in the rare collision
   case.
5. **Migration auto-enables dispatch for existing towing Growth/Pro
   clients** (GM Towing, Hume Towing). Brief's manual UPDATE step is
   subsumed into the migration so a fresh run leaves nothing for the
   operator to do.

### Migration — `supabase/migrations/024_dispatcher_system.sql`

Run in the Supabase SQL editor after migration 023. Idempotent.

**New tables (all RLS-scoped via `client_id = get_current_client_id()`):**

| Table | Purpose |
|---|---|
| `vehicles` | Truck registry with `capabilities text[]` for job-type matching. GIN-indexed for fast `@>` lookups. |
| `drivers` | People who run the trucks. Optionally linked to `team_members.id`. |
| `driver_shifts` | Recurring weekly schedule. UNIQUE (driver_id, day_of_week). |
| `driver_availability` | Manual status overrides (available / on_job / unavailable / off_shift). Latest row wins. |
| `dispatch_jobs` | Job queue. UNIQUE job_number ("JOB-XXXX"). FK to calls. |

**businesses additions:** `dispatch_enabled boolean`, `dispatch_config jsonb`.

**`dispatch_config` JSONB shape:**

```json
{
  "job_types": ["car_tow","4wd_tow","container","machinery","motorcycle","van"],
  "default_wait_minutes": 45,
  "auto_wait_calculation": true,
  "max_concurrent_jobs": 5,
  "after_hours_dispatch": true,
  "overbooking_action": "queue" | "decline" | "waitlist"
}
```

**Auto-enable:** `UPDATE businesses SET dispatch_enabled = TRUE WHERE
industry = 'towing' AND plan IN ('growth','pro','professional')` runs
as part of the migration.

### Vapi function extensions (added to `/api/vapi/functions`)

Three new functions wired into the existing dispatcher endpoint:

| function | params | returns |
|---|---|---|
| `check_dispatch_availability` | `{ job_type, timing, scheduled_at? }` | `{ available, can_accept, available_driver?, wait_minutes?, wait_message, decline_reason? }` |
| `create_dispatch_job` | `{ job_type, timing, scheduled_at?, caller_name, caller_phone, pickup_address, dropoff_address?, vehicle_description?, notes?, call_id? }` | `{ job_id, job_number, assigned_driver?, confirmation_message, sms_sent }` |
| `get_job_types` | `{}` | `{ job_types: [{ type, label, vehicles_available }] }` |

`check_dispatch_availability` does the heavy lifting — matches the
job_type against `vehicles.capabilities` (using PG's `contains`
operator + the GIN index), finds drivers assigned to those vehicles,
filters to drivers currently on shift (day_of_week + time-of-day in
the business's timezone), removes anyone with an active "on_job" or
"unavailable" availability override, and computes wait time from
`(active_jobs / capable_vehicles) × default_wait_minutes` when
auto-calc is on. Returns a friendly `wait_message` the agent can
read verbatim plus a structured `decline_reason` when no capable
vehicle exists.

`create_dispatch_job` auto-assigns to the first available driver if
`timing='now'` and one is free; otherwise inserts as `pending` for
the dispatcher to handle. Fires `MAKE_DISPATCH_JOB_WEBHOOK`
fire-and-forget so the function returns inside Vapi's 3 s budget.
The Vapi call's `booking_id` and `outcome='booking_created'` columns
get updated when `call_id` is provided — same pattern as Session 9
bookings.

### Vapi assistant system prompt (towing agents only)

Append to towing-industry assistants only:

```
--- DISPATCHER RULES (TOWING) ---

JOB TYPE IDENTIFICATION:
At the start of every towing call, identify the job type by asking:
"What type of vehicle needs to be towed?" or
"What are we working with today?"
Match their answer to one of our job types using get_job_types.

TIMING:
Always ask: "Do you need a truck right now, or is this a pre-booking
for a specific time?"

AVAILABILITY CHECK:
Use check_dispatch_availability with the job type and timing BEFORE
taking any job details. If no capable vehicle is available, tell the
caller honestly: "We don't have a [job type] truck available right
now. [wait_message]." Then offer the overbooking action.

JOB ACCEPTANCE:
Only use create_dispatch_job after confirming availability. Always
collect: caller name, callback number, pickup address, vehicle
make/model/colour, and any special notes.

JOB CONFIRMATION:
Always read back the job details before ending:
"Just to confirm — [name], picking up a [vehicle description] from
[address]. [Driver name] will be with you in approximately
[wait time]. Is that correct?"

PRE-BOOKINGS:
For scheduled jobs, confirm the date, time, and all details. Tell
the caller: "I've logged your pre-booking for [date/time]. You'll
receive a confirmation SMS shortly."
```

### API routes added

Portal:
```
GET    /api/portal/vehicles
POST   /api/portal/vehicles
PATCH  /api/portal/vehicles/[id]
DELETE /api/portal/vehicles/[id]
GET    /api/portal/drivers
POST   /api/portal/drivers
PATCH  /api/portal/drivers/[id]
DELETE /api/portal/drivers/[id]
PATCH  /api/portal/drivers/[id]/status     # insert availability override
GET    /api/portal/drivers/[id]/shifts
POST   /api/portal/drivers/[id]/shifts     # replace whole weekly schedule
GET    /api/portal/dispatch/jobs           # ?status=&from=
POST   /api/portal/dispatch/jobs           # manual job creation
PATCH  /api/portal/dispatch/jobs/[id]
POST   /api/portal/dispatch/jobs/[id]/assign
POST   /api/portal/dispatch/jobs/[id]/complete
POST   /api/portal/dispatch/jobs/[id]/cancel
GET    /api/portal/dispatch/config
PATCH  /api/portal/dispatch/config
```

Plus the 3 Vapi function extensions on the existing
`/api/vapi/functions` dispatcher.

Admin:
```
GET    /api/admin/businesses/[id]/dispatch
PATCH  /api/admin/businesses/[id]/dispatch
```

### UI added

**Client portal:**
- `/dispatch` — three-column dispatcher board (drivers / job queue /
  capacity & wait time). Per-driver Available/On Job/Off buttons,
  per-job Assign/Complete/Cancel buttons, inline wait-time override,
  Add-job modal, Assign-driver modal. Plan-gated: Starter sees an
  upgrade prompt; non-towing industries see a "not for your industry"
  notice; towing-but-not-yet-enabled sees a "being set up" message.
- `/dispatch/drivers` — driver list + add/edit modal that includes the
  weekly shift schedule (7-day toggleable grid).
- `/dispatch/vehicles` — vehicle cards with capability chips +
  add/edit modal with a 7-capability checkbox grid.
- `/settings/dispatch` — five config sections (Job types, Overbooking,
  Wait time, After-hours, Concurrency limit).

**Sidebar:** new "Dispatch" section with 4 entries
(`/dispatch`, `/dispatch/drivers`, `/dispatch/vehicles`,
`/settings/dispatch`). Only renders when
`businesses.dispatch_enabled = true` (threaded through
`(portal)/layout.tsx` → `PortalShell` → `PortalSidebar`).

**Admin edit-client modal:** new "Dispatcher" tab — enable/disable
toggle, summary counts (vehicles / drivers / active jobs),
`dispatch_config` summary. Goes from 7 → 8 tabs total.

### Environment variables

```
MAKE_DISPATCH_JOB_WEBHOOK=   # Donna creates: SMS caller + SMS driver + Telegram Irfan
```

Optional — `create_dispatch_job` fires this fire-and-forget; if the
URL is blank the function still creates the job (returns
`sms_sent: false`).

`VAPI_WEBHOOK_SECRET` from Session 9 already gates this endpoint.

### Pre-merge checklist

1. **Run migration 024** in Supabase SQL editor (after 023).
2. **Verify the auto-update**:
   ```sql
   SELECT name, plan, dispatch_enabled FROM businesses
     WHERE industry = 'towing';
   ```
   GM Towing and Hume Towing on Growth/Pro should now show
   `dispatch_enabled = TRUE`.
3. **Set env var on Vercel**: `MAKE_DISPATCH_JOB_WEBHOOK` (leave blank
   until Donna's Make.com scenario exists).
4. **Donna**:
   - Build the Make.com "TalkMate Dispatch Job" scenario:
     trigger: `MAKE_DISPATCH_JOB_WEBHOOK`; actions: SMS to caller with
     ETA + job number, SMS to assigned driver with pickup + caller,
     Telegram to Irfan with full job summary.
   - Append the towing dispatcher system-prompt block to GM Towing and
     Hume Towing assistants (and any future towing client). Configure
     the function list with `check_dispatch_availability`,
     `create_dispatch_job`, `get_job_types`.
   - In GM Towing's portal, add their vehicles with capabilities
     (e.g. Truck 1: car_tow + 4wd_tow), add drivers with shift
     schedules, set dispatch config (job types accepted, default wait,
     overbooking action).
   - End-to-end test: call the agent, ask for a tow, verify
     `check_dispatch_availability` runs, `create_dispatch_job` inserts
     a row, SMS fires.

### Files changed

```
supabase/migrations/024_dispatcher_system.sql                          (new)
src/app/api/vapi/functions/route.ts                                    (extended: 3 new functions)
src/app/api/portal/vehicles/route.ts                                   (new)
src/app/api/portal/vehicles/[id]/route.ts                              (new)
src/app/api/portal/drivers/route.ts                                    (new)
src/app/api/portal/drivers/[id]/route.ts                               (new)
src/app/api/portal/drivers/[id]/status/route.ts                        (new)
src/app/api/portal/drivers/[id]/shifts/route.ts                        (new)
src/app/api/portal/dispatch/jobs/route.ts                              (new)
src/app/api/portal/dispatch/jobs/[id]/route.ts                         (new)
src/app/api/portal/dispatch/jobs/[id]/assign/route.ts                  (new)
src/app/api/portal/dispatch/jobs/[id]/complete/route.ts                (new)
src/app/api/portal/dispatch/jobs/[id]/cancel/route.ts                  (new)
src/app/api/portal/dispatch/config/route.ts                            (new)
src/app/api/admin/businesses/[id]/dispatch/route.ts                    (new)
src/app/(portal)/dispatch/page.tsx + dispatch-board.tsx                (new)
src/app/(portal)/dispatch/drivers/page.tsx + drivers-view.tsx          (new)
src/app/(portal)/dispatch/vehicles/page.tsx + vehicles-view.tsx        (new)
src/app/(portal)/settings/dispatch/page.tsx + dispatch-settings-view.tsx (new)
src/app/(portal)/admin/clients/admin-dispatcher-tab.tsx                (new)
src/app/(portal)/admin/clients/edit-client-modal.tsx                   (+1 tab)
src/components/portal/sidebar.tsx                                      (+1 nav section, 4 entries)
src/components/portal/portal-shell.tsx                                 (+hasDispatch prop)
src/app/(portal)/layout.tsx                                            (select dispatch_enabled, pass through)
DEPLOYMENT.md                                                          (this section)
```

`npm run build` — clean, 17 new routes registered (14 dispatch API + 4
dispatch pages, minus any overlap), 3 Vapi function extensions live.

---

## SESSION 9 — Core receptionist features (2026-05-12)

Builds the full receptionist feature set across all 13 industries: team
directory, VIP caller recognition, after-hours routing, missed-transfer
fallback, emergency detection, bookings queue, callbacks queue, knowledge
base FAQ, SMS follow-up template, repeat-caller flagging, and a
Vapi-callable functions endpoint that ties them together at call time.

Builds on Session 6 (`account_status`, `trial_*` columns) and Session 8
(self-serve signup). No earlier session's data is touched.

### Deviations from the brief (read before merging)

1. **Brief writes `call_logs`; our canonical table is `calls`.** All
   column additions target `calls`. The brief listed `outcome` as a new
   column to add, but `calls.outcome` has existed since migration 001 —
   we only add the new outcome-metadata columns
   (`transfer_to`, `transfer_success`, `is_repeat_caller`,
   `is_vip_caller`, `booking_id`, `callback_id`).
2. **Existing `account_status` value enum is enforced application-side**
   on `calls.outcome`. The brief listed specific outcome values; we
   don't add a CHECK constraint because legacy rows may carry older
   strings and we don't want a backfill blocker. The application emits
   the canonical set.
3. **`bookings.call_id` not `bookings.call_log_id`.** The brief used
   `call_log_id`; we use `call_id` because our table is `calls`. Same
   for `callbacks.call_id`.
4. **Vapi functions auth.** The brief asked for an
   `VAPI_WEBHOOK_SECRET` header check; the existing
   `/api/webhooks/vapi` route uses HMAC signature instead. Functions
   endpoint at `/api/vapi/functions` uses a static-secret header
   pattern (`x-vapi-secret: <secret>` or `Authorization: Bearer <secret>`)
   because Vapi's function-call config supports custom headers but not
   request-body signing. If `VAPI_WEBHOOK_SECRET` is unset the
   endpoint allows calls (dev). Production operators must set it.
5. **Plan-gating implementation.** Migration 023 auto-flips
   `call_transfer_enabled = true` for existing Growth/Pro businesses.
   The Starter-plan downgrade path (if we ever build it) must clear
   that flag.
6. **Settings route.** Brief asked for `/settings/routing` as a
   sub-route under Settings. Existing `/settings` is a single
   tab-driven page (not sub-routed) — we added `/settings/routing` as
   its own page rather than refactor the whole settings surface. Both
   live in the nav.
7. **Admin endpoint paths.** Brief uses `/api/admin/businesses/[id]/…`.
   Earlier admin routes live at `/api/admin/clients/[id]/…`. Session 9
   uses the brief's path; the older convention stays untouched. Worth
   harmonizing in a follow-up but not breaking.

### Migration — `supabase/migrations/023_receptionist_features.sql`

Run in Supabase SQL editor after migration 022. Idempotent.

**New tables:**

| Table | Purpose | FK to businesses |
|---|---|---|
| `team_members` | Names + phones + roles for live transfer routing | `client_id` |
| `vip_callers` | Phones that get priority handling on inbound calls | `client_id` |
| `bookings` | Appointments / jobs / quotes captured by the agent | `client_id` |
| `callbacks` | Caller asked to be called back at a specific time | `client_id` |

All four use `client_id` (matching the migration-008 CRM convention)
and RLS policy `client_id = get_current_client_id()` for full-table
client scoping.

A **partial unique index** on `team_members(client_id) WHERE
is_escalation_contact = true` enforces "at most one escalation contact
per business" at the database level so the API doesn't have to do a
read-modify-write to maintain the invariant.

**businesses additions:** `escalation_config` (JSONB, see shape below),
`knowledge_base` (text), `call_transfer_enabled` (boolean, auto-set to
true for existing Growth/Pro rows by the migration).

**calls additions:** `transfer_to`, `transfer_success`,
`is_repeat_caller`, `is_vip_caller`, `booking_id` (FK to bookings),
`callback_id` (FK to callbacks).

**`escalation_config` JSONB shape:**

```json
{
  "after_hours_enabled": true,
  "after_hours_action": "take_message" | "transfer_to_escalation" | "voicemail",
  "missed_transfer_action": "take_message" | "try_next_member" | "callback",
  "wait_time_minutes": 30,
  "emergency_keywords": ["emergency", "flooding", ...],
  "emergency_action": "transfer_escalation" | "call_000" | "take_message",
  "sms_followup_enabled": true,
  "sms_followup_template": "Hi {name}, ...",
  "repeat_caller_threshold": 3,
  "repeat_caller_notify": true
}
```

### `/api/vapi/functions` — the agent's brain

One POST endpoint, six functions selected via `function_name` in the
body. Auth: `x-vapi-secret: $VAPI_WEBHOOK_SECRET` header (or
`Authorization: Bearer $VAPI_WEBHOOK_SECRET`). Latency budget: 3 s.
All DB calls go through the service-role admin client.

| function | params | returns |
|---|---|---|
| `check_caller` | `{ phone }` | `{ is_vip, vip_*, is_existing, existing_name, call_count, is_repeat }` |
| `get_team` | `{ query? }` | `{ transfer_enabled, team[], escalation_contact }` (+ optional `agent_instruction` when transfer is disabled) |
| `get_wait_time` / `get_availability` | `{}` | `{ wait_minutes, message }` |
| `log_outcome` | `{ call_id, outcome, transfer_to?, transfer_success?, summary? }` | `{ logged }` |
| `create_booking` | `{ caller_name, caller_phone, booking_type, service_requested, preferred_date?, preferred_time?, notes?, call_id? }` | `{ booking_id, confirmation_message }` |
| `schedule_callback` | `{ caller_name, caller_phone, preferred_time?, reason?, call_id? }` | `{ callback_id, confirmation_message }` |

**Plan gating** lives inside `get_team`: when `businesses.plan === 'starter'`
or `call_transfer_enabled === false`, the response includes
`transfer_enabled: false` and an `agent_instruction` telling the agent
to take a message instead of attempting a transfer.

**Booking/callback hooks fire optional Make.com webhooks** —
`MAKE_BOOKING_WEBHOOK` and `MAKE_CALLBACK_WEBHOOK` — fire-and-forget so
the function-call response stays under the 3 s latency budget. Both are
optional; missing URLs no-op silently.

### Vapi assistant system prompt additions (Donna applies manually)

Append to every existing assistant's system prompt:

```
--- CALL HANDLING RULES ---

CALLER IDENTIFICATION:
At the start of every call, use the check_caller function with the
caller's phone number. If they are a VIP caller, follow the VIP action
immediately. If they are an existing contact, greet them by name:
"Hi [name], thanks for calling [business]."

EMERGENCY DETECTION:
If the caller uses any emergency keywords, use the get_team function to
get the escalation contact and attempt an immediate transfer. Do not
take a message for genuine emergencies.

TEAM ROUTING:
When a caller asks for a specific person by name or department, use
get_team. Match their request to the closest team member and announce
the transfer: "Let me put you through to [name] in [department] now."

TRANSFER ANNOUNCEMENT:
Always tell the caller before transferring: "I'm going to connect you
with [name] now. Please hold for just a moment."

MISSED TRANSFER:
If a transfer is not answered, follow the missed_transfer_action in
your settings. Default: "I wasn't able to reach [name] right now. Can
I take a message and have them call you back?"

BOOKINGS:
When a caller wants to make a booking or appointment, use the
create_booking function. Always confirm: name, phone number, what they
need, and preferred date/time. Read back the booking details before
ending the call.

CALLBACKS:
If a caller cannot speak now but wants a callback, use the
schedule_callback function. Ask for their preferred time.

CALL OUTCOME:
At the end of every call, use the log_outcome function to record what
happened.

WAIT TIME:
If asked about wait times, use the get_wait_time function for the
current estimate.

AFTER-HOURS:
If the call comes in outside business hours, follow the
after_hours_action in your settings.
```

Each assistant needs `VAPI_WEBHOOK_SECRET` configured in the function
header settings; Donna generates a secure random string for it.

### API routes added (17 total)

Portal (RLS-scoped via the user session):
```
GET    /api/portal/team
POST   /api/portal/team
PATCH  /api/portal/team/[id]
DELETE /api/portal/team/[id]
GET    /api/portal/vip-callers
POST   /api/portal/vip-callers
PATCH  /api/portal/vip-callers/[id]
DELETE /api/portal/vip-callers/[id]
GET    /api/portal/bookings        # ?status=pending|confirmed|...
PATCH  /api/portal/bookings/[id]
POST   /api/portal/bookings/[id]/confirm    # fires MAKE_BOOKING_WEBHOOK
GET    /api/portal/callbacks       # ?status=pending|completed
PATCH  /api/portal/callbacks/[id]
GET    /api/portal/settings/escalation
PATCH  /api/portal/settings/escalation
POST   /api/vapi/functions         # the six-function dispatcher
```

Admin (service-role + requireAdmin guard, scoped by path):
```
GET    /api/admin/businesses/[id]/team
POST   /api/admin/businesses/[id]/team
PATCH  /api/admin/businesses/[id]/team/[memberId]
DELETE /api/admin/businesses/[id]/team/[memberId]
GET    /api/admin/businesses/[id]/vip-callers
POST   /api/admin/businesses/[id]/vip-callers
GET    /api/admin/businesses/[id]/bookings    # returns bookings + callbacks
PATCH  /api/admin/businesses/[id]/bookings/[bookingId]
GET    /api/admin/businesses/[id]/escalation
PATCH  /api/admin/businesses/[id]/escalation
```

### UI added

**Client portal (5 pages):**
- `/team` — table + add/edit modal, escalation badge, active toggle.
- `/vip-callers` — phone, action, optional team-member target.
- `/bookings` — Pending / Confirmed / All tabs, confirm-with-SMS modal, notes modal.
- `/callbacks` — Pending / Completed tabs.
- `/settings/routing` — six config sections (after-hours, missed-transfer, emergency, wait-time, SMS follow-up, repeat-caller alerts) + knowledge-base textarea. Industry-aware emergency-keyword defaults and medical-aware emergency-action options.

**Sidebar nav:** new "Receptionist" section with the four queue pages.
"Call Routing" added under "Your Agent".

**Dashboard (`dashboard-client.tsx`):** new `<ReceptionistStats>`
component above the existing stats — two click-through stat cards
(pending bookings, pending callbacks) and a "Recent outcomes" panel
showing the last 5 calls with outcome badges (Message taken,
Transferred, Booking created, …). VIP / Repeat badges surface on
matching calls.

**Admin edit-client modal:** three new tabs (Team, Call Routing,
Bookings) wired to the matching admin endpoints. The modal grew from
4 → 7 tabs total.

### Environment variables

Add as placeholders on Vercel Production:

```
VAPI_WEBHOOK_SECRET=    # static bearer secret for /api/vapi/functions auth
MAKE_BOOKING_WEBHOOK=   # Donna creates: booking confirmation SMS via Twilio
MAKE_CALLBACK_WEBHOOK=  # Donna creates: callback reminder
```

The functions endpoint **allows unauthenticated calls in dev when
`VAPI_WEBHOOK_SECRET` is unset**. Production operators MUST set it.

### Pre-merge checklist

1. **Run migration 023** in the Supabase SQL editor (after 021 + 022
   from Sessions 6 and 8).
2. **Confirm Growth/Pro businesses got `call_transfer_enabled = true`**:
   ```sql
   SELECT name, plan, call_transfer_enabled FROM businesses
     WHERE plan IN ('growth', 'pro', 'professional');
   ```
3. **Set env vars on Vercel Production**:
   - `VAPI_WEBHOOK_SECRET` — generate a secure random string
     (Donna will paste the same value into each Vapi assistant's
     function-call header config).
   - `MAKE_BOOKING_WEBHOOK` and `MAKE_CALLBACK_WEBHOOK` — leave blank
     until Donna's scenarios are built.
4. **Donna: append Vapi prompt additions** to every existing assistant
   (Hume Towing, Burleigh British Chippey, STR Group, Merlin's Pizza,
   GM Towing, plus any Session 8 trial signups). Configure the function
   list to call `/api/vapi/functions` with the six function names above.
5. **Smoke test the queue UIs** in a freshly-impersonated client portal:
   add a team member, add a VIP, mark a booking confirmed (verify the
   webhook fires if configured), mark a callback complete.

### Files changed

```
supabase/migrations/023_receptionist_features.sql                                (new)
src/app/api/vapi/functions/route.ts                                              (new)
src/app/api/portal/team/route.ts                                                 (new)
src/app/api/portal/team/[id]/route.ts                                            (new)
src/app/api/portal/vip-callers/route.ts                                          (new)
src/app/api/portal/vip-callers/[id]/route.ts                                     (new)
src/app/api/portal/bookings/route.ts                                             (new)
src/app/api/portal/bookings/[id]/route.ts                                        (new)
src/app/api/portal/bookings/[id]/confirm/route.ts                                (new)
src/app/api/portal/callbacks/route.ts                                            (new)
src/app/api/portal/callbacks/[id]/route.ts                                       (new)
src/app/api/portal/settings/escalation/route.ts                                  (new)
src/app/api/admin/businesses/[id]/team/route.ts                                  (new)
src/app/api/admin/businesses/[id]/team/[memberId]/route.ts                       (new)
src/app/api/admin/businesses/[id]/vip-callers/route.ts                           (new)
src/app/api/admin/businesses/[id]/bookings/route.ts                              (new)
src/app/api/admin/businesses/[id]/bookings/[bookingId]/route.ts                  (new)
src/app/api/admin/businesses/[id]/escalation/route.ts                            (new)
src/app/(portal)/team/page.tsx + team-view.tsx                                   (new)
src/app/(portal)/vip-callers/page.tsx + vip-view.tsx                            (new)
src/app/(portal)/bookings/page.tsx + bookings-view.tsx                          (new)
src/app/(portal)/callbacks/page.tsx + callbacks-view.tsx                         (new)
src/app/(portal)/settings/routing/page.tsx + routing-view.tsx                    (new)
src/app/(portal)/admin/clients/admin-feature-tabs.tsx                            (new)
src/lib/portal-auth.ts                                                           (new)
src/components/portal/receptionist-stats.tsx                                     (new)
src/components/portal/sidebar.tsx                                                (+5 nav entries)
src/app/(portal)/admin/clients/edit-client-modal.tsx                             (+3 tabs)
src/app/(portal)/dashboard/dashboard-client.tsx                                  (mount ReceptionistStats)
DEPLOYMENT.md                                                                    (this section)
```

`npm run build` — clean, 17 new routes registered, 5 new pages
prerendered.

---

## SESSION 8 — Self-serve signup (2026-05-11)

Adds a public-facing self-serve signup flow at
**app.talkmate.com.au/signup** so website visitors can choose a plan,
fill in their details, and either start a 7-day free trial or pay now
via Stripe — all without Irfan's involvement.

Builds on Session 6 (trial-mode column infrastructure) and the matching
Session 8 website CTA changes in talkmate-website (see that repo's
DEPLOYMENT.md).

### Deviations from the brief (read before merging)

1. **`pending_payment` requires a migration.** The brief said no
   migration was needed for this column, but Session 6 left the
   `account_status` CHECK constraint restricted to a six-value
   allow-list. Writing `'pending_payment'` would fail the constraint
   and every "Pay now" signup would 500. Migration 022 widens the
   CHECK to include `'pending_payment'`. Idempotent.
2. **Existing `/signup` stub replaced.** The repo had a `src/app/signup/page.tsx`
   that did `redirect('/register')`. The Session 8 signup flow is a full
   page in its own right, so the stub is gone. The old `/register`
   page (in the `(auth)` group) is untouched — it's still the
   minimal-form fallback we wired to the verify-email flow.
3. **Industry taxonomy.** The brief's 13-item industry list is now the
   canonical user-facing list on signup. Each value maps to an existing
   `business_type` value (`hospitality`, `trades`, `medical`, …) for
   downstream compatibility with the dashboard / catalog / call-handling
   modules — mapping is in
   `src/app/api/auth/signup/route.ts` (`INDUSTRY_TO_BUSINESS_TYPE`).
4. **Email-availability check.** `/api/auth/check-email` scans the first
   200 auth users with `auth.admin.listUsers`. Good enough for our
   signup volume — past ~tens of thousands of accounts we should
   replace with a proper RPC or a Supabase auth query helper.
5. **Webhook is best-effort.** `MAKE_NEW_SIGNUP_WEBHOOK` is optional —
   if the env var is blank, signup completes silently without firing
   anything. Donna's Telegram nudge becomes a no-op until she sets the
   URL on Vercel.

### Migration — `supabase/migrations/022_pending_payment_status.sql`

Run in the Supabase SQL editor after migration 021 (Session 6).
Idempotent.

```sql
alter table businesses drop constraint if exists businesses_account_status_check;
alter table businesses add constraint businesses_account_status_check
  check (account_status in ('trial', 'active', 'pending', 'pending_payment',
                             'expired', 'suspended', 'cancelled'));
```

### API routes added

| Route | Method | Auth | Purpose |
|---|---|---|---|
| `/api/auth/signup` | POST | none (public) | Creates auth user + business row. Body: `{ email, password, full_name, business_name, phone, industry, plan, signup_type }`. Returns `{ success, redirect_url }`. |
| `/api/auth/check-email` | GET | none (public) | Real-time email-availability check for the signup form. Query: `?email=`. Returns `{ available: boolean }`. |

The signup route fires `MAKE_NEW_SIGNUP_WEBHOOK` after a successful
insert (best-effort — failures are logged but don't block the response).

**Routing**: trial signups respond with `redirect_url: '/dashboard'`;
pay-now signups respond with the appropriate Stripe payment link
(`STRIPE_STARTER_LINK` / `_GROWTH_LINK` / `_PRO_LINK`) with
`?prefilled_email=` appended so Stripe's hosted checkout pre-fills the
customer's email.

### Make.com webhook payload (`MAKE_NEW_SIGNUP_WEBHOOK`)

```json
{
  "trigger": "new_signup",
  "timestamp": "2026-05-11T10:00:00Z",
  "signup_type": "trial",
  "business": {
    "id": "uuid",
    "business_name": "Gold Coast Locksmiths",
    "owner_name": "Dave Smith",
    "email": "dave@gclocksmiths.com.au",
    "phone": "0412345678",
    "industry": "trades",
    "plan": "starter",
    "account_status": "trial",
    "trial_end_date": "2026-05-18T10:00:00Z"
  }
}
```

`trial_end_date` is `null` for `signup_type: 'pay_now'`.

### Page — `src/app/signup/page.tsx` + `signup-client.tsx`

Public, lives at `/signup` (root, outside the `(portal)` auth-gated
route group). Two columns on desktop, stacked on mobile.

- **Left**: three plan cards. Default selection Growth (most-popular).
  `/signup?plan=starter|growth|pro` pre-selects from the URL.
- **Right**: signup form (Full name → Business name → Email → Phone →
  Password → Industry) with the Trial / Pay-now choice and submit
  button. Email field has a 500ms-debounced live availability check
  against `/api/auth/check-email`; renders "Already registered" with a
  log-in link when taken.

Trial submissions sign the user in (`signInWithPassword` from the
browser Supabase client) before redirecting so the dashboard lands
authenticated. Pay-now submissions navigate to the Stripe payment link.

Middleware (`src/middleware.ts`) was **not changed** — `/signup` is
neither in `protectedPaths` nor in `guestOnlyPaths`, so anyone can hit
it. A signed-in user who navigates there can still create a second
account under a different email (different auth user, different
business). If we want to lock that down later, add `/signup` to
`guestOnlyPaths` so authenticated visitors get redirected to
`/dashboard`.

### Environment variables

Already set from earlier sessions: `STRIPE_STARTER_LINK`,
`STRIPE_GROWTH_LINK`, `STRIPE_PRO_LINK`, `SUPABASE_SERVICE_ROLE_KEY`,
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

**Add to Vercel Production (Session 8)**:

```
MAKE_NEW_SIGNUP_WEBHOOK=   # Donna fills in after building the Make.com scenario
```

Blank is fine — signup still works, the webhook silently no-ops.

### Files changed

```
supabase/migrations/022_pending_payment_status.sql   (new)
src/app/api/auth/signup/route.ts                     (new)
src/app/api/auth/check-email/route.ts                (new)
src/app/signup/page.tsx                              (replaced redirect-stub with real page)
src/app/signup/signup-client.tsx                    (new)
DEPLOYMENT.md                                        (this section)
```

### Pre-merge checklist

1. Run **migration 022** in the Supabase SQL editor (after migration 021
   from Session 6 has been applied).
2. Add `MAKE_NEW_SIGNUP_WEBHOOK` env var to Vercel Production (leave
   blank if Donna hasn't built the scenario yet).
3. Smoke test: visit `https://app.talkmate.com.au/signup` in an
   incognito window, sign up as a trial user with a test email, confirm:
   - businesses row created with `account_status='trial'`,
     `trial_start_date`/`trial_end_date` set, correct plan + industry
   - users row created with role='owner'
   - onboarding_responses row created
   - Auto-login lands on `/dashboard` with the trial banner showing
     "7 days remaining"
4. Then test pay-now: sign up choosing Pay now, confirm:
   - businesses row has `account_status='pending_payment'`
   - Browser redirected to the Stripe payment link with
     `?prefilled_email=` in the URL
5. Existing client logins via `/login` continue to work — no regression
   on Hume Towing, Burleigh British Chippey, STR Group, Merlin's Pizza.

---

## SESSION 6 — Trial mode + auto agent brief (2026-05-11)

Adds a 7-day free trial lifecycle on top of the existing admin lifecycle
model, plus a "Mark onboarding complete and brief Donna" admin action
that fires a Make.com webhook with the full business record so Donna can
auto-build the Vapi agent without a manual handover.

### Deviations from the brief (read before merging)

1. **No `/admin/clients/[id]` page exists.** Admin client management is
   modal-based (`edit-client-modal.tsx`). The "Trial and Billing" section
   the brief wants "above the tabs" is rendered as `<TrialManagementPanel>`
   between the modal header and the tab strip, and the "Mark onboarding
   complete and brief Donna" button is rendered at the bottom of the
   existing Agent Setup tab. Functionally identical to the brief.
2. **Schema column names differ from the brief's wire payload.** Our
   `businesses` table uses `name` (not `business_name`), `phone_number`
   (not `phone`), and `opening_hours` (not `trading_hours`). The
   onboarding-complete webhook handler does the translation in one place
   (`src/app/api/admin/clients/[id]/onboarding-complete/route.ts`) so
   Donna's Make.com scenario consumes the exact keys the brief specifies.
3. **`onboarding_complete` is a NEW column distinct from
   `onboarding_completed`.** The existing `onboarding_completed`
   (migration 001) tracks whether the client finished the self-onboarding
   wizard. Session 6's `onboarding_complete` is set by the admin to
   indicate "all info captured, brief Donna." Two boolean columns,
   intentionally.
4. **`account_status` CHECK constraint was widened, not redefined.**
   Migration 011 set it to `('active', 'pending', 'suspended', 'cancelled')`.
   Session 6 drops and recreates the constraint as
   `('trial', 'active', 'pending', 'expired', 'suspended', 'cancelled')`
   so existing values are preserved unchanged.

### Migration — `supabase/migrations/021_trial_mode.sql`

Run in the Supabase SQL editor. Idempotent.

Adds these columns to `businesses`:

| Column | Type | Default | Purpose |
|---|---|---|---|
| `trial_start_date` | timestamptz | NULL | When the trial began |
| `trial_end_date` | timestamptz | NULL | When the trial ends (or ended) |
| `trial_converted_at` | timestamptz | NULL | When the trial converted to paid |
| `onboarding_complete` | boolean | false | Admin "ready to brief Donna" flag |
| `onboarding_complete_at` | timestamptz | NULL | When the brief Donna webhook fired |

Plus widens the `account_status` CHECK constraint to include `'trial'`
and `'expired'`, and backfills any NULL/empty `account_status` rows to
`'active'`.

A partial index `idx_businesses_trial_end_date` covers
`account_status = 'trial'` so the cron jobs scan only the active-trial
slice.

### API routes added

All under `src/app/api/`:

| Route | Method | Auth | Purpose |
|---|---|---|---|
| `/api/admin/clients/[id]/start-trial` | POST | admin | Sets `account_status='trial'`, stamps start + 7-day end, sets `plan`. Body: `{ plan: 'starter' \| 'growth' \| 'pro' }` |
| `/api/admin/clients/[id]/convert-trial` | POST | admin | Sets `account_status='active'`, stamps `trial_converted_at`. Body: `{ plan }`. Stripe link sent manually. |
| `/api/admin/clients/[id]/extend-trial` | POST | admin | Adds 3 days to `trial_end_date`. Works on `trial` and `expired` accounts. |
| `/api/admin/clients/[id]/end-trial` | POST | admin | Sets `account_status='expired'` immediately. |
| `/api/admin/clients/[id]/reactivate-trial` | POST | admin | Restarts a 7-day trial on an expired account. |
| `/api/admin/clients/[id]/onboarding-complete` | POST | admin | Sets `onboarding_complete=true`, fires `MAKE_AGENT_BRIEF_WEBHOOK`. Webhook failure does NOT roll back the flag. |
| `/api/portal/trial-status` | GET | client | Returns `account_status`, trial dates, `days_remaining`, `plan`. Used by client UI. |

Every admin action also writes a `client_comms_log` entry so the
History tab in the edit modal shows the trail.

### Cron routes added (and registered in `vercel.json`)

| Path | Schedule (UTC) | AEST | Purpose |
|---|---|---|---|
| `/api/cron/expire-trials` | `0 22 * * *` | 8 am | Flips trials whose end date has passed to `'expired'`, fires `MAKE_TRIAL_EXPIRED_WEBHOOK` |
| `/api/cron/trial-reminders` | `0 23 * * *` | 9 am | Finds trials ending within the next 24h, fires `MAKE_TRIAL_REMINDER_WEBHOOK` |

Both use `verifyCron(req)` (Bearer `CRON_SECRET`). Both are best-effort
on the webhook fire — a failed webhook is logged in the JSON response
but does not retry or roll back the DB state.

### Make.com webhook payloads

Donna's scenarios receive exactly these shapes. Don't change them
without updating Donna's Make.com modules in lock-step.

**Auto agent brief** (fired by admin button on the Agent Setup tab):

```json
{
  "trigger": "onboarding_complete",
  "timestamp": "2026-05-11T10:00:00Z",
  "business": {
    "id": "uuid",
    "business_name": "Gold Coast Locksmiths",
    "industry": "trades",
    "trade_type": "locksmith",
    "plan": "starter",
    "account_status": "trial",
    "phone": "0412345678",
    "address": "123 Main St, Surfers Paradise QLD 4217",
    "service_area": null,
    "trading_hours": { "monday": { "open": "08:00", "close": "17:00" }, "...": "..." },
    "services": [ { "name": "Emergency lockout (residential)", "price": "120", "unit": "per job", "enabled": true } ],
    "escalation_name": null,
    "escalation_phone": null,
    "notifications_config": {}
  }
}
```

Some keys (`service_area`, `escalation_name`, `escalation_phone`) are
nulled out because they don't exist as top-level columns on the
`businesses` table — they live inside `notifications_config`. If
Donna's scenario needs them, pull them from that JSON blob instead.

**Trial day-6 reminder** (cron):

```json
{
  "trigger": "trial_day_6_reminder",
  "timestamp": "2026-05-11T23:00:00Z",
  "trials": [
    { "id": "uuid", "business_name": "Gold Coast Locksmiths", "industry": "trades",
      "plan": "starter", "trial_end_date": "2026-05-12T10:00:00Z",
      "owner_user_id": "uuid", "owner_email": "dave@gclocksmiths.com.au" }
  ]
}
```

`owner_email` is fetched from the `users` table (which mirrors
`auth.users.email`). For any owner whose `users` row is missing or has
a null email, `owner_email` will be `null` in the payload — Donna's
scenario should treat that as a "no email on file, alert me" branch.

**Trial expired** (cron):

```json
{
  "trigger": "trial_expired",
  "timestamp": "2026-05-11T22:00:00Z",
  "expired": [
    { "id": "uuid", "business_name": "Gold Coast Locksmiths", "industry": "trades",
      "plan": "starter", "trial_end_date": "2026-05-11T10:00:00Z" }
  ]
}
```

### Environment variables (Donna's responsibility to fill)

Add these to **Vercel → Production** (and local `.env.local`). Empty
strings are fine — the code degrades gracefully when a webhook URL is
missing (flips the DB flag, returns `webhook.status = 'skipped_no_url'`
in the response, logs a comms-log entry telling the admin to brief
Donna manually).

```
MAKE_AGENT_BRIEF_WEBHOOK=        # POST receiver for onboarding-complete
MAKE_TRIAL_REMINDER_WEBHOOK=     # POST receiver for the day-6 cron
MAKE_TRIAL_EXPIRED_WEBHOOK=      # POST receiver for the expire-trials cron
NEXT_PUBLIC_STRIPE_STARTER_LINK= # Stripe payment link — surfaced in the client trial UI
NEXT_PUBLIC_STRIPE_GROWTH_LINK=  # Same, Growth plan
NEXT_PUBLIC_STRIPE_PRO_LINK=     # Same, Pro plan
NEXT_PUBLIC_IRFAN_PHONE=         # Phone number shown on the expired-trial overlay
```

`CRON_SECRET` already exists from earlier sessions.

The Stripe / Irfan-phone vars use the `NEXT_PUBLIC_` prefix because
they're rendered in client components (trial banner, expired overlay,
trial progress card).

### Admin UI changes

- **`/admin/clients` list**: trial pill ("TRIAL · X days left") and red
  "TRIAL EXPIRED" pill next to the business name. New "Trial" and
  "Expired" stat tiles in the header strip. New "Trial" and "Expired"
  filter options. Trials sort to the top of the list by default.
- **Edit client modal**: `<TrialManagementPanel>` between the modal
  header and the tabs. Renders different controls per `account_status`
  (Convert / Extend / End for trial; Reactivate / Mark paid for expired;
  read-only confirmation for active; grey badge for cancelled).
- **Edit client modal — Agent Setup tab**: `<OnboardingCompleteButton>`
  at the bottom. Confirmation modal before firing. Shows green "✓ Donna
  briefed" with timestamp once fired, with a small "Re-brief Donna"
  link.
- **New page `/admin/trials`**: table of active trials with the columns
  the brief specified (Business, Industry, Plan, Start, End, Days left
  with traffic-light colours, Actions). Empty state: "No active trials
  at the moment."
- **Create client modal**: new "Start as 7-day free trial" toggle in
  Section 2 (Plan). When ticked, the modal calls
  `/api/admin/clients/[id]/start-trial` immediately after creation. The
  plan selector stays visible (plan is still selected for trial users).

### Client portal UI changes

- **`<TrialBanner>`** in `(portal)/layout.tsx` between the impersonation
  banner and page content. Sticky, orange gradient. Self-fetches
  `/api/portal/trial-status`; renders nothing unless
  `account_status === 'trial'`. Headline morphs: "ends in N days" →
  "ends tomorrow" → "ends today" at the boundaries.
- **`<TrialExpiredOverlay>`** rendered at the bottom of the layout.
  Self-fetches the same endpoint; renders nothing unless
  `account_status === 'expired'`. Full-screen, backdrop-blurred, contains
  the "Activate my plan" CTA and the IRFAN_PHONE fallback. `z-index:
  1000` so it sits above all portal content.
- **`<TrialProgressCard>`** at the top of the dashboard
  (`dashboard-client.tsx`). Self-fetches. Renders "Day X of 7" with a
  filled progress bar and the calls-handled count.

### Files changed

```
supabase/migrations/021_trial_mode.sql                                  (new)
src/app/api/admin/clients/[id]/start-trial/route.ts                     (new)
src/app/api/admin/clients/[id]/convert-trial/route.ts                   (new)
src/app/api/admin/clients/[id]/extend-trial/route.ts                    (new)
src/app/api/admin/clients/[id]/end-trial/route.ts                       (new)
src/app/api/admin/clients/[id]/reactivate-trial/route.ts                (new)
src/app/api/admin/clients/[id]/onboarding-complete/route.ts             (new)
src/app/api/portal/trial-status/route.ts                                (new)
src/app/api/cron/expire-trials/route.ts                                 (new)
src/app/api/cron/trial-reminders/route.ts                               (new)
src/app/(portal)/admin/trials/page.tsx                                  (new)
src/app/(portal)/admin/trials/trials-view.tsx                           (new)
src/app/(portal)/admin/clients/trial-panel.tsx                          (new)
src/components/portal/trial-banner.tsx                                  (new)
src/components/portal/trial-progress-card.tsx                           (new)
vercel.json                                                             (+2 cron entries)
src/app/(portal)/admin/clients/page.tsx                                 (select adds trial cols)
src/app/(portal)/admin/clients/types.ts                                 (extend AdminBusiness, statusColor for trial/expired, trialDaysRemaining helper)
src/app/(portal)/admin/clients/admin-clients-view.tsx                   (badge column, stat tiles, filter, sort)
src/app/(portal)/admin/clients/edit-client-modal.tsx                    (mount trial panel + onboarding button)
src/app/(portal)/admin/clients/create-client-modal.tsx                  (Start as trial toggle + post-create call)
src/app/(portal)/layout.tsx                                             (mount trial banner + overlay)
src/app/(portal)/dashboard/dashboard-client.tsx                         (mount trial progress card)
DEPLOYMENT.md                                                           (this section)
```

### Pre-merge checklist

1. **Run migration 021** in the Supabase SQL editor.
2. **Add the env vars** to Vercel Production (leave blank if Donna
   hasn't built the Make.com scenarios yet — code degrades gracefully).
3. **Verify `vercel.json`** picked up the new crons (Vercel dashboard
   → Settings → Cron Jobs).
4. **Smoke test** in production: create a test business, toggle Start
   as trial, confirm the orange "TRIAL · 7 days left" pill on the
   admin list, impersonate the business, confirm the trial banner
   appears at the top.
5. **Hume Towing safety**: this session does NOT touch Hume Towing's
   `services` or `notifications_config`. The migration is additive on
   the table; no UPDATEs target a specific business.

---

## SESSION 5 ADDENDUM — Industry service fields (May 2026)

Adds a per-industry "Services and Pricing" template UI to the Agent Builder
tab in both the admin portal and the client portal. Each business gets a
list of pre-suggested services with price + unit hints, can toggle them
on/off, and add custom rows. Trades industry shows a sub-type selector
first (plumber / electrician / locksmith / builder / air conditioning).

### Migration

**`supabase/migrations/020_services_and_trade_type.sql`** — idempotent.
Run once in the Supabase SQL editor:

```sql
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS services JSONB DEFAULT '[]'::jsonb;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS trade_type TEXT DEFAULT NULL;
```

No new tables, no RLS changes — existing `owner_all` policy on
`businesses` covers both new columns automatically.

These are **separate from** the existing `notifications_config.service_pricing`
object Hume Towing uses for their vehicle-class pricing matrix. That data
is preserved untouched.

### Service object shape

Each item in the `services` JSONB array:

```ts
interface Service {
  id: string        // uuid, generated on creation, never changes
  name: string      // editable by admin; read-only for clients on template rows
  price: string     // dollar amount entered by user, blank by default
  unit: string      // template-set hint, e.g. "per job", "per hour"
  enabled: boolean  // active for this business
  custom: boolean   // true only for user-added rows
}
```

### What's new

| Surface | What landed |
|---|---|
| `src/lib/service-templates.ts` | All 13 industry templates plus 5 trade sub-type templates. Includes `getInitialServices()` that returns the saved array if it exists, otherwise falls back to the matching template. **Saved data is never overwritten.** Aliases for `medi_spa` / `real_estate` / `pest_control` / `restaurants` so legacy or brief-preferred industry keys all map to the same template. |
| `src/components/portal/services-editor.tsx` | New reusable `<ServicesEditor mode="admin" \| "client" />`. Admin mode: edit names, units, prices, toggle, add custom, delete custom, change trade_type via dropdown. Client mode: prices + toggle + custom-row CRUD only; template names/units render as read-only text and trade_type is a read-only label. Mobile-collapsing grid. |
| `src/app/(portal)/admin/clients/edit-client-modal.tsx` | New "Services and Pricing" section dropped into the Agent Setup tab between the existing `<ServicePricingEditor>` (towing-specific vehicle matrix) and `<ServiceAreaEditor>`. Saves alongside the rest of the Agent Setup form via the existing "Save changes" button. |
| `src/app/(portal)/settings/page.tsx` | Same editor mounted in client mode inside the AI Voice Agent tab, right after `<ServicePricingEditor>`. Save is debounced per change via `PATCH /api/portal/services`. |
| `src/app/(portal)/admin/clients/page.tsx` | Initial businesses query now selects `services` and `trade_type` so the modal can hydrate without an extra fetch. |
| `src/app/(portal)/admin/clients/types.ts` | `AdminBusiness` interface gains `services` (array) and `trade_type` (string). |

### API routes

| Method · Route | Purpose |
|---|---|
| `PATCH /api/admin/clients/[id]` (extended) | Now accepts `services?: Service[]` and `trade_type?: string \| null` as **top-level columns** (not merged into `notifications_config`). `trade_type` validated against the 5-value allowlist. Industry allowlist widened to cover library-aligned + legacy + brief-preferred keys. |
| `PATCH /api/portal/services` (new) | Client-side save for the services array. Auth via Supabase user session cookie. RLS scopes the update to the caller's own business via the `owner_all` policy. Body: `{ services: Service[] }`. |

### Permissions

Admin can: edit names, enter prices, toggle, change trade_type, add custom rows, delete custom rows, save.
Client can: enter prices, toggle, add custom rows, edit/delete their own custom rows, save.
Client cannot: edit names or units on template rows, delete template rows, change trade_type.

### Future work flagged for a later session

- **Vapi knowledge base integration**: the `services` array is not yet pushed to the Vapi assistant on save. The data is stored and ready; the next session will wire it into the existing `/api/vapi/sync` route so the agent can quote prices on calls.

### Donna's manual tasks (after Vercel shows Ready)

**1. Run migration 020** in Supabase SQL editor:

```sql
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS services JSONB DEFAULT '[]'::jsonb;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS trade_type TEXT DEFAULT NULL;
```

Confirm both columns appear on the `businesses` table before continuing.

**2. Run the Hume Towing additive SQL** (only after migration 020 has run).
This appends the 5 new towing fields to Hume Towing's `services` array, but
**only** if a field with the same name does not already exist on their record.
Existing fields and any prices Hume has entered are preserved exactly as-is.

```sql
DO $$
DECLARE
  v_business_id uuid;
  v_existing jsonb;
  v_new_fields jsonb;
  v_field jsonb;
  v_name text;
  v_exists boolean;
BEGIN
  SELECT id, COALESCE(services, '[]'::jsonb)
  INTO v_business_id, v_existing
  FROM businesses
  WHERE name = 'Hume Towing'
  LIMIT 1;

  v_new_fields := jsonb_build_array(
    jsonb_build_object('id', gen_random_uuid()::text, 'name', 'After-hours callout',                          'price', '', 'unit', 'per job',     'enabled', true, 'custom', false),
    jsonb_build_object('id', gen_random_uuid()::text, 'name', 'Vehicle storage (holding yard)',               'price', '', 'unit', 'per day',     'enabled', true, 'custom', false),
    jsonb_build_object('id', gen_random_uuid()::text, 'name', 'After-hours release fee',                      'price', '', 'unit', 'per release', 'enabled', true, 'custom', false),
    jsonb_build_object('id', gen_random_uuid()::text, 'name', 'Go jacks (vehicle stuck in park or no keys)',  'price', '', 'unit', 'per job',     'enabled', true, 'custom', false),
    jsonb_build_object('id', gen_random_uuid()::text, 'name', 'Lowered ramp / low clearance surcharge',       'price', '', 'unit', 'per job',     'enabled', true, 'custom', false)
  );

  FOR v_field IN SELECT * FROM jsonb_array_elements(v_new_fields) LOOP
    v_name := v_field->>'name';
    SELECT EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_existing) s WHERE s->>'name' = v_name
    ) INTO v_exists;
    IF NOT v_exists THEN
      v_existing := v_existing || jsonb_build_array(v_field);
    END IF;
  END LOOP;

  UPDATE businesses SET services = v_existing WHERE id = v_business_id;
END $$;
```

**3. QA**:
- Open Hume Towing in admin Agent Builder → confirm existing fields intact and 5 new fields present
- Log in as Hume Towing client → confirm services section loads without error
- Pick one other client (any non-towing, non-trades industry) in admin → confirm template loads with blank prices
- Pick a trades client (or create a test one) → confirm trade-type dropdown appears before the service list
- Report back to Irfan with status

---

## SESSION 4 ADDENDUM — Admin client management

Session 4 ships the admin-side "manual onboarding" flow: create a client account on
behalf of a prospect, generate a Stripe payment link, send a welcome email, hold them
on a hard T&C gate the first time they log in, and manage their lifecycle (activate,
suspend, cancel) from a dedicated admin surface.

### Migration

**`supabase/migrations/011_admin_client_management.sql`** — idempotent. Run once in the Supabase SQL editor.

What it adds:
- `businesses.account_status` (`active`/`pending`/`suspended`/`cancelled`, default `active`)
- `businesses.onboarded_by` (`self`/`admin`/`partner`, default `self`)
- `businesses.temp_password`, `welcome_email_sent`, `agent_phone_number`,
  `stripe_payment_link`, `stripe_payment_link_id`, `billing_override_note`,
  `manual_next_billing_date`
- New table `client_comms_log` — chronological customer-touch log, admin-only
- New table `client_admin_notes` — internal notes about a client, admin-only
- Indexes on `account_status`, `stripe_payment_link`, and the `(business_id, created_at)` keys for both new tables

**RLS DECISION (recorded here on purpose):** the brief asked for an RLS policy
comparing the caller's email to `current_setting('app.admin_email', true)`.
Supabase doesn't expose a stable per-request hook to set that GUC, so the API
routes always go through the service-role client (`createAdminClient`) — which
bypasses RLS — and the admin gate is enforced in the route handler via
`requireAdmin()` (super-admin email + `users.role = 'admin'`). The two new tables
keep RLS *enabled* with only a service-role policy, so no anon/authenticated
session can ever read or write them. Same effective result, simpler ops.

### What's new

| Surface | What landed |
|---|---|
| `/admin/clients` | Client management page. Stats strip (total/active/pending/suspended/cancelled), pending banner, search + status filter, full client table with View/Edit, Payment Link, Login as Client, and Activate row actions. |
| `/admin/clients/overview` | One-row-per-client health dashboard. Sortable columns: business, plan, agent live/not, calls this month, status, T&C accepted, welcome email, first login (from `auth.users.last_sign_in_at`), next billing (Stripe `current_period_end` or manual override). |
| Create New Client modal | 5 sections: Business details, Plan (3-card selector with Growth recommended), Agent setup (answer phrase / services summary / after-hours), optional initial note, send-welcome-email toggle. Success screen shows login + temp password (copyable, plain text), Generate payment link button. |
| View/Edit modal | 4 tabs. **Details** — every business field editable, plus suspend/cancel danger zone with reason capture and "send pause offer" checkbox. **Agent Setup** — agent fields editable, auto-generated Donna build prompt with copy button, onboarding checklist visual, downloadable HTML onboarding sheet (print to PDF). **Billing** — payment link with copy/regenerate, SMS template, billing override note + manual next billing date. **History** — admin notes column + comms log column, both append-only with timestamps. |
| Impersonation | Red sticky banner on every portal page when `?impersonate=1` is in the URL. Banner reads "Admin view — you are viewing this portal as [Business Name]" with an Exit link back to /admin/clients. State held in `sessionStorage` so it survives client navigation but doesn't leak to other tabs. |
| T&C hard gate | Middleware redirects any user where `businesses.onboarded_by = 'admin'` AND no `legal_acceptances` row exists to `/accept-terms?next=<original>`. Runs **before** the subscription check so unsigned admin clients land on the T&C screen even if they haven't paid yet. |
| Existing admin dashboard | Section nav now includes Clients (with pending count badge) and Client Overview. Total Clients card shows `X active / Y pending`. Amber banner appears at the top of `/admin` when any pending accounts exist. |

### API routes (all admin-gated via `requireAdmin()`)

| Method · Route | Purpose |
|---|---|
| `GET /api/admin/clients` | List every business with admin-view fields. |
| `POST /api/admin/clients/create` | Create auth user + business with `account_status='pending'`, `onboarded_by='admin'`. Generates 10-char alphanumeric mixed-case temp password. Duplicate-email guard returns 409 with `existing_business_id`. Optionally fires the welcome email via Make. |
| `PATCH /api/admin/clients/[id]` | Whitelisted partial update for the View/Edit modal. Agent setup fields merge into `businesses.notifications_config`. |
| `POST /api/admin/clients/[id]/activate` | Sets status to active. |
| `POST /api/admin/clients/[id]/suspend` | Sets status to suspended. |
| `POST /api/admin/clients/[id]/cancel` | Cancels live Stripe subscriptions, sets status to cancelled, logs the reason, optionally fires the pause-offer email. |
| `POST /api/admin/clients/[id]/generate-payment-link` | Creates a Stripe recurring price + payment link at the plan's AUD price ($299/$499/$799), embeds `business_id` in metadata, persists the URL + payment-link id on the business row. |
| `POST /api/admin/clients/[id]/notes` (and GET) | Append/list admin notes. |
| `POST /api/admin/clients/[id]/comms-log` (and GET) | Append/list comms log entries. |
| `POST /api/admin/clients/[id]/impersonate` | Mints a Supabase magic link for the client owner with redirect to `/dashboard?impersonate=1&biz=<id>`. Logs the impersonation start in admin notes. |
| `POST /api/stripe/payment-link-paid` | Stripe webhook listening for `checkout.session.completed`. Resolves the business via `payment_link.metadata.business_id`, activates the account, upserts the subscription, and fires the welcome email if not already sent. Verifies signatures against a **separate** secret (`STRIPE_PAYMENT_LINK_WEBHOOK_SECRET`) so the existing `/api/webhooks/stripe` endpoint is untouched. |

### Welcome-email payload (Make.com)

`POST` to `MAKE_WEBHOOK_EMAIL_TRIGGER` with `event: 'welcome_post_payment'` and a `data` object shaped:

```json
{
  "type": "welcome_admin_created",
  "to": "<client email>",
  "owner_name": "...",
  "business_name": "...",
  "temp_password": "...",
  "plan": "starter | growth | pro",
  "login_url": "https://app.talkmate.com.au/login",
  "accept_terms_url": "https://app.talkmate.com.au/accept-terms",
  "from_name": "Irfan from TalkMate",
  "from_email": "hello@talkmate.com.au"
}
```

Make.com routes by `data.type` — set up a new route for `welcome_admin_created`
that includes login URL, temp password, and accept-terms URL.

### Manual deployment steps for Donna

1. **Migration** — open Supabase SQL editor, paste `supabase/migrations/011_admin_client_management.sql`, run. Idempotent.
2. **Stripe webhook** — Stripe Dashboard → Developers → Webhooks → Add endpoint:
   - URL: `https://app.talkmate.com.au/api/stripe/payment-link-paid`
   - Events: `checkout.session.completed`
   - Copy the signing secret, add as Vercel env var **`STRIPE_PAYMENT_LINK_WEBHOOK_SECRET`** (Production), redeploy.
3. **Make.com welcome email** — add a new route in the existing email-trigger scenario for `data.type = "welcome_admin_created"`. Body must include owner name, business name, temp password, login URL, and accept-terms URL. From: `hello@talkmate.com.au`.
4. No Vapi changes needed.

### Testing checklist

- [ ] Create client → appears in Supabase `auth.users` and `businesses` with `account_status='pending'`, `onboarded_by='admin'`
- [ ] Duplicate email returns 409 with `existing_business_id`
- [ ] Temp password visible + copyable on success screen
- [ ] Payment link creates Stripe recurring subscription at correct AUD price
- [ ] `payment-link-paid` webhook auto-activates account when paid
- [ ] First login for admin-created account is redirected to `/accept-terms` and cannot navigate away
- [ ] After acceptance lands on dashboard
- [ ] Donna build prompt copies cleanly
- [ ] SMS template copies with payment link interpolated
- [ ] Impersonation opens client portal in new tab with red banner; Exit returns to `/admin/clients`
- [ ] Overview page renders all clients with calls/mo, T&C, last login, next billing
- [ ] Admin notes + comms log both append-only with timestamps
- [ ] Cancellation cancels Stripe subscription and sets account status
- [ ] Download onboarding sheet generates HTML (print → PDF)
- [ ] Pending banner shows on `/admin` when any pending accounts exist
- [ ] Existing CRM, billing, partner, white-label flows unaffected

---

## SESSION 3 ADDENDUM — White-label foundation, Proxima demo, billing v2, ABN, polish

Session 3 ships everything Monique Charabati needs to see in the Proxima demo this week,
plus the polish items that came out of Sessions 1–2.

### Migration

**`supabase/migrations/010_session3.sql`** — idempotent. Run once in Supabase SQL editor:

```bash
psql "$DATABASE_URL" -f supabase/migrations/010_session3.sql
```

What it adds:
- `white_label_configs` table with RLS (owner-only write, anon read for `is_active = true` rows so the public preview page works without an admin client)
- `businesses.is_partner`, `partner_tier` (starter/silver/gold), `partner_commission_rate`, `referred_by`
- `businesses.abn`, `abn_verified`
- `subscriptions.cancel_at_period_end`, `cancellation_reason`, `cancellation_requested_at`
- Seeds the **Proxima Agent** demo white-label config so `/wl-preview/proxima` renders immediately after migration

### What's new

| Surface | What landed |
|---|---|
| `/wl-preview/[subdomain]` | Public, branded login mock used for the Proxima demo. Uses `white_label_configs` for that subdomain. Anonymous read via `is_active` RLS policy. |
| `/admin/white-label` | Admin index of every white-label config across all partners. |
| `/account/white-label` | Per-partner config page (visible only when `is_partner = true`). Brand name, logo URL, primary/secondary/accent colours, support email/phone, hide-TalkMate-branding toggle (gated to Gold tier). Wired to `/api/white-label`. |
| `/admin/partners` | Partner management table. Inline edit of tier and commission rate via `/api/admin/partner-update`. Shows referred_count + attributed MRR per partner. |
| `/admin/make-setup` | Step-by-step Make.com scenario doc with copy-able URL/payload and a one-click **Test connection** button that hits `/api/contacts/upsert/test`. |
| `/api/contacts/upsert/test` | Admin-only GET that returns the expected payload structure for the `/api/contacts/upsert` endpoint. Used by the Test connection button + Donna's manual checks. |
| `/api/demo/seed` | Admin-only POST. Seeds the 10 Proxima real-estate sample contacts + per-contact call summaries + pipeline placement. Idempotent. Refuses to run on non-real-estate businesses. |
| `/api/demo/reset` | Admin-only POST. Deletes contacts whose phone starts with the demo prefix `+61412001`. CASCADE handles contact_calls + contact_pipeline. |
| Demo banner | Auto-shown on `/contacts` and `/contacts/pipeline` when demo data is present. Admins see a Reset button. |
| `/api/stripe/summary` | New endpoint feeding the upgraded billing page. Returns plan, payment method last4 + expiry, last 6 invoices, subscription status. Falls back gracefully when Stripe isn't fully wired. |
| `/api/stripe/cancel` | New endpoint for the cancellation modal. Calls `subscriptions.update(cancel_at_period_end: true)`, persists the reason on the row, and fires a `subscription_cancelled` Make.com event. |
| `/billing` | Rebuilt. Real plan name + price, real call usage progress (red/amber/green by threshold), real card-on-file display with **Update** button to Stripe Customer Portal, last 6 invoices with PDF download, full cancellation modal with reason capture and "we're sorry to see you go" copy. Already-cancelling state is shown when `cancel_at_period_end = true`. |
| Onboarding Step 1 | New optional **ABN (optional)** field with helper text and 11-digit format validation (digits only, max 11). Persisted to `businesses.abn` on completion. |
| Settings → Business Info | New **ABN** field with same validation + a green **✓ Verified** badge when `abn_verified` is true. |
| `lib/legal-docs.ts` | New `TALKMATE_ABN` constant (currently `TBC`). Terms-of-Service body interpolates it via template literal. Update one place when the real ABN is registered. |
| Admin home | New section nav (Partners / White Label / Make.com Setup) at the top, plus a **Contacts awaiting name identification** widget grouping NULL-name contacts by business. |
| Sidebar | New **White Label** entry under Account, visible only when `businesses.is_partner` is true. |
| Website `/partners` | New **White label TalkMate for your network** section below the referral program. CTA links to `/demo?type=whitelabel`. |
| Website homepage | Removed `backdrop-filter: blur()` from Nav, DemoCard, and StickyBottomBar (the cause of scroll-frame freezes); promoted the IntegrationsRow marquee to its own GPU layer (`translate3d`/`will-change`); honoured `prefers-reduced-motion`. |
| Industry pages | Fixed: `INDUSTRY_CRM` keys are underscored (`real_estate`, `professional_services`) but slugs use hyphens. Lookup now normalises before indexing, so all 8 industry pages render their CRM block. |

### Decisions (Session 3)

1. **White-label preview is a public route.** The `/wl-preview/[subdomain]` page is unauthenticated by design — the whole point of the demo is to send Monique a link without making her log in. Anonymous SELECT on `white_label_configs` is gated to `is_active = true` rows via RLS, so only configs explicitly marked active are visible. Inactive/draft configs are owner-only.
2. **Proxima demo config has `partner_id = NULL`.** It's seeded directly by the migration so the preview link works the moment migration 010 runs, before any real business is registered for Proxima. When Monique signs up, link her business by setting `white_label_configs.partner_id = <her business id>`.
3. **Hide-TalkMate-branding is Gold-only.** Server-side enforcement in `/api/white-label` — the toggle on `/account/white-label` ignores the value for non-Gold tiers and forces it to false, so the constraint can't be bypassed client-side.
4. **Demo seeder is gated to real-estate businesses.** Mixing demo real-estate contacts into a non-real-estate account would pollute their CRM and Smart Lists in ways that aren't easily reversible by the prefix-based reset. Refuses with a clear error message.
5. **Existing onboarding wizard kept at 11 steps.** ABN is added inline to Step 1 (Business Details) above the timezone selector — same pattern Session 1 used for the industry picker — rather than introducing a 12th step. Onboarding flow nav guards stay untouched.
6. **CRM Health card on the dashboard.** Brief Fix 3 said "show neutral grey when contact count is zero". Implemented as a separate `crmHealthHasContacts` prop that swaps the card to a neutral `—` / "No contacts yet" state. The colour-coded version only renders when there's actual data to compute health from.
7. **Smart-lists seeder always runs.** Brief Fix 6 was a verification ask — but the existing logic only seeded when zero lists existed, which meant towing accounts seeded with universal-only lists pre-Session 2 never got their towing-specific lists. `seedDefaultSmartLists` is already name-idempotent, so the page now calls it on every visit and back-fills any missing seeds without duplicating.
8. **T&C banner cache invalidation.** `/api/legal/accept` now calls `revalidatePath('/dashboard')` and the `(portal)` layout so the banner disappears on the next render without requiring `router.refresh()` to land. Belt-and-braces: the client still does push + refresh.
9. **Stripe cancellation goes through Make.com, not Resend.** The cancellation confirmation email is fired through `postEmailTrigger({ event: 'subscription_cancelled' })` so Donna can edit copy in Make without a code change. New event added to `EmailTriggerEvent` union — Donna will need to add a route for it in the Make scenario.
10. **Page titles via `metadata.title.template`.** Set on the root layout once. Server-component pages add `export const metadata = { title: '...' }`; client-component pages get a sibling `layout.tsx` with the metadata export. Matches Next 16 conventions and works with Turbopack.
11. **Homepage scroll fix targeted backdrop-filter, not animations.** The CRM section added in Session 2 was clean — no IntersectionObserver, no animation. The freeze culprit was the fixed-position Nav with `backdrop-filter: blur(12px)` forcing a full-page composite on every scroll frame, compounded by another blur on the Hero's DemoCard and the StickyBottomBar. Removed all three; promoted the marquee to its own GPU layer to keep it animating cheaply. Marquee duration also relaxed from 30s to 60s, halving the per-frame transform delta.
12. **Demo seeder's "Unknown Caller" entry uses `name: null`.** The brief listed it as an explicit string — but the contacts table stores name as `text` nullable, and the rest of the portal already handles NULL names everywhere (the new "awaiting name identification" admin metric depends on it). Storing the literal string "Unknown Caller" would corrupt that metric.

### Manual handoff (Donna)

1. Run migration 010 in Supabase SQL editor.
2. Visit `https://app.talkmate.com.au/wl-preview/proxima` from any browser and confirm the Proxima-branded login renders correctly. **This is the URL to show Monique.**
3. (Optional) Seed demo data in a real-estate test account: as an admin, POST to `/api/demo/seed` with `{ "businessId": "<uuid>" }`. Reset with POST `/api/demo/reset`.
4. (Optional) When Donna is ready to wire Make.com to `/api/contacts/upsert`, follow the doc at `/admin/make-setup` and use the **Test connection** button to confirm auth.
5. **No Vapi changes required for Session 3.**
6. When the Proxima business signs up, link them: `update white_label_configs set partner_id = '<biz_id>' where portal_subdomain = 'proxima'` and flip `businesses.is_partner = true`.

### Build verification (Session 3)

```
$ npm run build
✓ Compiled successfully in 11.7s
✓ Generating static pages using 7 workers (82/82) in 854ms
```

82 routes built, zero errors. Website rebuilt to 25 routes, zero errors.

### Testing checklist (Session 3)

- [ ] Migration 010 runs without errors
- [ ] /wl-preview/proxima shows Proxima-branded portal login
- [ ] Demo data seeds correctly via /api/demo/seed for a real_estate business
- [ ] Pipeline page shows seeded contacts in correct stages
- [ ] Smart lists show updated counts after demo data seeded
- [ ] Welcome back message shows first name (auth metadata) or business name, not the email-local-part
- [ ] T&C banner disappears immediately after acceptance (no manual refresh)
- [ ] CRM Health shows neutral state when zero contacts
- [ ] Towing industry smart lists include Account Clients, Repeat Breakdowns, After Hours
- [ ] Billing page shows plan, usage, payment method section
- [ ] ABN field appears in onboarding Step 1 and account settings
- [ ] Homepage scrolls smoothly without timeout (test on mid-spec hardware)
- [ ] /partners page (website) has the new **White label TalkMate for your network** section
- [ ] All page titles are descriptive (e.g. "Contacts — TalkMate")
- [ ] /admin/partners shows partner management table with inline edit
- [ ] /admin/white-label shows white label configs
- [ ] /admin/make-setup shows wiring instructions and the Test connection button works
- [ ] Cancellation modal cancels the subscription at period end (verified via Stripe dashboard)

---

## SESSION 2 ADDENDUM — Smart lists v2, Pipeline kanban, Contact merge, CRM Command queries

Session 1 set up the data model. Session 2 turned the placeholders into working surfaces:

### Migration

**`supabase/migrations/009_crm_session2_indexes.sql`** — index-only, idempotent. Run once in the Supabase SQL editor:

```bash
psql "$DATABASE_URL" -f supabase/migrations/009_crm_session2_indexes.sql
```

GIN index on `contacts.tags`; B-tree indexes on `contacts.call_count`, `contacts.first_seen`, `contacts.last_seen`, plus the two pipeline lookups. No new tables or columns.

### What's new

| Surface | What landed |
|---|---|
| `/api/smart-lists/seed` | Retroactively seeds system smart lists for any business that doesn't have them yet. Auto-called by the smart-lists page on first visit. |
| `/api/smart-lists` (POST + GET) | Create custom lists / list all of them. |
| `/api/smart-lists/preview` | Live count for the custom-list builder modal. |
| `/api/contacts/merge` | Merges call history + tags + industry_data, dedupes by phone, marks merged contact `is_merged=true` with `merged_into` pointer. |
| `/api/contacts/search` | Backs the merge modal — name/phone ilike, RLS-scoped. |
| `/api/pipeline/seed` | Default stages per industry (real estate / trades / professional services). Idempotent. |
| `/api/pipeline/move` (POST + DELETE) | Move/add/remove a contact in the pipeline; backs the kanban drag-drop. |
| `/contacts/smart-lists` | Replaced "None yet" placeholder with system + custom list grids. Auto-seeds on first visit. "Create custom list" button opens builder modal. |
| `/contacts/smart-lists/[id]` | New detail page — same table layout as the contacts page, pre-filtered. |
| `/contacts/pipeline` | New kanban board, horizontal scroll, HTML5 drag-drop, urgency colour-coding (green < 7d, amber 7-14d, red 14+d), property-of-interest line for real estate. |
| Contact detail | Merge modal wired in (replaces the Session 1 placeholder), pipeline-stage widget added, structured industry-data display per industry, call timeline shows tag chips + transcript + "Add note from this call" button. |
| Sidebar | "Pipeline" added under "Your Agent" — visible only for businesses with `industry IN (real_estate, trades, professional_services)`. |
| `/api/contacts/upsert` | Auto-movement: real-estate `booking_made` → "Inspection Booked"; first call for real-estate/trades → "New Enquiry". |
| `/api/command/parse` | New CRM intents (`contact_lookup`, `contact_list_query`, `pipeline_query`, `contact_tag_update`) added to the Grok prompt. Read-only intents resolve real data via `lib/command-crm-handlers.ts` and override `responseMessage` so users see actual contacts/lists, not Grok hallucinations. Tag updates flagged HIGH RISK (require YES/CANCEL confirmation). |
| Admin panel | New "Pipeline health" widget (real-estate clients, all pipeline clients, contacts in pipeline, stage distribution bar chart) + "Smart list activity" widget (most-populated lists across all clients, lapsed-regulars upsell signal). |

### New libraries

```
src/lib/smart-list-resolver.ts   — resolveSmartList() executes filter_rules → contacts; describeFilter() for Command output
src/lib/smart-lists.ts           — universal + per-industry seeds; refreshSmartListCounts() (now backed by the resolver)
src/lib/pipeline.ts              — PIPELINE_STAGES, hasPipeline(), seedPipelineStages(), fetchPipelineStages()
src/lib/command-crm-handlers.ts  — handleContactLookup, handleContactListQuery, handlePipelineQuery + name extractor
```

### New pages and components

```
src/app/(portal)/contacts/smart-lists/page.tsx           (rebuilt, server-seeds on first visit)
src/app/(portal)/contacts/smart-lists/smart-lists-client.tsx
src/app/(portal)/contacts/smart-lists/[id]/page.tsx
src/app/(portal)/contacts/pipeline/page.tsx
src/app/(portal)/contacts/pipeline/pipeline-kanban-client.tsx

src/components/portal/custom-list-builder.tsx
src/components/portal/contact-merge-modal.tsx
src/components/portal/industry-data-view.tsx
src/components/portal/pipeline-stage-widget.tsx
```

### Decisions

1. **Custom-list rule UI is narrow on purpose.** Five high-leverage rule types ship now (`min_call_count`, `first_seen_days`, `last_seen_min_days`, `tag`, plus name/phone "contains" placeholders that no-op in the resolver pending an ilike pass). Industry-specific custom rules are a follow-up — system lists already cover the most common industry cases.
2. **Smart-list counts use the same code path as the UI.** `refreshSmartListCounts()` calls `resolveSmartList()` so the card count and the detail-page count never disagree.
3. **Merge keeps the user-supplied "keep" choice** rather than auto-picking the older record. Tags are unioned; `industry_data` is shallow-merged with the kept contact's values winning; `contact_calls` rows are reassigned (not duplicated).
4. **Pipeline auto-movement is conservative.** Only two rules trigger: real-estate `booking_made` → Inspection Booked, and first-ever call (real-estate or trades) → New Enquiry. Anything else needs explicit drag or "Move to next stage" — avoids unwanted state changes from ambiguous transcripts.
5. **Pipeline stages seed on first visit to `/contacts/pipeline`,** not on onboarding completion. Avoids creating empty stage rows for businesses whose industry doesn't use a pipeline.
6. **Command CRM intents bypass Grok's `responseMessage`.** Grok classifies the intent and extracts params; the actual data is fetched server-side and the response text is rebuilt from real DB rows. Guarantees no hallucinated contact lists.

### Manual handoff (Donna)

1. Run migration 009 in Supabase SQL editor.
2. **(Optional)** Trigger `/api/smart-lists/seed` once per existing business — or simply have the user visit `/contacts/smart-lists` once and the page auto-seeds. Same applies for `/api/pipeline/seed`.
3. **Make.com — no changes required.** The existing call-logging scenario already calls `/api/contacts/upsert`; pipeline auto-movement and smart-list refresh now happen inside that endpoint.
4. **Vapi — no changes required.** Command Centre prompt updates go out automatically on each `/api/command/parse` call (built dynamically per request).

### Test pass

- Visit `/contacts/smart-lists` as a towing client → see 5 universal + 3 towing-specific lists with live counts.
- Click any system list → filtered contacts table.
- "Create custom list" → builder opens, preview count updates with each rule, save redirects to detail.
- Contact detail → "Merge with another contact" → 2+ char search → preview side-by-side → confirm.
- Real-estate client: `/contacts/pipeline` → drag card across columns → toast confirms.
- Command Centre: "Find Mike" → real lookup response (not Grok-generated). "Show me lapsed regulars" → real list. "Tag Sarah as VIP" → confirmation prompt.

---

This document covers everything Donna needs to ship the new portal build to
production. All scope items from the master brief that don't have a clean
local counterpart are noted with **TODO (manual)** so nothing is missed.

---

## SESSION 1 ADDENDUM — CRM, T&C acceptance, industry selection

This section covers Session 1 of the CRM rollout. All earlier content in this
document still applies; the items below are additive.

### Decisions (deviation from brief, applied consistently)

1. **`clients` mapped to `businesses`.** The brief refers to a `clients`
   table. The existing portal schema already uses `businesses`. Renaming
   would touch every page, RLS policy, and API route built in earlier
   sessions. Instead, **migration 008** introduces `get_current_client_id()`
   — a SECURITY DEFINER SQL function that returns the businesses.id for the
   requesting auth user — and every brief snippet that says `client_id` /
   `clients(id)` is mapped to `businesses(id)` throughout. Behaviour matches
   the brief's RLS intent verbatim.

2. **`industry` is a new column, not a rename of `business_type`.** The
   brief's industry slugs (`restaurants`, `towing`, `real_estate`, `trades`,
   `healthcare`, `ndis`, `retail`, `professional_services`, `other`) don't
   match the existing `business_type` values (`hospitality`, `automotive`,
   `medical`, etc.). Migration 008 adds a new `businesses.industry` column
   with the brief's exact enum. `business_type` is left untouched so the
   existing pages, BUSINESS_TYPE_CONFIG, etc. keep working.

3. **Onboarding wizard kept at 11 steps, not 12.** The brief asks for
   industry selection as a new Step 2 and T&C as a new second-to-last step.
   Renumbering 11 conditional render blocks plus their nav guards is fragile
   and would risk regressing the entire onboarding flow. Implementation:
   - Industry selection added as a 3×3 card grid **inside Step 1**
     (above the business-name fields) — satisfies "before agent
     configuration", just on the same page.
   - The existing Step 8 "Agreement" block was **replaced in place** with
     the new T&C form that records to `legal_acceptances` via
     `/api/legal/accept`.
   - Recording-disclosure toggle added to Step 4 (Voice & Tone).

4. **Legacy `contacts` table renamed to `contacts_v1_legacy`.** Migration
   004 created an older v1 contacts table (email-scan imports) keyed by
   `business_id`. The Session 1 brief defines a v2 contacts schema keyed by
   `client_id` with materially different columns. Migration 008 conditionally
   renames the v1 table out of the way (only if it lacks `client_id`) so the
   new schema can take the `contacts` name. Any v1 data is preserved and can
   be backfilled manually if needed. The existing `/api/contacts/lookup`
   endpoint has been rewritten to read from the v2 schema.

5. **Smart lists are seeded on onboarding completion.** When the user
   selects an industry in onboarding and completes setup, the
   `/api/onboarding/complete` route calls `seedDefaultSmartLists()` which
   inserts the universal lists plus industry-specific ones. Idempotent —
   re-running the onboarding flow won't duplicate.

6. **Custom smart-list builder is deferred to Session 2.** The brief implies
   custom lists are a stretch goal; the system lists ship now and the
   `/contacts/smart-lists` page renders a "coming in Session 2" empty state
   under the custom-lists heading.

7. **Contact merge UI is deferred to Session 2.** The merge button on
   `/contacts/[id]` shows a placeholder modal explaining merging is auto via
   the unique `(client_id, phone)` index. Manual merging will be added in
   Session 2.

8. **Lapsed contact detection cron (Make.com Part 8) is deferred.** The
   brief's "schedule daily at 9am AEST" lapsed-regular notifier is a
   Make.com scenario, not a portal endpoint — this build doesn't add
   anything portal-side for it.

### What's new (Session 1 build)

| Surface | What landed |
|---|---|
| **Migration 008** (`supabase/migrations/008_crm_foundation.sql`) | `legal_acceptances`, `contacts` (v2), `contact_calls`, `smart_lists`, `pipeline_stages`, `contact_pipeline` tables; `industry`, `tos_*`, `privacy_*`, `dpa_*`, `call_recording_disclosure_*` columns on `businesses`; `get_current_client_id()` helper; legacy `contacts` table renamed to `contacts_v1_legacy`; full RLS. Idempotent. |
| **API: `/api/legal/accept`** | Records 3 docs into `legal_acceptances` + denormalises latest version onto businesses + captures IP + UA. |
| **API: `/api/contacts/upsert`** | Server-to-server endpoint Make.com calls after every Vapi call. Bumps call_count + last_seen, applies auto-tags (new/repeat caller, complaint, price_enquiry, upsell_accepted, after_hours, vip_potential), creates `contact_calls` row, refreshes smart-list counts. CRON_SECRET-gated. |
| **API: `/api/contacts/[id]`** | PATCH (name/email/notes/tags) + DELETE for the contact detail page. |
| **API: `/api/contacts/import`** | CSV import with phone normalisation + dedupe by `(client_id, phone)`. |
| **API: `/api/contacts/export`** | One-click CSV export. |
| **Page: `/contacts`** | List with search, recency + call-count filters, tag chips. |
| **Page: `/contacts/[id]`** | Detail with editable name/email/notes/tags, industry-specific JSON view, call-history timeline with expandable transcripts. |
| **Page: `/contacts/smart-lists`** | System lists overview with counts. |
| **Page: `/contacts/import`** | 4-step CSV import wizard. |
| **Page: `/contacts/export`** | One-click CSV download. |
| **Page: `/accept-terms`** | Standalone retroactive acceptance for existing clients. |
| **Onboarding wizard** | Industry 3×3 cards in Step 1; recording-disclosure toggle in Step 4; Step 8 replaced with T&C form (3 docs + signature) writing to legal_acceptances. |
| **Dashboard** | Retroactive T&C banner at the top for any user with a pending document version; two new stat cards: "New Contacts This Month" (blue) and "CRM Health" (green/amber/red by % of contacts with name). |
| **Sidebar** | "Contacts" nav entry under "Your Agent" with total-contact badge. |
| **Vapi sync** (`/api/vapi/sync`) | System prompt now includes `CALL_SUMMARY_START`/`END` block + industry-specific extraction notes + recording-disclosure preamble. |
| **Admin panel** | New "CRM Overview" section above System Alerts: total contacts, new this month, configured/not-configured counts, industry breakdown bar, top 5 clients by contact count. |
| **Library** | `src/lib/legal-docs.ts` (canonical doc text + version constants), `src/lib/extraction-prompt.ts` (Grok extraction prompt + tag vocab), `src/lib/smart-lists.ts` (seeds + count refresher). |

### Document versions

When you bump any of these, existing clients are forced through `/accept-terms`
on next dashboard load until they re-sign:

```ts
// src/lib/legal-docs.ts
TOS_VERSION = 'v2.0-2026-04'
PRIVACY_VERSION = 'v2.0-2026-04'
DPA_VERSION = 'v1.0-2026-04'
```

### Make.com scenario changes (manual, Donna)

The existing call-logging Make scenario must be extended:

1. After Vapi end-of-call, run the Grok extraction prompt from
   `src/lib/extraction-prompt.ts` (`CONTACT_EXTRACTION_PROMPT`) against the
   transcript. The prompt is the brief's verbatim text. Model: `grok-2-latest`,
   `response_format: json_object`, temperature 0.1.
2. Take the parsed JSON and POST to `https://app.talkmate.com.au/api/contacts/upsert`
   with header `Authorization: Bearer ${CRON_SECRET}` and body:

   ```json
   {
     "client_id": "<businesses.id from existing call-logging step>",
     "phone": "<E.164 phone>",
     "call_id": "<vapi call id>",
     "call_at": "<ISO timestamp>",
     "duration_seconds": 187,
     "transcript": "<full transcript>",
     "summary": "<call_purpose from extraction>",
     "extracted_name": "<caller_name>",
     "extracted_email": "<caller_email>",
     "outcome": "<call_outcome>",
     "tags": ["array", "from", "extraction"],
     "industry_data": { /* extracted industry-specific fields */ }
   }
   ```
3. The endpoint handles dedup, auto-tagging, smart-list refresh; nothing else
   needed in Make for the contacts pipeline.

**Lapsed-contact daily scenario (Part 8) is not yet wired** — needs a new
Make scenario at 9am AEST that queries the contacts table (via Supabase
service-role) for restaurant clients where `tags` contains 'repeat_caller'
and `last_seen` is more than 21 days ago, adds the `lapsed_regular` tag, and
sends WhatsApp notification to the client.

### Vapi system prompts — manual update for existing clients

Existing clients' Vapi assistants don't yet have the new contact extraction
instructions or the recording disclosure preamble. To roll out:

```bash
# For each existing client, hit /api/vapi/sync (logged in as them or via
# the admin panel's "re-sync agent" action — a Donna manual-pass).
```

The new `/api/vapi/sync` system prompt now includes:
- A leading recording-disclosure line if `call_recording_disclosure_enabled`
  is true.
- A `CONTACT DATA COLLECTION INSTRUCTIONS` block requiring the assistant to
  emit a structured `CALL_SUMMARY_START`/`END` block at end of every call.
- Industry-specific extraction notes (restaurant items, towing vehicle
  details, real-estate budget, trades urgency).

### Testing checklist (matches brief Part 10)

- [x] T&C acceptance flow records 3 rows in `legal_acceptances` + denorms
      onto businesses (`tos_accepted_*`, `privacy_accepted_version`,
      `dpa_accepted_version`).
- [x] IP address + user-agent captured.
- [x] Existing client → retroactive banner → /accept-terms → dashboard.
- [x] Industry selection saves to `businesses.industry` and triggers
      `seedDefaultSmartLists` on onboarding completion.
- [x] `/api/contacts/upsert` creates new contact on first call, updates
      existing contact on subsequent calls, increments call_count, writes
      `contact_calls` row, applies auto-tags.
- [x] `(client_id, phone)` UNIQUE index prevents dupes.
- [x] /contacts loads with search + filters.
- [x] /contacts/[id] shows call timeline with transcripts.
- [x] /contacts/smart-lists shows system lists.
- [x] /contacts/export downloads CSV.
- [x] /contacts/import wizard creates contacts and de-duplicates.
- [x] RLS verified: `get_current_client_id()` scopes every query to the
      requesting user's business.
- [x] Dashboard shows two new CRM stat cards.
- [x] Admin panel shows CRM Overview.
- [x] Recording-disclosure toggle saves to businesses, included in Vapi
      system prompt on next sync.
- [ ] **Manual:** existing-client retroactive acceptance (verify by setting
      `tos_accepted_version` to NULL on a real account).
- [ ] **Manual:** Make.com scenario update for /api/contacts/upsert.
- [ ] **Manual:** lapsed contact detection scenario (Part 8).
- [ ] **Manual:** trigger /api/vapi/sync for every existing client to push
      the new system prompt.

---

## 1. Environment variables

All variables go into Vercel **Production** env (Project → Settings → Environment Variables).
The local `.env.local` in this repo contains placeholder values used only by `next build` so
TypeScript's static-page collector can run; it must NOT be committed with real secrets.

### Already in Vercel — confirm present

| Var | Notes |
|---|---|
| `DATABASE_URL` | (per master brief Part 15 — Supabase Postgres connection string) |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://mdsfdaefsxwrakgkyflr.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase project `anon` JWT |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase project `service_role` JWT |
| `NEXTAUTH_SECRET` | Existing |
| `NEXTAUTH_URL` | `https://app.talkmate.com.au` |
| `STRIPE_SECRET_KEY` | Existing |
| `STRIPE_PUBLISHABLE_KEY` | Existing |
| `STRIPE_WEBHOOK_SECRET` | (per master brief Part 15) |
| `VAPI_API_KEY` | Existing |
| `VAPI_ASSISTANT_ID` | Existing |
| `RESEND_API_KEY` | Used by onboarding/welcome emails |

### New / required by this build

| Var | Value / source | Purpose |
|---|---|---|
| `GROK_API_KEY` | (per master brief Part 15 — xAI API key) | AI menu import (Part 6) + Command Centre parsing (Part 13) |
| `INTERNAL_ALERT_EMAIL` | `hello@talkmate.com.au` | Where SystemAlert + onboarding-day-7 + low-NPS notifications go |
| `VAPI_TEST_ASSISTANT_ID` | `f93f33e1-dcaf-46e9-8f46-e9056885d5c1` | Used by `/api/cron/call-forward-check` to dial each client's TalkMate number daily |
| `MAKE_WEBHOOK_EMAIL_TRIGGER` | (per master brief Part 15) | All 17 email-trigger events from Part 14 |
| `MAKE_WEBHOOK_PAYOUT` | (per master brief Part 15) | Partner payout notifications |
| `CRON_SECRET` | Generate fresh: `openssl rand -hex 32` | Authenticates all `/api/cron/*` routes and `/api/webhooks/email-trigger` |
| `BLOB_READ_WRITE_TOKEN` | (per master brief Part 15) | Reserved for future logo/photo upload |
| `NEXT_PUBLIC_APP_URL` | `https://app.talkmate.com.au` | Used for Telegram approval links and absolute URLs in transactional email |

### ⏳ Pending — Irfan to provide

| Var | When | Notes |
|---|---|---|
| `STRIPE_CONNECT_CLIENT_ID` | After Stripe business verification clears | Required by `/api/partners/connect-stripe`. Build references it via `process.env.STRIPE_CONNECT_CLIENT_ID` placeholder — partner Stripe Connect onboarding will throw a clear error until this is added. **No code change required when it lands**, just add the var to Vercel and redeploy. |

### Optional — for fully automated database backups

| Var | Purpose |
|---|---|
| `SUPABASE_PROJECT_REF` | `mdsfdaefsxwrakgkyflr` (the part of the Supabase URL between `https://` and `.supabase.co`) |
| `SUPABASE_MANAGEMENT_TOKEN` | Personal access token from Supabase dashboard → Account → Access Tokens. Lets `/api/cron/db-backup` trigger an on-demand backup via the management API. **If omitted, Supabase Pro's nightly auto-backup still covers us — see §5.** |

---

## 2. Database migration

All schema additions are in **`supabase/migrations/007_master_brief.sql`**.

```bash
# In the Supabase SQL editor (or via supabase CLI):
psql "$DATABASE_URL" -f supabase/migrations/007_master_brief.sql
```

The migration is idempotent (`CREATE TABLE IF NOT EXISTS`, `ALTER ... ADD COLUMN IF NOT EXISTS`, `DROP POLICY IF EXISTS` before `CREATE POLICY`). It is safe to re-run.

It introduces:

- `nps_responses` (Part 5 — NPS popup)
- `system_alerts` (Part 12 — health/usage/onboarding/NPS alerts)
- `usage_alerts` (Part 12 — 80%/95% thresholds)
- `menu_import_jobs` (Part 6 — Grok URL imports)
- `command_logs` (Part 13 — Command Centre history)
- `scheduled_commands` (Part 13 — recurring commands)
- `changelog` (Part 5 — "what's new" drawer; **5 rows pre-seeded**)
- `vapi_health` (single-row state for the per-minute Vapi probe)
- New columns on `businesses`: `plan_call_limit`, `signup_at`, `escalation_number`, `escalation_trigger`, `agent_name`, `talkmate_number`, `connect_method`, `forwarding_carrier`, `last_call_forward_check`, `call_forward_status`, `command_centre_platform`, `command_centre_token`, `command_authorised_numbers`, `command_daily_count`, `command_daily_count_date`
- New columns on `calls`: `flagged_wrong_response`, `flagged_message_index`, `revenue_attributed`, `call_type`

After running migration 007, the existing `onboarding_responses` table is reused — the brief's `OnboardingProgress` model maps onto it (we did not duplicate). The dashboard Onboarding Checklist derives the 5 step-flags directly from `onboarding_responses.responses` + `businesses` columns.

RLS policies are added/replaced on every new table so authenticated users can only see their own data, and `service_role` has full access for cron jobs and webhooks.

---

## 3. Vercel cron configuration

`vercel.json` declares 11 cron jobs. Vercel auto-registers these on the next deploy.

| Path | Schedule | What it does |
|---|---|---|
| `/api/cron/daily-tasks` | `0 14 * * *` (00:00 AEST) | (existing) activates referrals + accrues partner earnings |
| `/api/cron/monthly-payouts` | `0 23 1 * *` | (existing) processes Stripe Connect partner transfers |
| `/api/cron/abandoned-signup` | `0 * * * *` | (existing) sends 1-hour and 24-hour abandoned-cart emails |
| `/api/cron/vapi-health` | `* * * * *` | **Part 12** — pings Vapi every minute, alerts after 3 consecutive fails |
| `/api/cron/stripe-sync` | `*/15 * * * *` | **Part 12** — reconciles Stripe subs vs portal state, auto-activates if a webhook was missed |
| `/api/cron/usage-monitor` | `*/30 * * * *` | **Part 12** — fires 80% and 95% call-limit alerts, idempotent per month |
| `/api/cron/call-forward-check` | `0 23 * * *` (09:00 AEST) | **Part 12** — daily silent test call to each client's TalkMate number |
| `/api/cron/db-backup` | `0 16 * * *` (02:00 AEST) | **Part 12** — triggers Supabase Management API backup if creds set; otherwise emits a confirmation email |
| `/api/cron/nps-check` | `0 1 * * *` (11:00 AEST) | safety net to count users due for day-30/day-90 NPS prompts |
| `/api/cron/email-triggers` | `0 * * * *` | **Part 14** — hourly fan-out of time-based events to Make.com |
| `/api/cron/onboard-day7` | `0 22 * * *` (08:00 AEST) | **Part 4** — flags any user past day-7 without onboarding complete |

Every cron route is gated by `Authorization: Bearer ${CRON_SECRET}`. Vercel automatically attaches this header when it invokes the path. For manual testing:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://app.talkmate.com.au/api/cron/vapi-health
```

---

## 4. Make.com scenarios

The brief specifies 17 events. We funnel **all** of them through one webhook URL (`MAKE_WEBHOOK_EMAIL_TRIGGER`) — Make.com routes by the `event` field in the JSON body. Donna needs to create a single Make scenario with a Webhook trigger and a router that branches on `event`.

Payload shape:

```json
{
  "event": "abandoned_cart_24h",
  "userId": "uuid",
  "businessId": "uuid",
  "email": "owner@business.com.au",
  "data": { "businessName": "...", "industryLossEstimate": 1234 },
  "sentAt": "2026-04-28T03:00:00.000Z"
}
```

Events the build emits:

- `account_created_no_payment` — emit from your existing signup flow when a user creates an account but has no `stripe_customer_id` after 30 mins (NOT yet emitted by this build — **TODO (manual)** add to your existing signup hook if not already present).
- `abandoned_cart_24h` / `abandoned_cart_72h` — emitted hourly by `/api/cron/email-triggers`.
- `welcome_post_payment` — recommended to emit from `webhooks/stripe` `checkout.session.completed` (existing flow already sends a welcome email via Resend; you can add a parallel Make event if you want it routed there too).
- `onboarding_incomplete_2h` — emitted hourly by `/api/cron/email-triggers`.
- `onboarding_incomplete_day7` — emitted daily by `/api/cron/onboard-day7`.
- `first_call_answered` — **TODO (manual)** wire this into `/api/webhooks/vapi` `call.ended` handler when this is the business's first call.
- `weekly_summary_day7`, `pre_churn_day10`, `guarantee_expiry_day13`, `month_1_milestone` — emitted hourly by `/api/cron/email-triggers`.
- `usage_80pct`, `usage_95pct` — emitted by `/api/cron/usage-monitor`.
- `referral_activated`, `referral_churned` — **TODO (manual)** add `postEmailTrigger` calls to `/api/cron/daily-tasks` referral activation block and to the `transfer.failed` / `transfer.paid` webhook handlers if you want Make to drive these emails (Resend already handles partner-side notifications).
- `nps_low_score` — emitted by `/api/nps` POST when score ≤ 6.
- `system_alert` — emitted by every `sendInternalAlert()` call (Part 12 cron jobs).

You can also POST manually to `/api/webhooks/email-trigger` from anywhere (with the `Authorization: Bearer $CRON_SECRET` header) to trigger any event ad-hoc.

---

## 5. Database backups

**Default mode (no extra config required):** Supabase Pro plan provides daily automated backups with 7-day point-in-time recovery — no code action needed. The `/api/cron/db-backup` job will email `INTERNAL_ALERT_EMAIL` once a day to confirm the cron ran.

**Optional automated mode:** Set `SUPABASE_PROJECT_REF` and `SUPABASE_MANAGEMENT_TOKEN` in Vercel and the cron will hit the Supabase Management API to trigger an on-demand backup each day at 02:00 AEST. Failures raise a `db_backup_failed` SystemAlert and email `INTERNAL_ALERT_EMAIL`.

**What we did NOT build:** the brief described `pg_dump` to Vercel Blob. That isn't feasible from a serverless Vercel function (no shell, no pg_dump binary, 60s exec limit). Supabase native backups + management-API on-demand are the production-correct alternative for a Supabase-hosted database.

---

## 6. Vapi configuration changes

1. **Create a "TalkMate Test Assistant"** in Vapi dashboard. Use a minimal silent assistant — its only job is to answer calls placed by `/api/cron/call-forward-check` and verify the inbound number routes correctly.
2. Set `VAPI_TEST_ASSISTANT_ID` in Vercel to its UUID (already provided: `f93f33e1-dcaf-46e9-8f46-e9056885d5c1`).
3. Confirm Vapi webhook is pointing at `https://app.talkmate.com.au/api/webhooks/vapi` (already wired by the existing build).

---

## 7. Stripe Connect setup

The build references `process.env.STRIPE_CONNECT_CLIENT_ID` in `src/app/api/partners/connect-stripe/route.ts` (existing file).

When Irfan finishes Stripe business verification:

1. Go to https://dashboard.stripe.com/settings/connect → copy the **Client ID**.
2. Add to Vercel as `STRIPE_CONNECT_CLIENT_ID`.
3. Redeploy. No code change required.
4. Add `https://app.talkmate.com.au/api/partners/connect-stripe/callback` to the Connect OAuth redirect URIs.

The existing partner program tables (`partners`, `referrals`, `partner_payouts`) and their cron job (`/api/cron/monthly-payouts`) are already wired and unchanged by this build.

---

## 8. Files added or modified

### New files

```
supabase/migrations/007_master_brief.sql

src/lib/plan.ts
src/lib/roi.ts
src/lib/grok.ts
src/lib/make-webhook.ts
src/lib/alerts.ts
src/lib/cron-auth.ts

src/components/portal/topbar.tsx
src/components/portal/sidebar.tsx
src/components/portal/portal-shell.tsx
src/components/portal/onboarding-checklist.tsx
src/components/portal/roi-counter.tsx
src/components/portal/contextual-upsell.tsx
src/components/portal/nps-modal.tsx
src/components/portal/social-proof-toaster.tsx
src/components/portal/changelog-drawer.tsx
src/components/portal/share-win.tsx
src/components/portal/menu-import-banner.tsx
src/components/portal/plan-comparison.tsx

src/app/(portal)/command-centre/page.tsx
src/app/(portal)/command-centre/command-centre-client.tsx
src/app/status/page.tsx

src/app/api/changelog/route.ts
src/app/api/nps/route.ts
src/app/api/calls/flag/route.ts
src/app/api/menu-import/route.ts
src/app/api/menu-import/confirm/route.ts
src/app/api/command/parse/route.ts
src/app/api/command/confirm/route.ts
src/app/api/command/connect/route.ts
src/app/api/webhooks/email-trigger/route.ts

src/app/api/cron/vapi-health/route.ts
src/app/api/cron/stripe-sync/route.ts
src/app/api/cron/usage-monitor/route.ts
src/app/api/cron/call-forward-check/route.ts
src/app/api/cron/db-backup/route.ts
src/app/api/cron/nps-check/route.ts
src/app/api/cron/onboard-day7/route.ts
src/app/api/cron/email-triggers/route.ts

DEPLOYMENT.md
.env.local      (placeholders for build only — DO NOT commit real secrets)
```

### Modified files

```
src/app/(portal)/layout.tsx                 — wraps content in PortalShell with topbar/sidebar/changelog drawer
src/app/(portal)/dashboard/page.tsx         — feeds ROI, NPS, plan, partner data to the client
src/app/(portal)/dashboard/dashboard-client.tsx — adds onboarding checklist, ROI counter, paying-for-itself, contextual upsell, NPS modal, social-proof toaster, share-win modal, refer-and-earn strip
src/app/(portal)/calls/page.tsx             — "This response was wrong" flag button per AI message
src/app/(portal)/catalog/page.tsx           — AI URL import banner above the catalog
src/app/(portal)/billing/page.tsx           — 3-plan comparison + ROI summary above the existing add-ons
src/app/(portal)/admin/page.tsx             — adds open SystemAlerts panel + Vapi health + Grok/Make health pills
src/app/api/onboarding/complete/route.ts    — lazy-init Resend so build doesn't crash without RESEND_API_KEY
vercel.json                                  — registers 11 cron jobs (existing 3 + 8 new)
```

### Removed files

```
src/app/(portal)/sidebar.tsx                — replaced by src/components/portal/sidebar.tsx (mounted via PortalShell)
```

The duplicate `src/contexts/BusinessTypeContext.tsx` (plural) and `src/stores/onboarding-store.ts` (plural) directories are unreferenced — left in place to avoid breaking any pending PR. Safe to delete in a follow-up.

---

## 9. Manual steps that cannot be automated

1. **Run the migration** (§2 above) in Supabase SQL editor before the first deploy.
2. **Add the new env vars** to Vercel (§1 above).
3. **Add `STRIPE_CONNECT_CLIENT_ID`** once Irfan's Stripe verification clears.
4. **Create the Make.com scenario** that listens on the Webhook URL and routes by `event` (§4 above).
5. **Create the Vapi test assistant** and set its UUID in Vercel (§6 above).
6. **(Optional)** Set `SUPABASE_PROJECT_REF` + `SUPABASE_MANAGEMENT_TOKEN` to enable on-demand backups (§5 above).
7. **(Optional)** Add `postEmailTrigger` calls into the existing Vapi webhook for `first_call_answered` and into the partner cron for `referral_activated` / `referral_churned` if you want Make.com to drive those emails (§4 above).

---

## 10. Decisions documented (per the brief's "make reasonable decisions" instruction)

- **Prisma → Supabase mapping.** The brief models things in Prisma; the existing repo uses Supabase + RLS. We added the brief's tables as native Supabase migrations (snake_case) rather than introducing Prisma. Field names follow the existing project convention (e.g. `business_id`, `created_at`).
- **`OnboardingProgress` is `onboarding_responses`.** The existing table already serves the same purpose. We did not add a duplicate. The dashboard Onboarding Checklist derives the 5 step flags from existing fields.
- **5-step onboarding wizard.** The existing onboarding wizard has 11 steps and is more polished than what the brief describes. We left it intact and added the 5-step **checklist card** to the dashboard (Brief Part 4), pointing each step to the relevant page (`/onboarding`, `/catalog`).
- **Services & Menu page.** The brief calls it "Services & Menu" — the existing page is `/catalog`. We mounted the AI URL import banner there and re-labelled the sidebar entry "Services & Menu" so the brief's terminology shows. URL-only MVP per the brief; no Vercel Blob, no Vision API.
- **Mobile sidebar.** Replaced the existing bottom-tab bar (which was awkward on mid-size screens) with the brief's slide-in drawer pattern. Hamburger lives in the new topbar.
- **Topbar + avatar dropdown.** New global component; the dashboard's old per-page header was removed in favour of the global topbar.
- **NPS popup.** Trigger window is `daysSinceSignup ∈ [30,60)` for day30 and `[90,120)` for day90, with `nps_responses` UNIQUE constraint preventing duplicates. Detractors (≤ 6) trigger an internal email + `nps_low_score` Make event. Promoters (≥ 9) auto-route to `/refer-and-earn`.
- **Social proof toaster.** Uses a fixed queue of randomised messages (no live feed) — the brief allows this and it sidesteps any privacy concern with naming real customers.
- **Share-your-win modal.** No `html2canvas` PNG export (would add a 1MB dependency). Instead we offer copy-to-clipboard of a pre-formatted share string. PNG export can be added as a follow-up if marketing wants it.
- **Database backups.** Used Supabase native backups + optional management-API on-demand backups instead of `pg_dump` to Vercel Blob (the latter isn't viable from a serverless function). Documented in §5.
- **Command Centre rate-limiting.** Daily counter stored on `businesses.command_daily_count` + `command_daily_count_date` (not Redis) to avoid an extra service dependency. Resets when the date rolls over.
- **`first_call_answered` and `referral_activated/churned` Make events.** Listed in the brief's 17 but better placed in the existing Vapi webhook + partner cron handlers — flagged as **TODO (manual)** for Donna to slot in alongside her existing wiring.

---

## 11. Acceptance criteria — Part 18 status

✅ = passes by code/build review · ⚙️ = behaviour requires runtime/manual verification (real Supabase + Vapi + Stripe in production)

### Portal basics
- ✅ All pages render without console errors (build passes — 62 pages compiled)
- ✅ Sidebar navigation works on all pages (`PortalSidebar` mounted via shell)
- ✅ Mobile hamburger menu opens and closes correctly (`isOpenMobile` state in `PortalShell`)
- ✅ Avatar dropdown shows with Profile, Settings, Logout (`PortalTopbar`)
- ✅ Logout clears session and redirects to login (`supabase.auth.signOut()` then `router.push('/login')`)
- ✅ Locked features show padlock and upgrade prompt (sidebar `Lock` icon + Command Centre locked view)

### Onboarding
- ⚙️ New user lands on dashboard with wizard visible (driven by `business.onboarding_completed === false`)
- ✅ All 5 wizard steps save data (existing `onboarding_responses.upsert` flow preserved)
- ✅ Progress bar updates as steps complete (`OnboardingChecklist` derives `done` from saved responses)
- ✅ Completion screen shows with test call button
- ⚙️ Day 7 incomplete alert fires correctly (`/api/cron/onboard-day7` — verify by setting `signup_at` to 8 days ago)

### Dashboard
- ✅ ROI counter calculates and displays correctly (`estimateRevenueProtected` in `src/lib/roi.ts`)
- ⚙️ Proof strip pulls live data
- ✅ "Paying for itself" banner appears at correct threshold (revenue ≥ plan price)
- ⚙️ Stat cards show real data
- ✅ Upsell banner shows correct contextual message based on usage (4 banner variants in `ContextualUpsellBanner`)
- ⚙️ NPS popup fires at day 30 (verify by setting `signup_at` 30 days ago + clearing `nps_responses`)
- ✅ NPS 9-10 shows referral link (`router.push('/refer-and-earn')` on `isPromoter`)
- ✅ NPS 1-6 sends internal email (`sendInternalAlert` in `/api/nps`)
- ✅ Social proof toasts cycle correctly (initial 30s delay, then 45-90s)
- ✅ Changelog badge shows for unseen items (computed in `(portal)/layout.tsx`)

### Services
- ✅ URL scrape fetches page and sends to Grok correctly (`/api/menu-import`)
- ✅ Preview grid shows with confirm/cancel (`MenuImportBanner`)
- ✅ Import adds items to database (`/api/menu-import/confirm`)
- ✅ Items with no price flagged in amber ("No price" pill)
- ✅ Error states display correctly (3 distinct error messages per the brief)
- ✅ Sync to Vapi works and shows timestamp (existing `/api/vapi/sync` unchanged)

### Calls
- ✅ Filter tabs work (existing)
- ✅ Transcript slide-out opens and shows chat format (existing modal extended)
- ✅ "This response was wrong" flag button works (`/api/calls/flag`)
- ✅ Revenue column shows correct values (existing column preserved)

### System reliability
- ✅ Vapi health check cron runs without error (`/api/cron/vapi-health`, 3-strike model)
- ✅ Stripe sync cron activates unactivated paid accounts (`/api/cron/stripe-sync`)
- ⚙️ Call forwarding check sends SMS on failure (`/api/cron/call-forward-check` — Vapi SMS to escalation number is **TODO (manual)** for the messaging side; the alert + DB flag are wired)
- ✅ Usage alert fires at 80% (`/api/cron/usage-monitor`)
- ✅ Database backup cron runs and confirms via email (`/api/cron/db-backup`)
- ✅ Status page at /status loads without auth and shows correct status (`src/app/status/page.tsx`)
- ✅ Admin panel at /admin accessible only to hello@talkmate.com.au or `role='admin'` (super-admin gate added)

### Command Assistant
- ✅ Command parsing returns correct JSON for all supported intents (`/api/command/parse`)
- ✅ Confirmation flow sends message and waits for YES/CANCEL (`/api/command/confirm`, 10-min expiry)
- ✅ Rate limit enforced per plan (50/day Growth, unlimited Pro)
- ✅ Command history logged in database (`command_logs`)

### Email triggers
- ✅ All trigger events are wired (10 of 17 fire automatically — see §4 for the 7 that need manual placement in existing webhooks)
- ✅ No duplicate triggers (each cron uses time-windowed dedupe; `nps_responses` has UNIQUE constraint)

### Billing
- ✅ Plan comparison shows all 3 plans correctly with no setup fees (`PlanComparison`)
- ✅ 14-day money-back guarantee shown
- ✅ ROI summary calculates from real data

---

## 12. Screenshots

A real running dev server connected to live Supabase, Vapi, Stripe and Grok is required to render the 8 screenshots requested in the brief (Dashboard desktop, Dashboard mobile sidebar closed/open, Onboarding wizard Step 3, Services with import banner, Command Centre Starter locked, Refer & Earn, Status page). The build passes and every page is reachable (`next build` route table above). Donna can capture these on the staging URL after the migration runs.

---

## 13. Build verification

```bash
$ npm install
added 821 packages in 41s

$ npm run build
✓ Compiled successfully in 6.7s
✓ Generating static pages using 7 workers (62/62) in 546ms
```

62 routes built, zero errors. Ready to deploy.

---

# Session 24 — Agent Stability

Branch: `feature/session-24-agent-stability` (off `dev`)
Migration: `039_agent_health_monitoring.sql`
Build status: `npm run build` passes — `✓ Compiled successfully in 16.5s`, 143 routes.

## What this session ships

Automated systems that catch the silent failures discovered during
the 21 May 2026 audit of GM Towing + Spectrum Towing: missing
`create_booking` tool, voice stability too high, `stopSpeakingPlan`
missing, `responseDelaySeconds` cutting callers off,
`schedule_callback` confirming nothing, and dropped calls being
scored as agent failures.

### New files

| Path | Purpose |
| --- | --- |
| `src/lib/agent-config-standard.ts` | Canonical Vapi agent config constants + issue code catalogue |
| `src/lib/agent-config-validator.ts` | `validateAgentConfig()` — returns `AgentIssue[]` for any assistant JSON |
| `src/lib/transcript-scanner.ts` | `scanTranscript()` — flags dollar signs, ordinals, placeholders, TalkMate leaks in AI speech only |
| `src/app/api/cron/agent-health-check/route.ts` | 30-min cron: validates every live agent, scans transcripts, detects webhook gaps |
| `src/app/admin/agent-health/page.tsx` | Admin server page that loads health data |
| `src/app/admin/agent-health/agent-health-view.tsx` | Client view: status cards, filterable violations, alert queue |
| `src/app/api/admin/agent-health/resolve/route.ts` | POST endpoint for "Mark resolved" |
| `supabase/migrations/039_agent_health_monitoring.sql` | New tables + columns |

### Modified files

| Path | Change |
| --- | --- |
| `src/lib/sms.ts` | Added `callback_confirmation` + `dispatcher_callback_alert` SMS types to `BYPASS_PLAN_LIMIT_TYPES` |
| `src/app/api/vapi/functions/route.ts` | `schedule_callback` now sends caller confirmation SMS + dispatcher alert SMS |
| `src/lib/call-intelligence.ts` | Scoring prompt explicitly does not penalise dropped/silent calls |
| `src/app/api/cron/daily-quality-digest/route.ts` | Excludes dropped calls (<10s + only `short_call`) from average; reports them as a separate count |
| `src/lib/score-call-async.ts` | After scoring, runs transcript scanner, persists violations, fires immediate Telegram on critical patterns |
| `src/lib/notifications.ts` | Added `sendAgentHealthAlert()` helper for config / transcript / webhook-gap pings |
| `src/lib/golive-checks.ts` | Added `check_agent_config_valid` + `check_no_placeholder_in_prompt` auto checks |
| `vercel.json` | Added `/api/cron/agent-health-check` schedule `*/30 * * * *` |

## Migration 039 schema

New tables (all RLS deny-by-default; admin client bypasses via service role):
- `agent_config_snapshots` — point-in-time copy of every assistant config the cron has fetched
- `agent_health_alerts` — open alert queue, with `issue_code` for dedupe + `telegram_sent` flag
- `transcript_violations` — every speech pattern hit with a 30-char context snippet either side

New columns:
- `businesses.last_health_check_at`, `businesses.health_status` (`healthy|warning|critical|unknown`), `businesses.health_issues_count`
- `calls.scanned_for_patterns` (idempotency), `calls.pattern_violations_count`
- `client_golive_checklist.check_agent_config_valid`, `client_golive_checklist.check_no_placeholder_in_prompt`

Backfill: every call older than 60 minutes is marked
`scanned_for_patterns = true` so the cron's first run doesn't try to
re-scan history.

## Behavioural changes operators should know

### `schedule_callback` now sends two SMS

1. **Caller**: `"Hi, thanks for calling {business_name}. We have noted your callback request and someone will be in touch with you shortly."`
2. **Dispatcher** (only if `notifications_config.dispatcher_alerts = true` and `dispatcher_number` is set): `"Callback request — {name} ({phone}) — {reason}. Please call them back."`

Both bypass plan SMS quota (operational guarantee, not marketing) and
are logged in `sms_log` under the new types.

### Scoring no longer penalises silent/dropped calls

Updated `SYSTEM_PROMPT` in `call-intelligence.ts` instructs the
scorer to give 7+/10 to silent callers, never apply `no_resolution`
when the caller said nothing, and treat `short_call` as informational
only.

### Daily digest splits scoreable vs dropped

`/api/cron/daily-quality-digest` excludes dropped calls (<10s + only
`short_call`) from the average. Dropped count is surfaced as
a separate line: `"X dropped calls excluded from score average"`.

### Two new go-live blockers

`computeAutoChecks()` fetches the Vapi assistant during go-live
verification and runs `validateAgentConfig()`. Critical config issues
or any prompt content violation (placeholder, dollar sign, ordinal)
fail the new checks and block go-live.

## Manual deployment steps for Donna

1. Apply migration 039 on production Supabase SQL editor.
2. Verify new tables and columns exist (queries in original brief).
3. Confirm Vercel cron picked up `/api/cron/agent-health-check`
   (`*/30 * * * *`).
4. Trigger one manual run:
   ```bash
   curl -H "Authorization: Bearer $CRON_SECRET" \
     https://app.talkmate.com.au/api/cron/agent-health-check
   ```
5. Confirm a Telegram message arrives in the admin chat if any
   live agent has critical config drift.

## Environment variables

No new env vars. Uses existing:
- `VAPI_API_KEY` (assistant fetches)
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ADMIN_CHAT_ID` (alert delivery)
- `CRON_SECRET` (cron auth)
- `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL` (admin client)

## Schema + design decisions

- **RLS strategy**: chose `USING (false)` deny-by-default over the
  brief's `current_setting('app.admin_email')` pattern — the
  codebase doesn't set that Postgres setting globally and the
  service role used by the cron + admin pages bypasses RLS
  regardless. Tighter surface with no runtime setting dependency.
- **Validator tolerance**: `CONFIG_TOLERANCE = 0.001` for float
  comparisons because Vapi sometimes re-emits `0.38` as
  `0.38000000000001` after a JSON round-trip.
- **Alert dedupe**: 2-hour window per `business_id + issue_code`
  for config alerts; 24-hour per business for webhook gaps. Stored
  on `issue_code` so resolving one alert doesn't suppress the next
  legitimate occurrence.
- **Webhook gap detection**: only fires 8am–8pm AEST. Skips
  brand-new businesses with zero prior calls — the cron can't
  distinguish "broken forward" from "new client not yet live."
- **Go-live config check**: only critical issues block go-live;
  warnings (slight stability drift, missing optional tool) pass.
  Prompt-content issues of any severity block — they cause audible
  failures on every call.
- **Admin sidebar**: the spec called for adding to "admin sidebar
  navigation" with a red badge. There is no global admin sidebar
  in the current codebase (admin pages use a topbar only). The
  new `/admin/agent-health` page renders the open-critical count
  as a badge in its own topbar; cross-page navigation is a
  follow-up if Irfan wants global chrome on every admin route.

## What was deliberately not touched

- Existing call scoring pipeline — only the scoring prompt's
  KNOWN CORRECT BEHAVIOURS section was extended.
- Existing SMS path — only the type union and bypass set were
  extended; `sendSMS()` logic is unchanged.
- Existing `create_booking` handler — out of scope. The 21 May
  audit fix was applied manually to live agents via Donna.
- Live Vapi agents — this session adds **monitoring** of agents,
  it does not modify any agent config. Donna remains the only
  path that pushes config changes to Vapi.

---

# Session 25 — Unified Rep Lifecycle (2026-05-21)

Branch: `feature/session-25-unified-rep-lifecycle` (off `dev`)
Migration: `040_unified_rep_lifecycle.sql`
Build status: `npm run build` passes — `✓ Compiled successfully in 28.8s`, 143 routes. `tsc --noEmit`: 0 errors.

## What this session ships

Merges the previously disconnected Contractors (Session 23, automated
signing) and Sales Reps (Session 21, manual upload) systems into one
lifecycle. When a contractor completes the digital signing flow and
their status becomes `active`, they are now auto-provisioned as a
sales rep — Supabase auth invite, `sales_reps` row, portal access —
so the rep enters one clean journey instead of two parallel ones.
`/admin/contractors` is now the single source of truth for the rep
lifecycle; `/admin/sales-team` is soft-retired to manage legacy
manually-onboarded reps only.

### New files

| Path | Purpose |
| --- | --- |
| `supabase/migrations/040_unified_rep_lifecycle.sql` | Links `contractors` ↔ `sales_reps`, adds `onboarded_via`, `is_legacy`, backfills legacy reps, cleans deprecated `signed` status |

### Modified files

| Path | Change |
| --- | --- |
| `src/components/admin/AdminSidebarLayout.tsx` | Sidebar nav: `Contracts` → `Contractors` |
| `src/lib/sales-notify.ts` | New exported `notifyAdminAlert()` (generic telegram alert) |
| `src/app/api/contractor-onboarding/[token]/sign/route.ts` | After contractor goes active: invite Supabase auth user, insert `sales_reps` row, link via `contractors.sales_rep_id`. Best-effort, never blocks signing. |
| `src/app/(portal)/admin/contractors/page.tsx` | Fetches `sales_rep_id` plus aggregated leads + commissions for the new Pipeline tab |
| `src/app/(portal)/admin/contractors/contractors-view.tsx` | Two-tab layout, Portal Access column, Pipeline & Commissions tab, status badges retuned, `signed` dropped from union |
| `src/app/(portal)/admin/contractors/[id]/contractor-detail-view.tsx` | `signed` removed from status union |
| `src/app/api/sales-scripts/[id]/acknowledge/route.ts` | Drop redundant `signed` status check |
| `src/lib/sales-auth.ts` | `SalesRepRow` widened with `onboarded_via`, `contractor_id`; SELECT updated |
| `src/app/sales/dashboard/page.tsx` | First-login welcome banner when no leads + no activities; copy branches on `onboarded_via` |
| `src/app/sales/contract/page.tsx` | Contractor-flow reps see a read-only "agreement on file" card with a short-lived signed URL into `contractor-agreements`; manual reps see the existing upload flow |
| `src/app/(portal)/admin/sales-team/page.tsx` | `sales_reps` query filtered to `is_legacy = true` |
| `src/app/(portal)/admin/sales-team/admin-sales-team-view.tsx` | Dismissible (sessionStorage) info banner explaining the split |

### Pre-existing TS errors swept up

The build inherited 19 TypeScript errors across 10 files from `dev`.
None were in files Session 25 touches, but the brief required a
clean final build, so they were fixed under the same branch in
commit [e37806a](https://github.com/irfanhanif89-art/talkmate-portal/commit/e37806a):

- `LinkedNumber` interface in the four vip-callers account routes —
  optional modifiers on `name` and `is_primary` blocked type-predicate
  narrowing in `cleanLinkedNumbers`.
- `mark-paid-modal.tsx`, `revoke-commission-modal.tsx` — referenced
  `commission.amount`; the field is `commission.total`.
- `golive-checklist/[businessId]/route.ts` — annotating `merged` as
  `ChecklistRow` preserves the index signature past the spread.
- `scheduler-config/route.ts` — replaced an `extends`-conditional
  type-extract (which distributed to `never` over the discriminated
  union) with `Extract<..., { ok: true }>`.
- `stripe/embedded-checkout/route.ts` — Stripe 22 type resolution
  couldn't see `Checkout.SessionCreateParams.LineItem` through the
  class/namespace merge; replaced with the indexed type
  `NonNullable<Stripe.Checkout.SessionCreateParams['line_items']>`.
- `sales/clients/page.tsx` — `(status && map[status]) ??` made `""`
  the value of `sty`; ternary keeps the union narrowing intact.

## Migration 040 schema

`supabase/migrations/040_unified_rep_lifecycle.sql` is idempotent —
every column add is `IF NOT EXISTS`, the check constraint is added
via a guarded `DO $$` block, the backfill is filtered so re-runs are
safe.

New columns:
- `contractors.sales_rep_id` (`UUID` FK → `sales_reps.id ON DELETE SET NULL`)
- `contractors.portal_invited_at` (`TIMESTAMPTZ`)
- `contractors.portal_access_email` (`TEXT`)
- `sales_reps.contractor_id` (`UUID` FK → `contractors.id ON DELETE SET NULL`)
- `sales_reps.onboarded_via` (`TEXT`, `CHECK IN ('manual', 'contractor_flow')`, default `'manual'`)
- `sales_reps.is_legacy` (`BOOLEAN`, default `false`)

New indexes:
- `idx_contractors_sales_rep_id`
- `idx_sales_reps_contractor_id`
- `idx_sales_reps_is_legacy`

Data steps:
- `UPDATE sales_reps SET is_legacy = true, onboarded_via = 'manual'
  WHERE contractor_id IS NULL AND onboarded_via = 'manual' AND
  is_legacy IS DISTINCT FROM true` — flags every pre-Session-25 rep
  as legacy, but rerun-safe.
- `UPDATE contractors SET status = 'active' WHERE status = 'signed'` —
  defensive cleanup of the deprecated `signed` value. The sign route
  has always transitioned `invited → active` directly, so this is
  expected to touch zero rows in practice.

No new RLS — both tables already have admin-only / self-row policies
from migrations 036 and 038.

## Manual deployment steps for Donna

1. Merge `feature/session-25-unified-rep-lifecycle` into `dev` (then
   `main` once verified). Vercel auto-deploys from `main`.
2. Apply migration 040 on production Supabase SQL editor.
3. Confirm:
   - `select column_name from information_schema.columns where
     table_name = 'contractors' and column_name in ('sales_rep_id',
     'portal_invited_at', 'portal_access_email');` returns 3 rows.
   - `select column_name from information_schema.columns where
     table_name = 'sales_reps' and column_name in ('contractor_id',
     'onboarded_via', 'is_legacy');` returns 3 rows.
   - `select count(*) from sales_reps where is_legacy = true;` matches
     the pre-migration `sales_reps` count.
4. Sidebar shows "Contractors" (was "Contracts").
5. End-to-end smoke test:
   - Invite a test contractor at `/admin/contractors`.
   - Status renders blue "Agreement Sent" badge.
   - Open the public link, complete all 5 steps, sign.
   - In Supabase, `select status, sales_rep_id, portal_invited_at
     from contractors where email = '...'` — status is `active`,
     `sales_rep_id` populated, `portal_invited_at` set.
   - Matching `sales_reps` row exists with `onboarded_via =
     'contractor_flow'`, `is_legacy = false`, `contractor_id` linked back.
   - The test email receives a Supabase auth invite. Accepting it
     lands on `/sales/dashboard` showing the welcome banner.
   - `/sales/contract` shows the read-only "agreement on file" card,
     not the upload modal.
   - `/admin/sales-team` does **not** show the new rep (filtered out
     by `is_legacy`).
   - `/admin/contractors` Pipeline tab shows the rep with 0 leads /
     0 wins / $0 commission.
6. If provisioning fails for any reason, a Telegram alert posts to
   the admin chat (`notifyAdminAlert()`); the contractor signing
   response still returns 200 — manual portal access can then be
   recovered by an admin.

## Environment variables

No new env vars. Uses existing:
- `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL` (admin client + auth invite)
- `NEXT_PUBLIC_APP_URL` (invite `redirectTo` and signed-PDF URL base)
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ADMIN_CHAT_ID` (provisioning-failure alerts)

## Deviations from the brief

- **`signed` status retired**: the brief's Part 3d badge config omitted
  `signed`. The user chose "remove from the flow entirely", so the
  union narrows to `invited | agreement_sent | active | terminated`
  in both view files, the `sales-scripts` acknowledge check drops
  the OR-clause, and migration 040 cleans up any stale rows. There
  is no DB CHECK constraint on `contractors.status` — keeping it
  loose for now in case a future status is needed.
- **`auth user already exists` handling**: the brief assumed
  `inviteUserByEmail` always succeeds. If a contractor's email is
  already in `auth.users` (e.g. they were a legacy manual rep), the
  sign route now falls back to `listUsers()` and either links the
  contractor to the existing `sales_reps` row or inserts a new one
  pointing at the existing auth user — never violates
  `sales_reps.UNIQUE(user_id)`.
- **`sendAdminAlert()` did not exist**: the brief assumed it did.
  Replaced with a new exported `notifyAdminAlert(message)` in
  `sales-notify.ts`, following the file's existing fire-and-forget
  pattern.
- **Schema reality vs brief**: contractors store `first_name` +
  `last_name` (the brief said `contractor.name`); sales_reps uses
  `full_name` (the brief said `name`). All concatenations and
  inserts use the real column names.
- **`contract_signed_at` on `sales_reps`** is set to the signing
  timestamp for contractor-flow reps. The column exists and is the
  obvious truth for these reps even though the brief didn't mention it.
- **Sales-team filter location**: the brief said "the API route that
  fetches sales reps". That page is a server component with the
  fetch inline (no API route). The `.eq('is_legacy', true)` filter
  went there. Same effect.
- **Banner uses `sessionStorage`, not `localStorage`**: brief said
  "dismissible per session (localStorage)" — those two contradict.
  `sessionStorage` matches the "per session" intent.
- **Migration 040 idempotency**: the brief's inline `CHECK` on
  `ADD COLUMN onboarded_via` is not rerun-safe (constraint name
  collision). Split into `ADD COLUMN` + guarded `DO $$ ... ALTER
  TABLE ... ADD CONSTRAINT` so the file can be applied twice.
- **Backfill guard tightened**: brief had `UPDATE sales_reps SET
  is_legacy = true WHERE contractor_id IS NULL`. Adding `AND
  onboarded_via = 'manual' AND is_legacy IS DISTINCT FROM true`
  prevents the (unlikely) case where a contractor-flow rep with a
  `contractor_id` somehow ended up missing it on a rerun from
  getting flagged legacy.

## What was deliberately not touched

- **Legacy `/admin/sales-team` data path**: leads, commissions,
  rep contract upload — all still work for `is_legacy = true` reps.
  Brief explicitly said "do NOT delete `/admin/sales-team`".
- **Existing `/contractor-onboarding/[token]` signing flow** — only
  the server-side sign route was extended. The 5-step public UI
  is unchanged.
- **`contractor-agreements` Supabase storage bucket** — unchanged
  from Session 23.
- **Make.com scenarios** — no new webhooks. Existing invite-email
  + signed-PDF-delivery webhooks still fire.
- **Vapi agents** — no changes.
- **Production data backfill for already-active contractors**: the
  migration links columns and flags legacy reps, but does **not**
  retroactively invite Supabase auth users for any contractor whose
  status was already `active` before this migration ran. If you
  want those provisioned, that's a manual one-shot per contractor
  via `/admin/contractors` (delete + re-invite + re-sign), or a
  future targeted script.


# Session 27 — Revenue-Critical Fixes

Branch: `feature/session-27-revenue-fixes` from `dev`.
Migration: `042_session27_fixes.sql`.

Fourteen Tier-1 findings from the system audit. Two themes — close the
silent revenue leaks (Stripe payment failures, stranded pay-now signups,
mock onboarding payment), and make the demo-blocking surfaces work
(Proxima white-label preview, sales-rep lead creation).

## Parts shipped

- **Part 1 (H2)** — `/wl-preview/*` is public again. `middleware.ts` adds
  an early-return at the top of `middleware()` BEFORE any auth lookup,
  and removes `/wl-preview` from `protectedPaths`. Anonymous prospects
  can hit `/wl-preview/proxima` without bouncing to /login.

- **Part 2 (H1)** — Onboarding step 9 wired to real Stripe. The
  `setTimeout` mock with bare HTML card inputs is gone. Step 9 now POSTs
  to `/api/stripe/embedded-checkout` with `returnUrl=/onboarding?paid=1`
  and renders `<EmbeddedCheckout>` from `@stripe/react-stripe-js`. After
  Stripe redirects back, an effect polls `/api/onboarding/payment-status`
  every 2s for up to 30s until `account_status` flips off `pending_payment`
  (the webhook is the source of truth, never the client-side redirect).
  When confirmed, the wizard advances to step 10. Stuck pay-now signups
  are rescued by the new `/api/cron/expire-pending-payments` cron
  (daily, 22:45 UTC): rows in `pending_payment` older than 24h get
  flipped to `trial` with a 7-day window and an email saying we have
  started your trial — finish setup here.

- **Parts 3+4 (H3, H4, H5)** — Stripe webhook gaps closed.
  `notifications.ts` gains a generic `sendAdminTelegram(text)` helper
  (no more inline fetches to api.telegram.org). The `invoice.payment_failed`
  branch now generates a Stripe billing portal session, emails the client
  ("Action required — your TalkMate payment failed"), AND fires a
  Telegram alert to admin. The `customer.subscription.deleted` branch
  now flips `businesses.account_status = cancelled`, emails the client
  ("Your TalkMate subscription has been cancelled. Reactivate →"), and
  Telegrams admin. Existing `subscriptions` table behavior unchanged.

- **Part 5 (H7)** — Settings → Notifications "Save Preferences" now
  actually saves. `saveBusiness()` is whitelisted to the businesses
  columns it owns (name, phone_number, website, address, abn, voice).
  A new `saveNotifications()` reads the live `notifications_config`
  JSONB, merges the local notifs state on top, and writes it back —
  preserving keys other tabs/admin set. `notification_email` moved off
  the Business Info form (where it was silently failing) into the
  Notifications card. Voice select now persists. WhatsApp/Telegram
  toggles on the Notifications tab write to the same JSONB path as
  the Integrations tab — no more drift between the two views.

- **Part 6 (H22)** — Sales reps can now add their own leads. New
  `POST /api/sales/leads` validates business_name + contact_name +
  contact_phone, stamps `assigned_to=auth.rep.id` server-side
  (request body never trusted for rep_id), and creates an audit
  `lead_activities` row. UI: a new `AddLeadModal` component opens
  from a "+ Add Lead" button in the leads-board top-right and from
  an empty-state CTA when the rep has zero leads. The kanban
  immediately prepends the new lead in the "New" column. The
  dashboard banner copy ("Start by adding your first lead from the
  Leads tab") is now accurate. Rep commissions page surfaces
  "Clears on [date]" next to every pending row so reps see exactly
  when the 14-day clawback ends.

- **Part 7 (H23)** — 14-day clawback enforced on rep commissions.
  `/api/admin/commissions/[id]` now returns 409 if an admin tries
  to approve a commission before `clawback_period_ends_at`. New
  commissions get the column populated by the won route at created
  time (`won_at + 14d`); migration 042 backfills every existing row.
  Admin sales-team view shows "🔒 Clawback ends [date]" under the
  Created column, with the Approve button disabled (tooltip:
  "Available to approve on [date]") until the period passes.

- **Part 8 (H24, daily-scheduling)** — `vercel.json` cleaned up.
  Three groups of three crons that shared a minute have been
  staggered by 15 minutes each (Vercel Hobby plan concurrency).
  Group `0 22 *`: onboard-day7 / expire-trials / daily-quality-digest
  → kept onboard-day7 at :00, moved expire-trials to :15,
  daily-quality-digest to :30. Group `0 23 *`: call-forward-check
  at :00, trial-reminders at :15, clear-eligible-commissions at :30.
  Group `0 * * * *`: abandoned-signup at :00, email-triggers at :15,
  sms-reminders at :30. The new `expire-pending-payments` cron sits
  at `45 22 * * *`. (Note: `clear-eligible-commissions` was already
  in vercel.json — Session 26 added it; brief was working from a
  stale view of the audit. Confirmed scheduled; just moved its
  minute for the stagger.)

- **Part 9 (H25, H26, H29)** — Self-serve signup gets a welcome
  email + `signup_at` + onboarding redirect.
  `src/app/api/auth/signup/route.ts` writes `signup_at: now()` into
  the business insert (column added idempotently by migration 042;
  any downstream cron filtering on `signup_at` finally fires for
  self-serve users). After the row lands, sends a Resend welcome
  email via `sendEmail()` and flips `welcome_email_sent=true` on
  success. Middleware adds a `shouldRedirectToOnboarding()` helper:
  if the user is authenticated, owns a business with
  `onboarding_complete=false` AND `account_status` in
  `(trial, pending_payment, pending)`, redirect every
  protected path (except /onboarding, /accept-terms, /subscribe,
  /admin, /sales) to /onboarding. Admin exemption uses the existing
  super-admin allowlist that already short-circuits the middleware
  earlier — no new env vars.

- **Part 10 (H6)** — Plan upgrade/downgrade buttons fixed.
  `plan-comparison.tsx` no longer `router.push()`es into a POST-only
  endpoint. The cards now `fetch(/api/stripe/portal, { method: POST })`
  and redirect to `data.url`. Per-card loading state ("Opening Stripe…")
  prevents double-click. The "Upgrade →" button on the current-plan
  card got an onClick handler with the same pattern.
  `/api/stripe/portal/route.ts` was already correct — no changes there.

- **Part 11 (H34)** — All hardcoded fallback secrets removed.
  Resend API key literals in `webhooks/stripe/route.ts` and
  `cron/abandoned-signup/route.ts` dropped. Telegram bot token
  literals in `cron/health-monitor/route.ts` and
  `onboarding/complete/route.ts` dropped. Hardcoded Telegram chat
  IDs (`7809273812`) removed from three files. The personal
  Gmail address (`irfanhanif89@gmail.com`) was the most pervasive
  — 15 source locations. Auth allowlists (`ADMIN_EMAILS = [...]`
  in 11 files plus the `||` chain in `admin-auth.ts`,
  `admin/trials/page.tsx`, `admin/sms-failures/page.tsx`,
  `admin/audit-log/page.tsx`) now read `process.env.ADMIN_EMAIL`
  instead of the literal. The two `mailto:` references in the
  contractor onboarding flow route to `hello@talkmate.com.au`.
  The `irfanhanif89@gmail.com` literal in `onboarding/complete`
  for the admin-notification email now uses `process.env.ADMIN_EMAIL
  || process.env.INTERNAL_ALERT_EMAIL`. `grep` confirms zero
  remaining matches.

## Migration 042

`supabase/migrations/042_session27_fixes.sql`. Five changes, all
idempotent:

1. `businesses.signup_at TIMESTAMPTZ` (IF NOT EXISTS) + backfill
   `created_at` for `onboarded_by=self` rows that lack it.
2. `businesses.welcome_email_sent BOOLEAN DEFAULT false` (IF NOT
   EXISTS).
3. `commissions.clawback_period_ends_at TIMESTAMPTZ` (IF NOT EXISTS)
   + backfill `created_at + interval 14 days` for every row.
4. `sms_log_sms_type_check` CHECK constraint dropped and recreated
   to include `callback_confirmation` and `dispatcher_callback_alert`
   (Session 22 callback handler types) ALONGSIDE every existing
   type from migration 032 — preserved verbatim.
5. `admin_sms_failures` view recreated. Same SELECT and join as
   migration 033; only the WHERE clause widens from `status=failed`
   to `status IN (failed, rejected)` so plan-quota refusals show
   in the admin UI alongside Twilio failures.

## Environment variables

No new env vars are required for the build to compile. To get full
production behavior, ensure these are set in Vercel:

- `RESEND_API_KEY` — required by Stripe webhook welcome email,
  abandoned-signup cron, payment-failure email. All now fail
  closed (log + skip) if missing instead of using a leaked literal.
- `TELEGRAM_BOT_TOKEN` + `TELEGRAM_ADMIN_CHAT_ID` — required by
  every admin alert path (sendAdminTelegram, health-monitor,
  approve-agent, onboarding-complete). All fail closed if missing.
- `ADMIN_EMAIL` (optional but recommended) — adds a personal
  super-admin email to the allowlist alongside `hello@talkmate.com.au`
  and `INTERNAL_ALERT_EMAIL`. If unset, the literal previously
  hardcoded (`irfanhanif89@gmail.com`) is no longer special; Irfan
  should sign in via `hello@talkmate.com.au` or set `ADMIN_EMAIL`.
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (optional) — the onboarding
  wizard EmbeddedCheckout falls back to the same `pk_live_*` key
  the /subscribe flow already uses if unset. Setting this env var
  is the recommended path going forward.

## Deviations from the brief

- **Brief Part 8 said "add clear-eligible-commissions to vercel.json"**
  — it was already there (Session 26). Confirmed scheduled; only
  staggered its minute to avoid colliding with two other 23:00 UTC
  crons. Brief was based on the audit, which was based on a stale
  view of `vercel.json` before Session 26 merged into dev.
- **Brief Part 3/4 spec showed an inline `sendTelegramMessage` call
  that did not exist** — implemented as `sendAdminTelegram(text)`
  in `notifications.ts`. Audit M38 explicitly recommended this
  helper; this session adds it.
- **Brief Part 10 said "create `src/app/api/stripe/portal/route.ts`"**
  — it already existed and was already POST-only with the correct
  return signature. Only the callers (plan-comparison and the
  current-plan "Upgrade →" button) needed fixing.
- **Brief Part 6 used hypothetical field names** (`contact_phone`,
  `contact_email`, `rep_id`). Actual leads schema (migration 036)
  uses `phone`, `email`, `assigned_to`. POST body uses the real
  column names so creates/edits stay symmetric.
- **Brief Part 9c suggested a new `ADMIN_EMAIL` env var pattern
  for admin exemption from the onboarding redirect**. Instead used
  the existing super-admin allowlist (`ADMIN_EMAILS = [hello@..., 
  process.env.ADMIN_EMAIL]`) that already short-circuits the
  middleware earlier — admins already hit a return statement before
  the new redirect check fires. No new env var pattern introduced.
- **Brief Part 5 said `notification_email` belongs in
  notifications_config** — confirmed it was a JSONB column, removed
  the broken Business Info form entry, and made `saveNotifications`
  the single writer.
- **Added Part 2 sub-fix not in the original brief: `returnUrl`
  body param on `/api/stripe/embedded-checkout`** so the onboarding
  wizard can come back to /onboarding instead of /dashboard. Backward
  compatible — defaults to the existing /dashboard return if unset.
  Validated as a relative path to prevent open-redirect abuse.

## What was deliberately not touched

- The 15 deferred High-severity audit items (H8, H9, H10, H11, H12,
  H13, H14, H15, H18, H19, H20, H21, H27, H28, H30, H31, H32, H33)
  — three follow-on briefs queued: Vapi lifecycle, SMS/bookings
  data integrity, admin tooling completeness.
- The legacy `/bookings` page schema (Flow 6 H19) — separate
  follow-up.
- Stripe webhook `customer.subscription.updated`, the two legacy
  checkout routes (`/api/stripe/checkout`, `/api/stripe/create-checkout-session`),
  Vapi agent lifecycle issues, agent health alerts — all queued.
- Make.com scenarios — no payload changes; the new email paths
  use `sendEmail` directly so Make does not need to change.
- Vapi assistants — no config or behavior changes.

## Manual handoff for Donna

1. Apply `supabase/migrations/042_session27_fixes.sql` on production
   Supabase after merge to main.
2. Confirm `RESEND_API_KEY`, `TELEGRAM_BOT_TOKEN`,
   `TELEGRAM_ADMIN_CHAT_ID` are set in Vercel production env (they
   already were — this just removes the source fallback safety net).
3. Optionally set `ADMIN_EMAIL` in Vercel to add a personal
   super-admin alongside `hello@talkmate.com.au`.
4. No Make.com scenario changes required.
5. No Vapi changes required.
6. Verify cron schedules show the new entries on the Vercel dashboard:
   - `expire-pending-payments` at 45 22 * * * (new)
   - `expire-trials` moved from 0 22 * * * to 15 22 * * *
   - `daily-quality-digest` moved from 0 22 * * * to 30 22 * * *
   - `trial-reminders` moved from 0 23 * * * to 15 23 * * *
   - `clear-eligible-commissions` moved from 0 23 * * * to 30 23 * * *
   - `email-triggers` moved from 0 * * * * to 15 * * * *
   - `sms-reminders` moved from 0 * * * * to 30 * * * *

## Testing checklist (run on preview/test mode before prod)

- [ ] `/wl-preview/proxima` loads anonymously (no /login redirect).
- [ ] New self-serve signup writes `signup_at`, sends welcome email,
      redirects to /onboarding.
- [ ] Admin user signs in and is NOT redirected to /onboarding.
- [ ] Onboarding step 9 renders Stripe EmbeddedCheckout (not the
      mock card inputs).
- [ ] After Stripe test-mode payment, wizard polls and advances to
      step 10. URL no longer carries `?paid=1`.
- [ ] Pay-now signup that abandons Stripe → 24h later, cron flips
      to trial, owner receives the "we have started your trial" email.
- [ ] Stripe test webhook `invoice.payment_failed` → owner email
      with Stripe portal link + admin Telegram fire.
- [ ] Stripe test webhook `customer.subscription.deleted` →
      `businesses.account_status` becomes cancelled, owner email
      sends, admin Telegram fires.
- [ ] Settings → Notifications → toggle anything → click "Save
      Preferences" → success toast → refresh → toggles persist.
- [ ] Voice card in Settings → AI Voice Agent → choose a different
      voice → click Save & Sync → refresh → voice persists.
- [ ] Sales rep clicks "+ Add Lead" → modal opens → required fields
      enforce → submit → new lead appears in the "New" kanban column.
- [ ] Sales rep with zero leads sees the empty-state CTA.
- [ ] Admin tries to approve a < 14-day-old commission → 409 with
      a clawback-ends-at message. Approve button disabled in UI
      with tooltip showing the date.
- [ ] Rep portal commissions page shows "Clears on [date]" under
      every pending row.
- [ ] Plan-comparison "Switch to Growth →" opens Stripe portal in
      new location.
- [ ] Current-plan "Upgrade →" button opens Stripe portal.
- [ ] `npm run build` passes with zero errors. (Confirmed in
      Session 27.)
- [ ] `grep` for the removed secret literals returns nothing.
      (Confirmed in Session 27.)

---

## SESSION 28 — Vapi Lifecycle + Call Intelligence Resilience (2026-05-22)

Hardens the Vapi function endpoint, the call-intelligence retry path,
and the agent provisioning + go-live approval flow. Closes the H8-H15
gaps from the Session 27 audit.

### Branch
Pushed to `feature/session-28-vapi-lifecycle` (branched from `dev`).

### What ships

**Part 1 — H12: Vapi function endpoint auth (`src/app/api/vapi/functions/route.ts`)**
- `VAPI_WEBHOOK_SECRET` is now mandatory. Previously, leaving the env
  var unset silently disabled the auth check. Any request that
  doesn't carry a matching `x-vapi-secret` (or `Authorization: Bearer ...`)
  now gets 401. If the env var is missing, the route returns 500 with
  a logged error rather than accepting traffic.
- Legacy `{ function_name, business_id, params }` callers no longer
  trust `business_id` from the body. The route now resolves the
  business via the Vapi `assistantId` (matched against
  `businesses.vapi_agent_id`) and rejects suspended / cancelled /
  expired accounts with 403. The Vapi-native branch already did this
  lookup correctly and was not touched.

**Part 2 — H14 + H13 + H15: Call intelligence resilience**
- `src/lib/score-call-async.ts`:
  - The outer catch now stamps `intelligence_status='error'` +
    `alert_reason` on the calls row so the retry cron can find it.
    Previously an unexpected throw left rows stuck in their initial
    state, invisible to recovery.
  - `CRITICAL_FLAG_TYPES` dropped `dropped_call` and `wrong_info` —
    neither is in the `CallFlagType` union, both were silently
    stripped by `coerceFlag`, so neither could ever fire.
- `src/app/api/cron/score-pending-calls/route.ts`:
  - Split into two queries. `pending` rows use the original 24h
    lookback; `error` rows now use a 7-day lookback. Merged,
    deduplicated by `vapi_call_id`, sorted oldest-first (prevents
    error rows starving behind newer pending rows), then capped at
    `BATCH_LIMIT=10` so total Anthropic spend per run is unchanged.

**Part 3 — H10 + H11 + H9: Agent config standard cleanup**
- `src/lib/agent-config-standard.ts`:
  - `tools` restructured into three groups — `required`,
    `requiredForBookings`, `requiredForQuoting`. Removed
    `requiredForTowing` and `transferCall` (the latter is Vapi's
    built-in live transfer feature, never a function tool).
  - Added `ISSUE_DEFINITIONS` entries for every new tool slot:
    `MISSING_GET_TEAM`, `MISSING_CHECK_AVAILABILITY`,
    `MISSING_ADD_TO_WAITLIST`, `MISSING_CANCEL_BOOKING`,
    `MISSING_RESCHEDULE_BOOKING`, `MISSING_CALCULATE_JOB_QUOTE`,
    `MISSING_LOG_QUOTE_ADDON`.
- `src/lib/vapi-tool-defs.ts` (new): single source of truth for
  `TOOL_DEFS`, `buildTool`, `buildParameters`, `toolName`, and
  `wrapsParams`. Both `/api/vapi/sync` and `/api/admin/vapi/sync`
  used to keep their own copy of these — descriptions had already
  drifted slightly. Consolidated on the longer/more detailed
  descriptions from the client route; no structural divergences
  (properties, required arrays, enums) were found. Both routes now
  import from this module.
- `src/lib/agent-config-validator.ts`:
  - `validateAgentConfig` now takes an optional `{ plan }` and skips
    booking + quoting tool checks on Starter plans. Default plan is
    'growth' (most permissive) when unspecified.
  - Extended `missMap` to include the new tools — every required
    tool surfaces a pre-defined `ISSUE_DEFINITIONS` code (no template
    strings, no risk of an unknown code crashing `makeIssue`).
- `src/lib/golive-checks.ts`:
  - Passes `business.plan` into `validateAgentConfig` so the
    `check_agent_config_valid` auto-check no longer fails Starter
    clients for missing `create_booking` / `check_availability`.
- `src/lib/vapi-agent-builder.ts` (new): `buildNewAgentPayload`
  produces a complete Vapi assistant POST body that passes the
  validator on first creation. All voice/timing/transcriber values
  come from `AGENT_CONFIG_STANDARD`; tools come from the new groups.
  Fixes voice.provider='eleven-labs' (Vapi expects '11labs'),
  missing voice model, missing stopSpeakingPlan, missing
  transcriber config, and zero tools on freshly-onboarded agents.
- `src/app/api/onboarding/complete/route.ts`:
  - Replaces the hand-written Vapi POST body with a call to
    `buildNewAgentPayload`. Every new client agent now ships with
    the full standard config and the correct tool list for its plan.

**Part 4 — H8: Gate approve-agent on go-live checklist (`src/app/api/admin/approve-agent/route.ts`)**
- Switched auth from the `x-admin-key` header to `requireAdmin()`
  (matches every other `/api/admin/*` route).
- Before approval, runs `computeAutoChecks` and reads
  `client_golive_checklist`. Approval fails 400 with a list of
  failing checks unless `?override=true` is passed.
- Required manual checks: `manual_vapi_functions_registered`,
  `manual_test_call_made`, `manual_sms_delivered_to_owner`.
- When `?override=true` is used despite failing checks, a Telegram
  alert fires via `sendAdminTelegram` naming the business and the
  failing checks so we have an audit trail of emergency approvals.

### Migration

- `supabase/migrations/043_session28_fixes.sql`:
  - Adds `calls.intelligence_retry_count INTEGER DEFAULT 0` for a
    future retry-cap feature.
  - Adds a partial index on `calls (intelligence_status, created_at)
    WHERE intelligence_status IN ('pending', 'error')` to speed up
    the new split queries in the score-pending-calls cron.
  - All statements idempotent.

### Decisions / deviations from brief

- The brief instructed verifying `account_status` valid values
  before shipping the H12 gate. Confirmed from migration 022 the
  full set is `(trial, active, pending, pending_payment, expired,
  suspended, cancelled)`. The Part 1 gate uses `['active', 'trial']`
  as specified.
- The brief stated `validateAgentConfig` returned a `ValidationResult`
  object. The real return type is `AgentIssue[]`. Kept the actual
  return type; added the `options?: { plan?: string }` parameter as
  brief intended.
- The brief listed manual check key candidates with an instruction
  to verify against `MANUAL_CHECK_KEYS`. The three names listed in
  the brief (`manual_vapi_functions_registered`,
  `manual_test_call_made`, `manual_sms_delivered_to_owner`) match
  `MANUAL_CHECK_KEYS` in `golive-checks.ts:53-67` exactly — used as-is.
- TOOL_DEFS were already structurally identical between
  `/api/vapi/sync` and `/api/admin/vapi/sync`. Only the description
  strings on `check_availability`, `add_to_waitlist`, `cancel_booking`,
  `reschedule_booking` were shorter in the admin copy. Consolidated
  on the longer client-route descriptions. No structural merge work
  was needed.

### Out of scope

- The previous Session 27 known-gaps notes about Vapi lifecycle on
  cancel/trial-end (the original "H8") and the Stripe
  `customer.subscription.updated` handler are NOT addressed here.
  Session 28's H8 refers to the approve-agent governance gate per
  the brief. The original Session 27 H8-H15 gap text in SYSTEM_MAP
  reflected scope-of-future-work — the Session 28 brief reuses the
  H8-H15 labels for its own four parts. Those original
  Session 27 audit items remain as deferred work.

### Manual handoff for Donna

1. Apply `supabase/migrations/043_session28_fixes.sql` on production
   Supabase after merge to main.
2. Confirm `VAPI_WEBHOOK_SECRET` is set in Vercel production env.
   The function endpoint will now refuse to start serving requests
   until it is — `/api/vapi/functions` returns 500 with a log line
   `[vapi/functions] VAPI_WEBHOOK_SECRET is not set` when missing.
3. Confirm every Vapi assistant's tool `server.secret` matches
   `VAPI_WEBHOOK_SECRET` — a mismatch will produce 401s.
4. No Make.com scenario changes required.
5. Existing approve-agent callers need to be updated: the old
   `x-admin-key: $ADMIN_SECRET_KEY` header is no longer accepted.
   Use a logged-in admin session.
6. After deploying, run `/admin/agent-health` for a sweep of
   existing clients — Starter plans should now pass
   `check_agent_config_valid` even though they have no booking
   tools registered.

### Testing checklist

- [ ] POST to `/api/vapi/functions` without `x-vapi-secret` → 401.
- [ ] POST to `/api/vapi/functions` with wrong secret → 401.
- [ ] POST to `/api/vapi/functions` with correct secret → proceeds.
- [ ] POST to `/api/vapi/functions` legacy format with a
      `body.business_id` that doesn't match the assistant's
      `vapi_agent_id` → returns 404 (unknown assistant) instead of
      silently writing against the wrong tenant.
- [ ] `scoreCallAsync` with a forced throw → `calls.intelligence_status`
      becomes `'error'` with the message captured in `alert_reason`.
- [ ] `score-pending-calls` cron picks up error rows 24h-7d old.
- [ ] `CRITICAL_FLAG_TYPES` import no longer references
      `dropped_call` or `wrong_info`.
- [ ] New Vapi agent created via onboarding → `validateAgentConfig`
      reports zero critical issues immediately.
- [ ] Starter go-live → `check_agent_config_valid` passes.
- [ ] Growth/Pro go-live → fails until `create_booking`,
      `check_availability`, etc. are registered.
- [ ] Both sync routes produce identical tool definitions (they now
      import the same module).
- [ ] `POST /api/admin/approve-agent` without complete checklist →
      400 with `failing_checks`.
- [ ] `POST /api/admin/approve-agent?override=true` → approves and
      fires a Telegram alert with the failing checks.
- [ ] `npm run build` passes with zero errors. (Confirmed.)

---

## SESSION 29 — Hayden SMS Confirmation Loop (2026-05-22)

Adds the dispatcher-confirmation SMS loop GM Towing's owner (Hayden)
has been asking for: every agent-booked job now sends the caller a
"received" SMS and texts the dispatcher YES/NO from a dedicated
Twilio number. YES confirms the booking and texts the caller; NO
declines and texts the caller. A 15-minute reminder fires if the
dispatcher hasn't replied.

### Branch
Pushed to `feature/session-29-sms-confirmation-loop` (branched from
`dev` after Session 28 had merged).

### What ships

**Part 1 — Migration 044 (`supabase/migrations/044_sms_confirmation_loop.sql`)**
- Extends `bookings_status_check` to include `'declined'`.
- Extends `sms_log_sms_type_check` with five new types:
  `dispatcher_job_notification`, `booking_received`,
  `booking_confirmed`, `booking_declined`, `dispatcher_reminder`.
- Adds four columns to `bookings`: `confirmation_ref`,
  `dispatcher_notified_at`, `reminder_sent_at`, `confirmed_by_phone`.
  `confirmed_at` already exists (Session 15) and is reused.
- Unique partial index on `bookings.confirmation_ref` and a partial
  index on `(dispatcher_notified_at, reminder_sent_at, status)` for
  the cron sweep.

**Part 2 — `src/lib/sms.ts`**
- `SendSMSOptions` gains an optional `from?: string`. When set, that
  number is used as the Twilio `From`; otherwise `TWILIO_PHONE_NUMBER`
  is the default. Existing callers don't change.
- `SmsType` union extended with the five new types.
- `BYPASS_PLAN_LIMIT_TYPES` adds four — `dispatcher_job_notification`,
  `booking_confirmed`, `booking_declined`, `dispatcher_reminder`.
  `booking_received` is **not** in the bypass list: it is the
  caller-facing receipt SMS and counts against the client's monthly
  quota (same billing slot as the old `booking_confirmation` had).
- Five new template functions: `templateBookingReceived`,
  `templateBookingConfirmed`, `templateBookingDeclined`,
  `templateDispatcherNotification`, `templateDispatcherReminder`.
- `templateBookingConfirmation` is intentionally **unchanged** — it
  has four other callers (portal /confirm route, manual booking
  POST, etc.) that legitimately fire confirmed-state messages.

**Part 3 — `createBooking` in `src/app/api/vapi/functions/route.ts`**
- Generates a 6-char ref (first 6 chars of the booking UUID, minus
  hyphens, uppercased) stored on the booking row as
  `confirmation_ref`. The dispatcher quotes it back in YES/NO
  replies.
- Pulls the business row once (was previously fetched only inside
  the SMS branch). Reuses it for both the dispatcher and caller
  sends.
- When `notifications_config.dispatcher_alerts` is on, texts the
  dispatcher from `TWILIO_CONFIRMATION_NUMBER` with the new
  `dispatcher_job_notification` type. The from-override lets Twilio
  route the reply webhook on the dedicated number.
- Stamps `dispatcher_notified_at` only when the dispatcher SMS
  actually goes out.
- Caller SMS changed from `templateBookingConfirmation` /
  `booking_confirmation` to `templateBookingReceived` /
  `booking_received`. The booking now starts at `pending` instead of
  being announced as confirmed before the dispatcher has seen it.

**Part 4 — `src/app/api/twilio/sms-reply/route.ts` (new)**
- Manual Twilio signature validation via Node `crypto` (HMAC-SHA1 of
  full URL + sorted POST params, base64). The `twilio` npm package
  is deliberately not installed.
- YES → flips the booking to `confirmed` and texts the caller via
  `templateBookingConfirmed`. NO → `declined` + `templateBookingDeclined`.
  Other replies log and return 200 with empty TwiML.
- Matches `From` phone against
  `notifications_config->>dispatcher_number`. Looks for the most
  recent pending booking within the last 2 hours so a stale YES
  cannot confirm an old job the dispatcher has forgotten.
- Stamps `confirmed_at` + `confirmed_by_phone` on the booking row.
- Caller SMS uses `businesses.phone_number` as the caller-facing
  contact (per production-verified GM Towing data — never
  `escalation_number`, never `notifications_config.*`).
- Always returns 200 with empty TwiML on a valid Twilio request so
  Twilio doesn't retry on no-op outcomes.

**Part 5 — `src/app/api/cron/sms-reminders/route.ts`**
- New dispatcher reminder sweep appended after the 24h/2h sweeps.
- Picks bookings still `pending` with `dispatcher_notified_at`
  between 15 and 30 minutes ago and `reminder_sent_at IS NULL`.
- Uses a Map cache (mirroring the existing `settingsCache` pattern)
  to avoid one businesses-table read per pending booking.
- Sends `templateDispatcherReminder` from
  `TWILIO_CONFIRMATION_NUMBER` with type `dispatcher_reminder`.
- Only stamps `reminder_sent_at` when the SMS succeeds — failure
  keeps the row eligible for the next cron tick.
- Return JSON gains `dispatcher_reminders_sent: number`.

**Part 6 — Admin booking view (`src/components/portal/scheduler-view.tsx`)**
- `Booking` interface extended with `'declined'` status and the
  four new columns.
- New `statusBadgeColor()` mapping matches the brief's palette:
  pending #F59E0B, confirmed #22C55E, declined #EF4444,
  cancelled #9CA3AF, completed #4A9FE8.
- Modal shows a REF: badge when `confirmation_ref` is set and a
  "Confirmation loop" section listing dispatcher_notified_at,
  reminder_sent_at, and confirmed_at when those are populated.
- List view status column now uses the new palette and shows the
  REF underneath. List status filter adds a "Declined" option.
- `sourceColor()` learns about `'declined'` for tile/list tints.
- The simpler `src/app/(portal)/bookings/bookings-view.tsx`
  STATUS_STYLE map gains a `declined` entry as well (different
  surface used by non-towing receptionist clients).

### New environment variable

```
TWILIO_CONFIRMATION_NUMBER=+61480847945
```

The dedicated Twilio number for outbound dispatcher SMS. Its
inbound SMS webhook must point at
`https://app.talkmate.com.au/api/twilio/sms-reply` so YES/NO replies
land in our handler. The voice webhook on this number is unchanged.

### Decisions / deviations from brief

- The brief expected `biz` to be in outer scope inside `createBooking`.
  It wasn't — `biz` lived inside the `if (shouldSendSms)` branch.
  Hoisted the fetch above both the dispatcher and caller SMS paths,
  so we do exactly one businesses-table read per booking, and
  removed the now-unused `templateBookingConfirmation` import from
  `vapi/functions/route.ts`.
- The brief said the admin booking page lives at
  `src/app/admin/clients/[clientId]/portal/bookings/page.tsx`. It
  does — but it is an `AdminPagePlaceholder` that defers to the
  shared client view. The real booking surface is
  `src/components/portal/scheduler-view.tsx`. All Part 6 changes
  landed there.
- The brief's full sms-reply template referenced `business.id` as
  the `clientId` argument. Confirmed that's correct against the
  schema (`bookings.client_id` foreign key) and used it verbatim.

### Manual handoff for Donna

These cannot be done in code — Donna runs them after merge:

1. Apply `supabase/migrations/044_sms_confirmation_loop.sql` on
   production Supabase.
2. Add `TWILIO_CONFIRMATION_NUMBER=+61480847945` to Vercel
   production, preview, and development env.
3. Configure the Twilio SMS webhook on **+61 480 847 945** only:
   - Messaging webhook URL:
     `https://app.talkmate.com.au/api/twilio/sms-reply`
   - Method: HTTP POST
   - Leave the Voice webhook unchanged.
4. **Do NOT touch the webhooks on +61 468 024 020.** That is the
   shared outbound number (`TWILIO_PHONE_NUMBER`) that points at
   Vapi; changing it breaks every call.
5. Verify the migration: confirm `bookings_status_check` now
   includes `'declined'`, the four new columns exist, the two new
   indexes are present.
6. Smoke test: book a job on the GM Towing demo line, watch
   Hayden's phone for the dispatcher SMS from +61 480 847 945,
   reply YES, watch the caller receive a confirmation.

### Testing checklist

- [ ] Migration 044 runs clean.
- [ ] `'declined'` accepted by `bookings_status_check`.
- [ ] All five new types accepted by `sms_log_sms_type_check`.
- [ ] `bookings.confirmation_ref`, `dispatcher_notified_at`,
      `reminder_sent_at`, `confirmed_by_phone` exist.
- [ ] `confirmed_at` was NOT duplicated.
- [ ] `sendSMS({ from })` overrides the default From number.
- [ ] `createBooking` generates a 6-char ref and stores it.
- [ ] `createBooking` sends dispatcher SMS from +61 480 847 945
      when `dispatcher_alerts` is on.
- [ ] `createBooking` caller SMS says "received" not "confirmed"
      and logs as `sms_type='booking_received'`.
- [ ] `templateBookingConfirmation` unchanged — four other callers
      keep working.
- [ ] `POST /api/twilio/sms-reply` with bad signature → 403.
- [ ] `POST /api/twilio/sms-reply` with valid YES → 200 empty
      TwiML; booking → `confirmed`; caller SMS fires.
- [ ] `POST /api/twilio/sms-reply` with valid NO → 200 empty
      TwiML; booking → `declined`; caller decline SMS fires.
- [ ] Unrecognised reply → 200 empty TwiML, no DB change.
- [ ] sms-reminders cron picks up bookings 15-30 min old without
      a reminder and stamps `reminder_sent_at` on success only.
- [ ] No second reminder ever fires on the same booking.
- [ ] Scheduler view modal shows REF badge + confirmation-loop
      timestamps when set; status badge colours match the spec.
- [ ] `npm run build` passes with zero errors. (Confirmed.)
