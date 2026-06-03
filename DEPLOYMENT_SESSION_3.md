# Session 3 — Build & Deployment Handoff (for audit)

Built autonomously 2026-06-04 while Irfan was away. **Nothing is live in production. Nothing fires for any client (including GM Towing / Spectrum Towing).** Everything ships DARK behind kill switches that default OFF. This doc is the audit starting point.

## TL;DR
- Branch to review/merge: **`feature/session-3-final`** (clean: `dev → 3A → 3B+3C`, pushed to origin).
- A second branch `feature/sprint-features-3` exists on origin as a backup but has unrelated `portal-redesign` commits interleaved (see "Concurrency incident" below). **Use `feature/session-3-final`.**
- Migrations applied to **PREVIEW only** (`rgifivtzmjvanzqwgadq`). **NOT applied to prod.**
- `npm run build` and `npx tsc --noEmit` both clean.
- Three features built: **3A Industry Packs**, **3B ServiceM8 (dark)**, **3C Email Responder (dark)**. **Outbound Quote Follow-up is NOT built (parked, per the v4 brief Appendix P).**

## What I did NOT do (by design / boundary)
- Did NOT merge to `main` or `dev`.
- Did NOT deploy to prod or apply migrations to prod.
- Did NOT flip any kill switch (all default `false`).
- Did NOT build Outbound Quote Follow-up (compliance-parked).
- Did NOT resolve Gate A (Resend inbound availability) or Gate B (Vapi end-of-call routing) — these are operator checks only you can do.

---

## Migration numbering decision (important)
`origin/dev` is at migration **068**. The unmerged `feature/social-dm-nurture` branch already uses **069** and **070**. To avoid a live collision I numbered Session 3 migrations **071–073**:
- `071_industry_packs.sql` + `071b_seed_industry_packs.sql`
- `072_servicem8.sql`
- `073_email_responder.sql`

**At merge time:** if Social DM (069/070) merges to dev first, mine slot cleanly above. If Session 3 merges first, dev will jump 068 → 071 (a 069/070 gap) — harmless for Supabase, but confirm the intended merge order with yourself.

## Schema reconciliation I had to make (the brief was wrong here)
`businesses.industry` **already existed** with its own CHECK (`restaurants/towing/real_estate/trades/healthcare/ndis/retail/professional_services/other`) and live data (`towing`, `trades`). Setting `industry='plumbing'` would have violated that constraint. So:
- I did **not** touch `businesses.industry` or its CHECK.
- The applied pack vertical is stored in a **new** column `businesses.industry_pack_applied` (`towing/plumbing/electrical/cleaning/hvac`).
- The apply route back-fills the existing `industry`/`trade_type` **only when they are null** (never clobbers an admin selection): plumbing→trades+plumber, electrical→trades+electrician, hvac→trades+air_conditioning, towing→towing, cleaning→other.

Also confirmed: `contacts` uses `business_id` (not `client_id`) and has **no `address` column** — ServiceM8 `job_address` is therefore left blank with a note flagging it for the operator. `calls` has no `contact_id`; the webhook passes the already-resolved `contactId` to push-job.

---

