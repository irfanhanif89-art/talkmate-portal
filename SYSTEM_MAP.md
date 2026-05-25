# TalkMate Portal — System Map

**Last updated:** 2026-05-25
**Last session:** 35
**Main SHA:** b5fe368
**Next migration number:** 048
**Repo:** irfanhanif89-art/talkmate-portal
**Production URL:** https://app.talkmate.com.au
**Supabase project:** mdsfdaefsxwrakgkyflr
**Vercel project:** prj_loxPaAwjRW2VV4qxQP7qpu7iq68k

---

## Session Log

| Session | Date | Branch | SHA | Migration(s) | Summary |
|---------|------|--------|-----|--------------|---------|
| 1–7 | 2025–2026 | — | — | 001–010 | Initial build, CRM, admin client management |
| 8 | 2026 | — | — | — | Self-serve signup flow |
| 9 | 2026 | — | — | 023 | Receptionist features |
| 10 | 2026 | — | — | 024 | Dispatcher system |
| Hotfix | 2026 | — | — | 025 | Duplicate-owner DB guard |
| 11 | 2026 | — | — | 026 | Security foundations + RBAC + audit log |
| 12 | 2026 | — | — | 027–029 | Services fix + TalkMate Command + Vapi call ID |
| 13 | 2026 | — | — | — | Admin portal parity + Sync Agent expansion |
| 14 | 2026 | — | — | 030 | Distance quoting engine + scheduler foundation |
| 15 | 2026 | — | — | 031 | Accounts, VIP bypass, native scheduler, Twilio SMS, waitlist, public holidays |
| 16 | 2026 | — | — | — | Locked preview pattern + scheduler route display |
| 17B | 2026 | — | — | — | Audit fixes — create_booking sync, Make.com retirement, check_caller logging |
| 18 | 2026 | — | — | 032 | Call Intelligence — AI-scored call quality, alerts, SMS recovery |
| 19 | 2026 | — | — | 033 | SMS visibility + AI SMS verification |
| 20 | 2026 | — | — | 034 | Admin Go-Live Verification Checklist |
| Hotfix 035 | 2026 | — | — | 035 | sms_used_this_month counter not incrementing |
| 21 | 2026 | — | — | 036 | Sales HQ — rep portal, CRM pipeline, commissions, contract signing, admin sales team |
| 22 | 2026-05-20 | feature/session-22-pricing | — | 037 | Pricing overhaul — setup fees, annual billing, 2.5% commission bonus |
| 22B | 2026-05-20 | — | — | — | Admin quality alerts — Telegram pings, daily digest |
| 23 | 2026-05-20 | feature/session-23-contractor-flow | — | 038 | Contractor agreement flow — invite, sign, PDF, commissions, termination |
| 24 | 2026 | feature/session-24-agent-stability | — | 039 | Agent health monitoring |
| 25 | 2026 | feature/session-25-unified-rep-lifecycle | — | 040 | Unified rep lifecycle — contractor → sales_rep provisioning, portal access |
| 26 | 2026-05-21 | feature/fix-contractor-signature-panel | 9674bd1 | 041 | Contractor signature panel — ABN mandatory, hard-fail upload, clawback, resend invite, Telegram alerts |
| 27 | 2026-05-22 | feature/session-27-revenue-fixes | e612c9b | 042 | Revenue fixes — Stripe real payment, /wl-preview public, SMS type constraint, clawback enforcement, sales rep add lead, hardcoded secrets removed |
| 28 | 2026-05-22 | feature/session-28-vapi-lifecycle | da63120 | 043 | Vapi lifecycle + call intelligence resilience — mandatory VAPI_WEBHOOK_SECRET, legacy business_id trust fixed, error-call retry widened to 7d, agent config standard restructured (required/requiredForBookings/requiredForQuoting), shared vapi-tool-defs module, plan-aware validator, onboarding builds validator-clean agents, approve-agent gated on go-live checklist |
| 29 | 2026-05-22 | feature/session-29-sms-confirmation-loop | 7508b4b | 044 | Hayden SMS confirmation loop — caller "received" SMS + dispatcher YES/NO loop on +61 480 847 945, /api/twilio/sms-reply with manual HMAC-SHA1, 15-min dispatcher reminder, new bookings columns (confirmation_ref/dispatcher_notified_at/reminder_sent_at/confirmed_by_phone), declined status, 5 new SMS types |
| 30 | 2026-05-22 | feature/session-30-fixes | d987bdc | 045 | Session 30 fixes — sync routes write `/api/vapi/functions` (not `/api/webhooks/vapi`), one-shot `/api/cron/backfill-server-url` cron to repair existing assistants, calls page loading fix, comma-separated ADMIN_EMAIL allowlist, dollar-sign validator exception for plan prices ($299/$499/$799 + 10× annual variants), admin PATCH whitelist expanded (7 account_status values + billing_cycle/setup_fee_waived/setup_fee_amount) + edit modal billing section, SMS failure Telegram alerts (twilio_error/config_missing/invalid_phone only), owner booking notification SMS type + template + createBooking call site, welcome email moved from onboarding/complete → admin/approve-agent (non-override path only), impersonate route gains `?redirect=1` + `?next=` modes, 7 admin stub pages collapsed into impersonation redirects |
| 31 | 2026-05-22 | feature/session-31-bookings-cleanup | 2ea89fb | — | Bookings cleanup — backfill cron retired (`/api/cron/backfill-server-url` + vercel.json entry deleted; both live Vapi agents verified by Donna), legacy Stripe routes deleted (`/api/stripe/checkout`, `/api/stripe/create-checkout-session` — zero callers), bookings UI rewritten to modern schema (scheduled_start/truck_type/description/pickup_address/dropoff_address/confirmation_ref/sms_confirmation_sent), route line + REF badge added, ConfirmModal date fixed, New Booking modal posts to existing `/api/portal/bookings` |
| 32 | 2026-05-22 | feature/session-32-dashboard-fixes | b1a08f1 | — | Dashboard fixes bundle — M34 nurture column added to `LEAD_STATUS_COLUMNS`, M5 dashboard label corrected to "Calls missed this month", M8 missed-call filter rewritten (dashboard query now selects `intelligence_status`; counts only `outcome === 'Missed'` OR null-outcome calls with terminal scored status `IN ('resolved','review','critical')` AND duration < 5s — pending/error are excluded), L5 annual ROI uses `biz.billing_cycle` for years × annual-price ($2990/$4990/$7990), M35 `commissionPaidEmailHtml` template + send on `/api/admin/commissions/[id]` pay action (rep + business via existing JOIN — no separate `businesses` query), M6 mailto Help link added to sidebar (rendered as `<a>` not `<Link>`), L1 hardcoded `+$6.20` and `$85` estimates centralised into `src/lib/dashboard-defaults.ts` |
| 33 | 2026-05-23 | feature/session-33-bookings-cleanup | a7dc649 | 046 | Bookings cleanup atomic unit — 5 files updated to drop legacy column references (`command-executor.ts` viewBookings now selects `truck_type/description/scheduled_start`; `admin-feature-tabs.tsx` `AdminBooking` interface modernised + display blocks use `truck_type ?? description` and `scheduled_start` formatted; admin and portal PATCH `ALLOWED_FIELDS` whitelists strip the 5 legacy fields while keeping `actual_start/actual_end/no_show/cancellation_reason`; `bookings-view.tsx` `Booking` interface drops 6 legacy optional fields, `formatScheduled()` simplified to `(booking: Booking)` with single `scheduled_start` branch, fallback chains and `ConfirmModal` cleaned up), Migration 046 drops 6 legacy bookings columns (`confirmation_sms_sent/booking_type/service_requested/preferred_date/preferred_time/notes`) with `DROP COLUMN IF EXISTS`, idempotent backfills + 4 pre-migration check SQL comments for Donna, Stripe pagination fix in `/api/cron/stripe-sync` (do/while loop on `starting_after` with 50-page safety cap = 5000 subs max) |
| 34 | 2026-05-23 | feature/session-34-proxima-demo | eecaa4d | — | Proxima white-label partner demo — new public route `/wl-preview/proxima/demo` shows Monique a Proxima-branded partner portal preview. Static hardcoded data only (4 sample agents, 5 sample calls, computed aggregates) in `src/lib/wl-demo-data.ts`; zero DB reads of business/call tables. Subdomain gate via `notFound()` ensures other partners can't accidentally serve Proxima's network. Parent login page (`src/app/wl-preview/[subdomain]/page.tsx`) gets a "View partner demo →" link gated on `subdomain === 'proxima'`. Brand tokens locked to navy `#1B4FBB`, secondary `#0A1E38`, accent `#E8622A`. Middleware bypass (`pathname.startsWith('/wl-preview')`) verified — already present from Session 27. No migration. |
| 35 | 2026-05-25 | feature/hotfix-alert-dedup | b5fe368 | 047 | Hotfix — agent health alert auto-resolve. Diagnosis: existing dedup window (2h on `issue_code`, gated INSERT before SELECT, Telegram fires inside the gate) was working as designed — the spam was caused by nothing ever auto-resolving alerts, so rows aged out of the 2h window and the cron re-inserted identical rows. Diagnostic SQL across 24h showed 9 (business_id, issue_code) pairs duplicated with avg gap ~138 min — confirming window-expiry pattern. Fix: surgical addition to `agent-health-check/route.ts` — after `validateAgentConfig` returns, before the per-issue alert loop, select all open `config_issue` alerts for the business and resolve any whose `issue_code` is no longer in the current issue set (`resolved_by = 'auto:config_issue_no_longer_detected'`). Gated on `alert_type = 'config_issue'` so webhook_gap and transcript_violation lifecycles are untouched. Safe vs Vapi GET failures (outer `continue` skips this block). Migration 047 marks accumulated duplicates as resolved (UPDATE-not-DELETE; keeps most recent open row per pair; 1-hour buffer to avoid racing live cron; `resolved_by = 'session_35_dedup_cleanup'`; idempotent). Rule 1 (insert dedup) and Rule 2 (Telegram inside gate) deliberately untouched — verified already correct in code. Demo agent `fdeef08c-341c-49b5-851a-524c4ab45fee` missing `check_availability` tool is Donna's post-merge task (DEPLOYMENT.md Step 5a). |

