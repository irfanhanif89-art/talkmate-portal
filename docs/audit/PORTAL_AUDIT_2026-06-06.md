# TalkMate Full Portal Audit — 2026-06-06

Backend code audit + live UI clickthrough across all three portals.
Mode: incremental, portal by portal. Fix obvious/safe issues as found; catalogue the rest.
Order: Client → Admin → Sales rep → Shared (auth/webhooks/crons).
Fix branch: `feature/audit-fixes-jun06` (off `dev`). NOT merged/deployed — awaiting Irfan review + full pipeline.

Scope at start: 135 pages, 335 API routes, 34 crons, 845 source files.

## Severity legend
- **P0** — broken/live-customer-facing or data-loss / security. Fix now or escalate.
- **P1** — feature broken or wrong, not catastrophic. Fix this audit.
- **P2** — minor bug, UX, or polish. Catalogue, batch-fix.
- **P3** — note / tech-debt / nice-to-have.

## Status key
`OPEN` · `FIXED` · `NEEDS-IRFAN` (risky/live-agent/prod) · `WONTFIX`

---

## CLIENT PORTAL

### Code audit findings (4 parallel slice agents, 2026-06-06)

**Cross-cutting / systemic**

| # | Sev | Issue | Status |
|---|-----|-------|--------|
| C-1 | P1 | **`.single()` on `businesses`** — absolute rule-1 violation. Throws on 0/2+ rows instead of redirect/404. Systemic across all 3 portals. | **FIXED** — repo-wide: 93 sites / 74 files → `.maybeSingle()` (method-chain walker; all had null-guards; `.single()` on other tables left intact). build + tsc green. |
| C-2 | P2 | **rule-12: `account_status NOT IN ('cancelled','expired')` filter missing** on owner-scoped `businesses` reads, slice-wide. Low real risk (one business per owner; RLS+login gate elsewhere). `settings/command`/`scheduler`/`dispatch` pages = reference pattern. | OPEN (catalogue — per-callsite care) |

**Real bugs**

| # | Sev | File:line | Issue | Status |
|---|-----|-----------|-------|--------|
| C-3 | P1 | `appointments/page.tsx:69-71,216` | "SMS Reminder" button POSTs to `/api/sms/reminder` which **does not exist**, then `alert('SMS reminder sent!')` fires unconditionally even on 404. | **FIXED** — Irfan: remove the button. Deleted button + handler + unused `MessageSquare` import. |
| C-4 | P1 | `dashboard/page.tsx:69` | Queries `jobs.job_value` — **column does not exist**. "Revenue captured" tile silently always estimate. | **FIXED** — Irfan: use `avg_job_value`. Now `bookingsThisMonth × businesses.avg_job_value` (added to select; col exists mig 062), fallback to per-call estimate; always labelled estimate. |
| C-5 | P2 | `api/contacts/export/route.ts:19-24` | CSV export had no formula-injection guard. | **FIXED** — apostrophe-prefix guard before existing escaping. |
| C-6 | P2 | `api/portal/waitlist/offer/route.ts:11-15` | Auth `if (expected)` **fails OPEN** if both secrets unset. | **FIXED** — fails closed (500) when no secret configured. |
| C-7 | P2 | `api/portal/drivers/[id]/status`, `dispatch/jobs/[id]/{assign,cancel,complete}` | Insert availability with client-supplied `driver_id`, no ownership check (cross-tenant FK write). NOTE: orphaned/legacy routes (live path is `/api/dispatch/*`). | OPEN (catalogue; low risk, dead code) |
| C-8 | P2 | `api/contacts/[id]` PATCH/DELETE, `api/pipeline/move`, `api/portal/bookings/[id]`+`/confirm` | Mutate by `id` only; ownership relies solely on RLS (present → not exploitable today) but no defense-in-depth `client_id` filter. | OPEN (catalogue — add client_id filters) |
| C-9 | P2 | `calls/page.tsx:685` | "Date" filter pill styled clickable but has no handler — false affordance. | OPEN (P2 batch) |
| C-10 | P3 | `dispatch/{dispatch-board,drivers-view,vehicles-view}.tsx` + `/api/portal/dispatch/*`,`/api/portal/vehicles/*` | Orphaned dead dispatch stack (no callers; sub-pages just redirect). Live path is `DispatchView`→`/api/dispatch/*`. | OPEN (cleanup) |
| C-11 | P3 | `api/contacts/import/route.ts:37-75` | Row-by-row select+insert (N+1). 5000-row cap = up to 10k sequential queries → Vercel timeout risk. | OPEN (catalogue — batching) |
| C-12 | P3 | `catalog/page.tsx:151-180` | In admin-impersonation mode page writes via anon client → RLS scopes to admin's OWN business, so admin edits of a client's catalog silently no-op. | OPEN (admin parity) |
| C-13 | P3 | `billing/page.tsx:144,173,207` | "Auto-pay: Enabled", "14x ROI", "72%" hardcoded marketing copy presented as live data. | OPEN (product confirm) |
| C-14 | P3 | `dispatch/vehicles/page.tsx:3` | Stale comment claims vehicles table dropped (mig 048) but table + routes + join still use it. | OPEN (verify schema) |