## SESSION 3A — Industry Intelligence Packs (SAFE — no live path)
**Migrations (on preview):** `071`, `071b` — `industry_packs` (51 rows: towing 11, plumbing/electrical/cleaning/hvac 10 each), RLS read policy, `businesses.industry_pack_applied`.
**Routes:** `GET /api/industry-packs`, `GET /api/industry-packs/[industry]`, `POST /api/industry-packs/[industry]/apply` (app-level KB dedup by lower(question) — no DB unique index, so it can't fail on pre-existing duplicate questions).
**UI:** `IndustryTemplateCard` on `/train`, shown only when the business has <3 active KB entries. Admin parity is automatic (the existing admin-as-client `/train` passes `adminClientId` to the same `TrainView`).
**Audit:** log in → `/train` on a near-empty business → card shows → apply Towing → expect 11 entries + toast + card disappears + `industry_pack_applied='towing'` + kb_sync_status flips to pending. Re-apply must add 0.

## SESSION 3B — ServiceM8 Job Push (DARK)
**Migration (on preview):** `072` — businesses servicem8 columns, `servicem8_push_log`, `calls.servicem8_pushed`/`servicem8_job_uuid` (idempotency), `admin_settings.servicem8_globally_enabled='false'`.
**Routes:** `connect`, `test`, `disconnect`, `status` (GET/PATCH), `push-job` (CRON_SECRET, internal).
**Webhook:** `src/app/api/webhooks/vapi/route.ts` — added an **isolated** `try/catch` block at the very end of `handleEndOfCall`, gated on `business.servicem8_enabled`, fire-and-forget to `${requestOrigin}/api/servicem8/push-job`. Widened `findBusinessByAssistant`'s select to include `servicem8_enabled`. **This block cannot throw into the live handler** (own try/catch + the existing outer try/catch). Uses the request origin, not a hardcoded prod URL.
**Idempotency:** push-job no-ops if `calls.servicem8_pushed=true` (Vapi retries call.ended) and if `< 30s`.
**Kill switch:** push-job returns `{skipped:'globally_off'}` unless `admin_settings.servicem8_globally_enabled='true'`. **It is `false`.** Plus per-business `servicem8_enabled` defaults false. GM/Spectrum untouched.
**UI:** `ServiceM8Card` in Settings → Integrations; `/settings/servicem8-log` page.

## SESSION 3C — AI Email Responder (DARK + consent-gated)
**Migration (on preview):** `073` — `email_threads`, `email_messages` (root_key threading + unique `(business_id, message_id)` idempotency), businesses email columns incl. `ai_email_consent`, realtime (idempotent add), `admin_settings` kill switch + draft spend caps.
**Routes:** `webhooks/resend/inbound` (svix verify; loop/bounce guards; rate limit; global+plan+consent gates), `email/draft`, `email/send`, `email/threads` (+`[id]`), `email/config`.
**Lib:** `src/lib/email-responder.ts` (Grok draft from KB + AI-disclosure line appended; auto-send only when `email_auto_send` AND `ai_email_consent`); `src/lib/resend.ts` gained an optional `headers` field for In-Reply-To/References threading.
**UI:** `EmailResponderCard` in Settings → Automation (plan-gated Growth+Pro, consent-gated, auto-send default OFF). `/inbox` Email tab via `InboxTabs` wrapper — **the existing SMS `InboxView` is untouched** (zero risk to the live SMS inbox).
**Kill switch:** inbound webhook no-ops unless `admin_settings.email_responder_globally_enabled='true'`. **It is `false`.** Plus per-business `email_responder_enabled=false`, `ai_email_consent=false`.

---

## GATES still required before any go-live (your job)
- **GATE A — Resend inbound:** confirm Resend inbound email is available on the account AND `talkmate-reply.com.au` is a registered/owned domain. The inbound route + payload parsing are written defensively but **the exact Resend inbound JSON shape is unverified** — re-check `from/to/subject/text/html/message_id/in_reply_to/references/headers` field names against a real Resend inbound payload when you set it up. If inbound isn't available on Resend, the receive half needs a different provider.
- **GATE B — Vapi routing:** place one real test call to a cloned agent and confirm `end-of-call-report` lands on `/api/webhooks/vapi` (Session 63 repointed templates toward `/api/vapi/functions`). If it doesn't, the ServiceM8 push won't fire for that client class.

## Go-live order when you're ready (NOT done)
1. Apply migrations 071/071b/072/073 to **prod** via Supabase MCP (preview is already done + verified).
2. Merge `feature/session-3-final` → dev → main (your call on order vs Social DM).
3. Session A is safe to enable immediately. For B: set `RESEND`/ServiceM8 not needed; flip `servicem8_globally_enabled='true'` only after Gate B + a consenting non-towing test client. For C: set `RESEND_INBOUND_WEBHOOK_SECRET`, do the Resend domain setup, set a client's `ai_email_consent=true`, then flip `email_responder_globally_enabled='true'`.
4. Generate inbound addresses: `UPDATE businesses SET inbound_email_address = slug || '@talkmate-reply.com.au' WHERE slug IS NOT NULL AND inbound_email_address IS NULL AND plan IN ('growth','pro','elite');`

---

## Known gaps / follow-ups I deliberately left (document, not done)
1. **Website (talkmate-website) tiles + pricing** — NOT built (avoided touching the shared website working copy during concurrent activity). Add 3 homepage tiles (AI Email Responder [Growth+Pro], ServiceM8 Integration [All plans], Industry Templates [All plans]) + matching pricing rows. (No "Quote Follow-up" tile — parked.)
2. **Admin `/admin/clients` list columns** — did not add "ServiceM8 / Unread Emails / Industry-pack" columns to the large admin list view (risk/time). The per-client admin **email view page** `/admin/clients/[id]/portal/email` was also not built. Client-side admin parity for the cards works via `adminClientId` where the cards are reused, but these admin list/detail surfaces are TODO.
3. **Admin onboarding wizard industry auto-apply** — not wired; the `/train` card covers self-serve.
4. **ServiceM8 API key encryption at rest** — stored as plain text in `businesses.servicem8_api_key`. Add pgcrypto/KMS wrapping before real use.
5. **Phase 3 browser audit** — NOT run (you asked to test together on your return). Only Session A is end-to-end testable without flipping switches.
6. **Outbound Quote Follow-up** — parked entirely (no migration, no code), per v4 Appendix P. Unpark conditions there.

## Concurrency incident (please read)
This local repo had **another session actively committing to a `feature/portal-redesign` workstream** during my build (commits `03eaeb2`, `bc03ccd` theme foundation, `ea33486` ui-v2 controls). These kept interleaving onto the working branch. I twice had to reconstruct my branch cleanly via cherry-pick onto `origin/dev`. The final clean result is `feature/session-3-final`. The `portal-redesign` work is intact on its own branch — I did not touch it. But heads-up that two automations were writing to the same checkout; you may want to give each session its own worktree.

## Verified on preview
4 new tables, 7 new businesses/calls columns, 51 industry_packs rows, all 4 admin_settings switches present and `false`/defaults. tsc clean, build clean.