---

## Agent Pipeline Infrastructure (installed 2026-05-25)

| File | Location | Purpose |
|------|----------|---------|
| CLAUDE.md | `C:\Users\info\talkmate-portal\CLAUDE.md` | Project brain — read by every Claude Code session |
| MEMORY.md | `C:\Users\info\talkmate-portal\MEMORY.md` | Session history — agents append after every session |
| builder.md | `.claude/agents/builder.md` | Writes and edits code. Full tools. Sonnet model. |
| validator.md | `.claude/agents/validator.md` | Read-only code QA. Checks TalkMate rules. No write access. |
| qa-tester.md | `.claude/agents/qa-tester.md` | Live browser testing via Playwright MCP. No write access. |
| reviewer.md | `.claude/agents/reviewer.md` | GREEN/YELLOW/RED deployment gate. Opus model. No write access. |
| build/SKILL.md | `.claude/skills/build/SKILL.md` | Full pipeline skill — builder → validator → QA → reviewer → report |
| Global CLAUDE.md | `C:\Users\info\.claude\CLAUDE.md` | Default working directory + pipeline hardcoded for all sessions |

### MCP Servers (Claude Desktop)
| Server | Status | Purpose |
|--------|--------|---------|
| playwright | running | Live browser QA testing |
| github | running | Direct repo read/write — system map updates, file access |