**Verified clean:** `requireClient`/`resolveBusinessId`/`requireAdmin` auth solid (clientId from authed user, never client input; admin override gated); RLS enabled+consistent on all client tables (no read IDOR anywhere in client portal); Stripe checkout resolves price IDs server-side (no plan/price bypass); Stripe webhook signature-verified + idempotent; no `NEXT_PUBLIC_` secret leaks; ServiceM8 + Google keys encrypted at rest; Vapi Sync Agent preserves BOTH webhook layers (rule 16) and self-heals June outage; modern bookings schema; reassign/reschedule timezone + double-booking logic correct.

### Live UI findings (Playwright, prod, impersonating Gold Coast Towing demo, 2026-06-06)

Swept all ~38 client screens. **Every screen rendered — no 404s, 500s, white-screens, or crashes.** Three real issues:

| # | Sev | Where | Issue | Status |
|---|-----|-------|-------|--------|
| L-1 | P2 | calls, analytics, bookings, scheduler, appointments (every date/time page) | **Systemic SSR hydration mismatch (React #418).** Server renders dates in UTC, client re-renders in browser TZ (AEST) → mismatch → React discards SSR markup and re-renders client-side. Pages work but flash + log an error every load. Root cause: `toLocaleDateString/Time`/`new Date()` rendered during SSR. | OPEN (one fix: render dates client-only or pass pre-formatted strings) |
| L-2 | P2 | `/analytics` | First client-side Supabase fetch fires with **empty businessId** → `GET …/calls?…business_id=eq.&… 400`, plus Recharts `width(-1)` warning. Confirmed: impersonation does a real session swap, so this is a genuine race (fetch runs before context businessId is read), not a test artifact. Charts can render empty on first load. | OPEN (guard fetch on `if (!businessId) return`) |
| L-3 | P2 | mobile 375px | **Horizontal overflow** — dashboard ~179px (a non-wrapping `flex items-center rounded border` row), contacts ~43px. calls = clean (0). Page scrolls sideways on phones. | OPEN (mobile-overflow pass; dashboard row needs flex-wrap/scroll) |

Confirmed C-3 (appointments fake SMS button) not exercisable on demo — no job rows — but the code path is unchanged from the audit finding.

---

## ADMIN PORTAL

### Code audit findings (4 parallel slice agents, 2026-06-06)

| # | Sev | File:line | Issue | Status |
|---|-----|-----------|-------|--------|
| A-1 | **P0** | `api/admin/business-preview/route.ts:4-17` | **No auth gate at all.** Uses `createAdminClient()` (service-role, RLS bypass), returns business name/type/preview_number/agent_status for ANY `businessId`. Middleware excludes `/api/`, so reachable by **anyone unauthenticated** → enumerate clients by UUID. Confirmed by 2 agents. | **FIXED** — added `requireAdmin()` gate. |
| A-2 | P1 | `(portal)/admin/demo-accounts/page.tsx:19-27` | Page has **no requireAdmin** — any logged-in client/rep can open it and click "Impersonate" (triggers magic-link into a demo business). Every sibling admin page gates; this one missed. | **FIXED** — added auth+role redirect gate. |
| A-3 | P1 | `(portal)/catalog/page.tsx:154-177` (mirror) | Admin-mirror catalog edits use the **anon browser client** → RLS rejects (admin doesn't own client rows) → **writes silently no-op** while UI shows success + fires Sync. Same as C-12. Only broken edit surface in the mirror. | OPEN (needs `/api/admin/businesses/[id]/catalog` route) |
| A-4 | P2 | `api/admin/partner-update/route.ts:9-16` | Hand-rolled admin gate omits `ADMIN_EMAIL` + comma-list support; `.single()` on `users`. Still gated (falls through to role check) but inconsistent. | **FIXED** — replaced with `requireAdmin()`. |
| A-5 | P2 | `api/admin/rep-invoices/[id]/route.ts:30-33` | `pay` action sets `status='paid'` with **no precondition** — can pay a `rejected`/already-paid invoice, no idempotency. Money. | **FIXED** — pay now requires current status `approved` (409 otherwise). |
| A-6 | P2 | `(portal)/admin/clients/page.tsx:18`, `clients/overview/page.tsx:33` | Page super-admin allowlist omits `ADMIN_EMAIL` (only `INTERNAL_ALERT_EMAIL` + hardcoded). A super-admin set only via `ADMIN_EMAIL` is redirected away. | **FIXED** — added `ADMIN_EMAIL`. |
| A-7 | P2 | `(portal)/admin/approve/page.tsx:27` | Hardcoded `'x-admin-key': 'talkmate-admin-2026'` shipped in client bundle. Dead (route ignores it) but a credential-shaped literal. | **FIXED** — header removed. |
| A-8 | P2 | `api/admin/clients/[id]/cancel/route.ts:62`, `impersonate/route.ts:17` | `.single()` on `users` (owner row) → 500 if owner has no mirror row (impersonate path unguarded). | **FIXED** — `.maybeSingle()`. |
| A-9 | P3 | `(portal)/admin/make-setup/make-setup-client.tsx:116` | On-screen Make.com setup docs say `Model grok-2-latest` (rule-10 forbids). Display-only but misleads operator. | **FIXED** — → grok-3. |
| A-10 | P3 | `api/admin/clients/[id]/route.ts:155` | PATCH on bad id returns `{ok:true, business:null}` instead of 404. | OPEN (minor) |
| A-11 | P3 | `(portal)/admin/clients/overview/page.tsx:38` | No `is_demo=false` filter → demo businesses show in overview (main list excludes them). | OPEN (confirm intent) |
| A-12 | P3 | mirror dashboard/insights/chatbot/inbox/train pages | No own `requireAdmin` — rely on layout gate (which IS enforced). Defense-in-depth only, no exposure. | OPEN (optional) |
| A-13 | P3 | `api/admin/sms-failures-count/route.ts:12` | Returns `{count:0}` 200 on auth fail instead of 401. | OPEN (minor) |

**IMPORTANT doc correction (not a bug):** `account_status` CHECK constraint (migration 022) actually allows `pending, active, suspended, cancelled, expired, trial, pending_payment`. **CLAUDE.md rule-15 is STALE** (lists only 5). Code using `trial`/`pending_payment` is valid. → Update rule-15.

**Verified clean (strong):** 64/65 admin routes properly `requireAdmin()`-gated (only A-1 ungated); admin mutations use service-role client correctly; **mirror layout enforces admin → NO cross-tenant breach**; Vapi lifecycle routes (activate/suspend/cancel) never touch webhook layers; **approve-agent + go-live are webhook-layer-safe AND checklist-gated** (cannot repeat June outage); audit-log tamper-resistant + read-only; Stripe payment links priced server-side (no client amounts); bulk lead import solid (caps, rep-active check, server-set assigned_by); sales-resources upload safe (type allowlist + 20MB cap + UUID path + CSP-sandbox serve); commission/clawback money math server-side + state-machine-guarded; `.single()`-on-businesses repo-wide fix holds (none in admin). Mirror edits route through admin-scoped server routes EXCEPT catalog (A-3).

### Live UI findings
_(pending clickthrough)_

---

## SALES REP PORTAL
_(pending)_

---

## SHARED (auth / webhooks / crons)
_(pending)_