### Build Pipeline Flow
Every task runs automatically: Builder → Validator → QA Tester (Playwright) → Reviewer → Report to Irfan → Donna deploy prompt on approval.

---

## Migration Registry

| # | File | What it does |
|---|------|--------------| 
| 001 | 001_initial.sql | Initial schema — all 10 core tables |
| 002 | 002_add_missing_columns.sql | Missing column additions |
| 003 | 003_add_transcripts.sql | Call transcripts |
| 004 | 004_contacts_table.sql | Contacts table |
| 005 | 005_partner_program.sql | Partner program |
| 006 | 006_add_stripe_customer_id.sql | Stripe customer ID on businesses |
| 007 | 007_master_brief.sql | Master brief schema |
| 008 | 008_crm_foundation.sql | CRM foundation |
| 009 | 009_crm_session2_indexes.sql | CRM indexes |
| 010 | 010_session3.sql | Session 3 changes |
| 011 | 011_admin_client_management.sql | Admin client management |
| 020 | 020_services_and_trade_type.sql | Industry service fields |
| 021 | 021_trial_mode.sql | Trial mode |
| 022 | 022_pending_payment_status.sql | Pending payment status |
| 023 | 023_receptionist_features.sql | Receptionist features |
| 024 | 024_dispatcher_system.sql | Dispatcher system |
| 025 | 025_businesses_owner_unique.sql | Duplicate-owner guard |
| 026 | 026_rbac_and_audit.sql | RBAC + audit log |
| 027 | 027_talkmate_command.sql | TalkMate Command |
| 028 | 028_vapi_call_id.sql | Vapi call ID |
| 029 | 029_agent_last_synced_at.sql | Agent last synced timestamp |
| 030 | 030_distance_quoting_and_scheduler.sql | Distance quoting + scheduler |
| 031 | 031_accounts_vip_scheduler.sql | Accounts, VIP bypass, native scheduler |
| 032 | 032_call_intelligence.sql | Call Intelligence tables + sms_type constraint |
| 033 | 033_sms_visibility.sql | SMS visibility + admin_sms_failures view |
| 034 | 034_golive_checklist.sql | Admin Go-Live Verification Checklist |
| 035 | 035_sms_counter_fix.sql | sms_used_this_month counter fix |
| 036 | 036_sales_hq.sql | Sales HQ — leads, commissions, sales_reps |
| 037 | 037_pricing_overhaul.sql | billing_cycle, setup_fee_waived, setup_fee_amount, won_billing_cycle, bonus_amount |
| 038 | 038_contractor_agreement_flow.sql | contractors, contractor_agreements, sales_scripts, script_acknowledgements, contractor_commissions |
| 039 | 039_agent_health_monitoring.sql | Agent health monitoring tables |
| 040 | 040_unified_rep_lifecycle.sql | contractors.sales_rep_id, portal_invited_at, portal_access_email; sales_reps.contractor_id, onboarded_via, is_legacy |
| 041 | 041_contractor_signature_metadata.sql | contractor_agreements.signature_method, signature_timestamp, ip_address |
| 042 | 042_session27_fixes.sql | businesses.signup_at, welcome_email_sent; commissions.clawback_period_ends_at; sms_log CHECK extended; admin_sms_failures view widened |
| 043 | 043_session28_fixes.sql | calls.intelligence_retry_count; partial index on (intelligence_status, created_at) WHERE status IN ('pending','error') |
| 044 | 044_sms_confirmation_loop.sql | bookings 'declined' status; sms_log adds dispatcher_job_notification/booking_received/booking_confirmed/booking_declined/dispatcher_reminder; bookings.confirmation_ref/dispatcher_notified_at/reminder_sent_at/confirmed_by_phone; unique index on confirmation_ref; partial index for pending dispatcher sweep |
| 045 | 045_session30_fixes.sql | sms_log CHECK constraint extended with `owner_booking_notification` (22 total types) |
| 046 | 046_drop_legacy_bookings_columns.sql | Drop 6 legacy bookings columns (`confirmation_sms_sent`, `booking_type`, `service_requested`, `preferred_date`, `preferred_time`, `notes`) with idempotent backfill and 4 pre-migration safety checks documented in comments for Donna |
| 047 | 047_dedupe_health_alerts.sql | One-time cleanup of duplicate unresolved `agent_health_alerts` rows (`alert_type = 'config_issue'` only) that accumulated before the Session 35 auto-resolve fix. For each (business_id, issue_code) pair with multiple unresolved rows, keeps the most recent open row and marks the rest `resolved_at = now(), resolved_by = 'session_35_dedup_cleanup'`. 1-hour buffer prevents racing live cron. Idempotent — `RAISE NOTICE` skip-log on a clean table. |

---

## Cron Jobs

| Path | Schedule (UTC) | AEST equiv | Purpose |
|------|---------------|------------|---------|
| /api/cron/vapi-health | `* * * * *` | Every minute | Vapi health ping |
| /api/cron/health-monitor | `*/5 * * * *` | Every 5 min | System health alerts |
| /api/cron/score-pending-calls | `*/10 * * * *` | Every 10 min | AI call scoring |
| /api/cron/stripe-sync | `*/15 * * * *` | Every 15 min | Stripe subscription sync |
| /api/cron/waitlist-expiry | `*/15 * * * *` | Every 15 min | Expire waitlist slots |
| /api/cron/usage-monitor | `*/30 * * * *` | Every 30 min | Usage monitoring |
| /api/cron/agent-health-check | `*/30 * * * *` | Every 30 min | Vapi agent health |
| /api/cron/abandoned-signup | `0 * * * *` | Every hour :00 | Abandoned signup recovery |
| /api/cron/email-triggers | `15 * * * *` | Every hour :15 | Lifecycle email triggers |
| /api/cron/sms-reminders | `30 * * * *` | Every hour :30 | SMS reminders (24h, 2h, + Session 29 dispatcher 15-min reminder sweep) |
| /api/cron/nps-check | `0 1 * * *` | 11:00 AEST | NPS check |
| /api/cron/sync-public-holidays | `0 0 1 1 *` | Jan 1 annually | Sync public holidays |
| /api/cron/data-retention | `0 0 1 * *` | 1st of month | Data retention cleanup |
| /api/cron/monthly-payouts | `0 23 1 * *` | 1st of month 09:00 AEST | Monthly payouts |
| /api/cron/daily-tasks | `0 14 * * *` | 00:00 AEST | Daily task sweep |
| /api/cron/db-backup | `0 16 * * *` | 02:00 AEST | DB backup |
| /api/cron/onboard-day7 | `0 22 * * *` | 08:00 AEST | Day-7 onboarding email |
| /api/cron/expire-trials | `15 22 * * *` | 08:15 AEST | Expire overdue trials |
| /api/cron/daily-quality-digest | `30 22 * * *` | 08:30 AEST | Daily call quality digest to admin |
| /api/cron/expire-pending-payments | `45 22 * * *` | 08:45 AEST | Flip 24h+ pending_payment → trial |
| /api/cron/call-forward-check | `0 23 * * *` | 09:00 AEST | Call forwarding check |
| /api/cron/trial-reminders | `15 23 * * *` | 09:15 AEST | Trial reminder emails |
| /api/cron/clear-eligible-commissions | `30 23 * * *` | 09:30 AEST | Clear commissions past clawback |

---

## Key Routes

### Public (no auth)
| Route | Purpose |
|-------|---------|
| `/` | Landing / marketing |
| `/wl-preview/[slug]` | White-label preview for prospects (public, no redirect) |
| `/contractor-onboarding/[token]` | Contractor agreement signing flow |

### Portal (auth required → 307 to /login)
| Route | Purpose |
|-------|---------|
| `/onboarding` | Self-serve onboarding wizard (10 steps, Stripe step 9) |
| `/dashboard` | Client dashboard |
| `/settings` | Business settings + notifications |
| `/billing` | Billing + plan comparison |

### Admin (admin email required → 307)
| Route | Purpose |
|-------|---------|
| `/admin/clients` | Client list + management |
| `/admin/contractors` | Contractor list + detail + commissions |
| `/admin/sales-team` | Legacy rep management |
| `/admin/sales-scripts` | Script version control |
| `/admin/trials` | Trial management |
| `/admin/audit-log` | Audit log |
| `/admin/sms-failures` | SMS failure viewer |

### Sales (sales rep auth → 307)
| Route | Purpose |
|-------|---------|
| `/sales/dashboard` | Rep dashboard |
| `/sales/commissions` | Commission ledger with clawback dates |
| `/sales/contract` | Agreement on file (read-only) |

---

## Key API Routes

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | /api/auth/signup | public | Self-serve signup — writes signup_at, sends welcome email |
| POST | /api/stripe/embedded-checkout | session | Create embedded checkout session |
| GET | /api/onboarding/payment-status | session | Poll payment status after Stripe redirect |
| POST | /api/stripe/portal | session | Open Stripe billing portal |
| POST | /api/webhooks/stripe | Stripe sig | Stripe webhook handler |
| POST | /api/webhooks/vapi | Vapi sig | Vapi call webhook |
| POST | /api/twilio/sms-reply | Twilio sig (HMAC-SHA1) | Session 29 — dispatcher YES/NO reply for booking confirmation loop |
| GET | /api/cron/* | CRON_SECRET | All cron endpoints (401 without secret) |
| GET | /api/admin/* | admin | Admin-only API routes |
| POST | /api/sales/leads | sales rep | Sales rep creates a lead |
| POST | /api/sales/leads/[id]/won | sales rep | Mark lead won + record commission |
| POST | /api/contractors/invite | admin | Invite contractor |
| POST | /api/contractor-onboarding/[token]/sign | public | Contractor signs agreement + generates PDF |
| POST | /api/contractors/[id]/resend | admin | Resend contractor invite |
| POST | /api/contractors/[id]/terminate | admin | Terminate contractor |
| POST | /api/admin/commissions/[id] | admin | Approve commission (blocks if < 14 days) |

---

## Environment Variables

| Var | Required | Purpose |
|-----|----------|---------|
| NEXT_PUBLIC_SUPABASE_URL | ✅ | Supabase project URL |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | ✅ | Supabase anon key (subject to RLS) |
| SUPABASE_SERVICE_ROLE_KEY | ✅ | Supabase service role (bypasses RLS) |
| STRIPE_SECRET_KEY | ✅ | Stripe API key |
| STRIPE_WEBHOOK_SECRET | ✅ | Stripe webhook signature verification |
| STRIPE_PRICE_STARTER | ✅ | Stripe price ID — Starter $299/mo |
| STRIPE_PRICE_GROWTH | ✅ | Stripe price ID — Growth $499/mo |
| STRIPE_PRICE_PROFESSIONAL | ✅ | Stripe price ID — Pro $799/mo |
| NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY | ✅ | Stripe publishable key for EmbeddedCheckout |
| RESEND_API_KEY | ✅ | Resend transactional email |
| TELEGRAM_BOT_TOKEN | ✅ | Telegram admin alerts |
| TELEGRAM_ADMIN_CHAT_ID | ✅ | Telegram chat ID for admin alerts |
| CRON_SECRET | ✅ | Bearer secret for all /api/cron/* routes |
| NEXT_PUBLIC_APP_URL | ✅ | https://app.talkmate.com.au |
| VAPI_API_KEY | ✅ | Vapi agent management |
| VAPI_WEBHOOK_SECRET | ✅ | Vapi webhook verification — MANDATORY from Session 28; /api/vapi/functions returns 500 if unset |
| TWILIO_CONFIRMATION_NUMBER | ✅ | Session 29 — dedicated Twilio number for dispatcher confirmation SMS (+61 480 847 945). Inbound webhook routes to /api/twilio/sms-reply |
| ADMIN_EMAIL | recommended | Personal super-admin email(s) alongside hello@talkmate.com.au. Comma-separated supported (Session 30). |
| INTERNAL_ALERT_EMAIL | optional | Fallback admin email for internal alerts. Comma-separated supported (Session 30). |
| CONTRACTOR_AGREEMENT_WEBHOOK_URL | optional | Make.com scenario A — contractor invite email |
| CONTRACTOR_SIGNED_PDF_WEBHOOK_URL | optional | Make.com scenario B — signed PDF delivery |

---

## Pricing Reference (server-side source of truth)

| Plan | Monthly | Annual (10 mo) | Setup fee | Monthly commission | Annual bonus (2.5%) |
|------|---------|----------------|-----------|-------------------|---------------------|
| Starter | $299/mo | $2,990/yr | $299 | $299 | $74.75 |
| Growth | $499/mo | $4,990/yr | $349 | $349 | $124.75 |
| Pro | $799/mo | $7,990/yr | $399 | $399 | $199.75 |

Commission amounts are hardcoded server-side in `src/lib/commission.ts` and `src/lib/pricing.ts`. Never trust client input for these.

---

## Known Gaps / Deferred Work

### High Priority (from Session 27 audit — not yet addressed)
- **H8** — Vapi lifecycle issues (agent not deprovisioned on cancel/trial-end) — separate from the Session 28 H8 governance gate
- **H9** — SMS/bookings data integrity issues
- **H10** — Stripe `customer.subscription.updated` not handled
- **H12–H15** — Vapi agent health alerts (note: Session 28 reused the H8–H15 labels for its own four parts; the original audit items here remain)
- **H29, H32** — Remaining deferred audit items

### Closed in Session 28
- Vapi function endpoint auth — `VAPI_WEBHOOK_SECRET` is now mandatory, legacy `business_id` trust replaced with assistantId lookup.
- Call intelligence resilience — outer catch stamps error status; error rows get 7-day retry window; dead CRITICAL_FLAG_TYPES entries removed.
- Agent config standard — restructured into required / requiredForBookings / requiredForQuoting; shared TOOL_DEFS module; plan-aware validator; onboarding builds validator-clean agents on first try.
- Approve-agent governance — switched to `requireAdmin()`; gated on the go-live checklist with `?override=true` escape hatch + Telegram alert.

### Closed in Session 30
- **H18** — Sync routes were writing the wrong `serverUrl` (`/api/webhooks/vapi` instead of `/api/vapi/functions`). Both sync routes fixed; `backfill-server-url` cron repairs the existing live assistants.
- **H21** — Admin PATCH whitelist expanded to all 7 valid `account_status` values + `billing_cycle`, `setup_fee_waived`, `setup_fee_amount`. Edit modal exposes the new billing fields.
- **H27** — SMS infrastructure failures (twilio_error, config_missing, invalid_phone) now fire a Telegram alert via `sendAdminTelegram`. Plan-rule rejections stay silent.
- **H28** — Welcome email moved from `onboarding/complete` (premature — agent wasn't live yet) to `admin/approve-agent` non-override path (fires only when go-live checklist is clean).
- **H30** — Owner booking notification SMS — new `owner_booking_notification` type + template + createBooking call site. Gated on `notifications_config.alert_owner=true` + `owner_number`.
- **H31** — Impersonation route gains `?redirect=1` + `?next=` modes. 7 admin stub pages now redirect through impersonation into the real client portal pages.
- **H33** — Calls page no longer hangs on "Loading…" for logged-out users (sets loading=false in the early-return).

### Closed in Session 31
- **H11** — Legacy Stripe checkout routes (`/api/stripe/checkout`, `/api/stripe/create-checkout-session`) deleted after grep confirmed zero in-repo callers. Embedded checkout + billing portal cover all current flows.
- **H19, H20** — Bookings page schema modernized to read `scheduled_start`, `truck_type`, `description`, `pickup_address`, `dropoff_address`, `confirmation_ref`, `sms_confirmation_sent`. Legacy fields kept as optional fallbacks; pickup → dropoff route line + REF badge + New Booking modal added.
- **Backfill cron** — `/api/cron/backfill-server-url` route + `vercel.json` entry removed (both live Vapi agents verified by Donna to have the correct `serverUrl`).

### Closed in Session 32
- **M34** — `LEAD_STATUS_COLUMNS` now includes `'nurture'`. Leads moved to Nurture appear on the kanban instead of vanishing.
- **M5** — Dashboard "Calls missed this week" label corrected to "Calls missed this month".
- **M8** — Missed-call filter fixed. Dashboard query now selects `intelligence_status`; counts only `outcome === 'Missed'` OR null-outcome calls where `intelligence_status IN ('resolved','review','critical')` AND `duration_seconds < 5`. In-progress calls (`pending`/`error`) are correctly excluded.
- **L5** — Annual ROI calculation uses `biz.billing_cycle`; annual subscribers see years × $2990/$4990/$7990 instead of months × monthly price.
- **M35** — `commissionPaidEmailHtml` template added to `sales-notify.ts`; `/api/admin/commissions/[id]` PATCH fires the email on pay. Rep + business pulled from existing JOIN — no separate `businesses` query.
- **M6** — Help link added to portal sidebar — `<a href="mailto:hello@talkmate.com.au?subject=TalkMate%20Portal%20Help">`, `HelpCircle` icon, rendered outside the section loop because mailto cannot use Next.js `<Link>`. Never highlights as active.
- **L1** — Hardcoded estimates centralised. `src/lib/dashboard-defaults.ts` exports `INDUSTRY_AVG_UPSELL_PER_CALL` (6.20) and `INDUSTRY_AVG_CALL_VALUE` (85). Five literal occurrences replaced across dashboard-client / dashboard page / billing page.

### Closed in Session 33
- **Legacy bookings columns dropped.** Migration 046 drops `confirmation_sms_sent`, `booking_type`, `service_requested`, `preferred_date`, `preferred_time`, and `notes` after backfilling `sms_confirmation_sent` and `description` idempotently. Five code files updated in the same commit so the migration is safe to apply. Pre-migration checks documented as SQL comments for Donna.
- **L7 — Stripe pagination.** `/api/cron/stripe-sync` now paginates with `starting_after`. Safety cap at 50 pages = 5,000 subscriptions per run.

### Deferred

### Infrastructure
- **PDF template** (`/public/templates/contractor-agreement-template.pdf`) not yet uploaded — fallback inline PDF is used
- **Make.com scenarios** not yet built (contractor invite email + signed PDF delivery)

### Planned follow-on sessions
- Vapi lifecycle brief
- SMS/bookings data integrity brief
- Admin tooling completeness brief

---

## Supabase Storage Buckets

| Bucket | Access | Purpose |
|--------|--------|---------|
| contractor-agreements | Private | Signed contractor agreement PDFs — 365-day signed URLs for delivery |

---

## Architecture Notes

- **Auth:** Supabase Auth (email/password). Sessions via SSR cookies.
- **Admin gate:** `requireAdmin()` checks email against the super-admin allowlist (hello@talkmate.com.au + comma-split `process.env.ADMIN_EMAIL` + comma-split `process.env.INTERNAL_ALERT_EMAIL`).
- **RLS bypass:** All server-side DB operations use `createAdminClient()` with service role key — `createClient` from `@supabase/supabase-js` direct, NOT `createServerClient` from `@supabase/ssr`.
- **Stripe:** Live keys. EmbeddedCheckout for onboarding (step 9). Billing portal for plan changes. Webhooks verify signature.
- **Vapi:** Agents provisioned per client. Webhook receives call events, triggers scoring, SMS, booking creation.
- **Commissions:** 14-day clawback enforced server-side. Admin cannot approve before `clawback_period_ends_at`. Backfilled by migration 042.
- **iOS/Safari auth:** Never use `supabase.auth.getSession()` client-side for critical flows. Stripe checkout uses plain `<a href>` links or EmbeddedCheckout.
