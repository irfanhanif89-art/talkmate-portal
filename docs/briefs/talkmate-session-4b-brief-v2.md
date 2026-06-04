# TalkMate — Session 4B Build Brief (v2, council + DB-verified)

## Retention Intelligence and Growth Engine
## For: Claude Code
## Supersedes: talkmate-session-4b-brief.md (v1). This v2 incorporates an LLM-council pressure test and live-database verification run on 2026-06-04.
## Repos: irfanhanif89-art/talkmate-portal (primary) + irfanhanif89-art/talkmate-website
## Supabase prod: mdsfdaefsxwrakgkyflr | preview: rgifivtzmjvanzqwgadq
## Next migration: 076
## Deploy: Vercel auto-deploy from dev to preview. Never push direct to main.

---

## WHY THIS IS v2 — WHAT CHANGED FROM v1 AND WHY

v1 was pressure-tested by a 5-advisor council and then every technical claim was verified against the live prod database. Summary of changes:

1. **RLS model is fine — v1's instinct was correct.** Verified: `private.get_current_client_id()` returns `SELECT id FROM businesses WHERE owner_user_id = auth.uid()` — i.e. the **businesses.id**. New tables that filter `business_id = private.get_current_client_id()` are correct. No change needed. (This was the council's top hold; it is cleared.)

2. **Theme 1 must EXTEND the existing call-intelligence pipeline, not build a parallel one.** This is the single most important correction. The codebase already runs AI on every transcript after a call via `src/lib/call-intelligence.ts` + `src/lib/score-call-async.ts` + the `score-pending-calls` cron (every 10 min), and stores results in `calls.intelligence_score / intelligence_status / intelligence_summary / intelligence_flags (jsonb) / intelligence_actions / owner_alerted / alert_reason / flagged`. v1's `/api/transcript/analyse` fire-and-forget + new `frustration_detected` / `flagged_for_review` columns would double-process every transcript (double AI cost + double webhook load) and re-introduce a fire-and-forget reliability bug the existing cron already solved. **v2 adds gap-detection and frustration as additional outputs of the existing scoring pass.** See Part 2.

3. **Auto-marketing-SMS to owners is held on compliance.** Verified: there is no owner-level marketing-SMS consent or opt-out field (`contacts.sms_opted_out` exists, but the referral and cancellation texts target `businesses.owner_phone`). Under the Spam Act 2003 (Cth) you need consent + a functional unsubscribe for commercial electronic messages. v2 reclasses each message as **transactional** (allowed) or **marketing** (gated on opt-in + opt-out), and moves the referral prompt in-portal by default. See Part 3C / 5A.

4. **Never hardcode plan prices.** Verified canonical source: `src/lib/pricing.ts` (`starter 299 / growth 499 / pro 799`, plus annual + setup fees). v1 re-hardcoded these in several places. Import from `pricing.ts`. Also note the EOFY display-sale helper (`src/lib/eofy-sale.ts`) — any owner-facing price must respect it.

5. **Migration 076 consolidated and de-duplicated.** v1 defined `cancelled_at` and `activated_at` twice (main block + "addendum"). v2 has one block, all `IF NOT EXISTS`. `referred_by_business_id` is dropped — `businesses.referred_by (uuid)` already exists; reuse it. `activated_at` backfill from `created_at` is wrong (created ≠ activated) — see Part 1 for the corrected backfill.

6. **The build is split into Phase 0 / A / B / C.** v1 was 15 features + 2 unrelated prod deploys + live webhook edits in one session. Council was unanimous this is 3+ sessions. v2 phases by blast radius. Ship Phase 0 + A first; B and C are separate PRs with explicit gates.

7. **The "do not ask for confirmation on anything" instruction is overridden for production-touching steps.** Migrations on prod, edits to the live Vapi/Stripe webhooks, new crons, and the Firefox-widget prod deploy each require an explicit human go per the CLAUDE.md pipeline. Full autonomy applies to everything else.

---

## READ THIS FIRST — CRITICAL CONTEXT (verified 2026-06-04)

### Current prod state
- Migrations applied to prod: through **075** (`075_identity_block_flag`). Next number: **076**.
- ⚠️ The local repo working copy may be behind: confirm `074_onboarding_intelligence.sql` and `075_identity_block_flag.sql` exist in `supabase/migrations/` after `git pull dev` BEFORE writing 076. If they are missing, you are on the wrong branch.
- Session 4A Round 2 (identity injection) is in **PR #119, NOT merged**. Do NOT touch PR #119.
- Live customer agents — zero changes this session:
  - GM Towing vapi_agent_id `25443e10-2ff0-4a9c-a3f1-4cdbdead9715`
  - Spectrum Towing vapi_agent_id `8121a8b0-ae4d-43ed-a3a6-8285b858d5d9`
  - Both: `identity_block_enabled=false`, `owner_name=null` — do not change.
- Live business population (verified): 4 active (3 growth, 1 starter), 7 cancelled (2 pro, 5 starter), 1 pending. Tiny N — favour data-capture now, heavy automation later.

### Schema truths (verified against prod, not assumed)
- `businesses.plan` text CHECK IN ('starter','growth','pro'). Prices live in `src/lib/pricing.ts` — never hardcode.
- `businesses.account_status` observed values: 'active','cancelled','pending' (+ 'trial' per app logic). Active-business filter: `account_status IN ('active','trial')`.
- `businesses.vapi_agent_id` (text). Never vapi_assistant_id.
- `businesses.owner_phone` (text) EXISTS — use it for owner SMS, not `notifications_config.owner_number`.
- `businesses.referred_by` (uuid) EXISTS — reuse for referrals. Do NOT add `referred_by_business_id`.
- `businesses` already has activation-ish timestamps: `payment_confirmed_at`, `golive_verified_at`, `go_live_gate_passed`, `trial_converted_at`, `onboarding_complete_at`. Use these; do not invent `activated_at` backfilled from `created_at`.
- `calls.duration_seconds` (integer) EXISTS. `calls.transcript` (text), `calls.outcome` (text), `calls.was_abandoned` (boolean), `calls.flagged` (boolean), `calls.owner_alerted`, `calls.alert_reason`, `calls.intelligence_*` ALL EXIST — this is the existing intelligence pipeline. Do not duplicate it.
- `contacts.client_id` (uuid, = businesses.id). `contacts.sms_opted_out` + `sms_opted_out_at` EXIST.
- `knowledge_base_entries` columns: business_id, category, question, answer, is_active, sort_order. The add-to-KB INSERT `(business_id, category='faq', question, answer='')` is valid.
- `sales_reps.notification_email` + `sales_reps.status` EXIST — filter active reps with notification_email for the digest.
- RLS helpers (verified, in `private` schema): `private.get_current_client_id()` (returns businesses.id), `private.current_rep_id()`, `private.is_super_admin()`.
- New-table RLS pattern: `business_id = private.get_current_client_id()`, with `DROP POLICY IF EXISTS` before `CREATE POLICY`.
- `createAdminClient()` = service role for server API routes. `src/lib/resolve-business.ts` = dual-mode auth helper. Never `.single()` on businesses — use `.maybeSingle()`/`.limit(1)`. Never write `calls.contact_id` — use the `contact_calls` join.
- AI: `grokChat()` default `grok-4.20-0309-non-reasoning`. Claude API: `claude-sonnet-4-6`.
- Copy rules: no em dashes; no mention of Vapi/ElevenLabs/Twilio/Make.com in client-facing copy. Table is `businesses` (never `clients`).
- Existing crons to EXTEND (not rebuild): `/api/cron/nps-check` (0 1 * * *), `/api/cron/client-health-watch` (40 22 * * *), `/api/cron/onboard-day7` (0 22 * * *). `vercel.json` currently has 30 crons; Vercel Pro ceiling is 40.

### Production safety rules (override "no confirmation" for these)
- Migration 076: additive only, all `IF NOT EXISTS`, run on **preview first**, verify, then prod with an explicit go. No locking rewrites of `calls`/`businesses`.
- Edits to the live Vapi webhook (`src/app/api/webhooks/vapi/route.ts`) and Stripe webhook (`src/app/api/webhooks/stripe/route.ts`): new logic goes BEHIND the existing post-call/scoring path and inside try/catch so a throw can never 500 the existing 200-OK response. Deploy to preview, replay a captured real payload, then prod.
- New crons: off-minute schedules (not `0`), idempotent, deduped via a status column or `system_alerts` row.
- Any SMS to owners: classify transactional vs marketing (Part 3C). Marketing requires opt-in + opt-out.

---

## BUILD PHASES — ship in this order, each its own PR off `dev`

### Phase 0 — Pre-build fixes (own PR, no feature code)
Branch `fix/prebuild-widget-and-notices` from `dev`.
- **Firefox widget fix** — REQUIRES explicit prod-deploy authorisation from Irfan before it goes to prod (system-map flag). Apply/verify the input CSS + Enter-guard + footer-focus changes in `public/widget/talkmate-chat.js`; bump `ChatbotWidget.tsx` script src to `?v=2` in the website repo. If already present, just confirm and report.
- **NoticeBanner** for silent redirects: `src/components/ui/notice-banner.tsx` + `src/lib/notice-codes.ts`, wired into the client and sales portal layouts, reading `?notice=<code>`. Update the top redirects to carry a notice code (proposal→profile, `/inbox` plan gate, chatbot plan gate, go-live gate).
- Ship and verify before starting Phase A.

### Phase A — Transcript intelligence + read-only surfaces + revenue plumbing (own PR, low blast radius)
Branch `feature/4b-a-intelligence` from `dev`. Contains: migration 076, Theme 1 (as an EXTENSION of the existing pipeline), `/insights` read-only page + sidebar + admin parity, feature-discovery banners (read-only dashboard prompts), billing-contact field, monthly performance report email. None of this edits the Stripe webhook or sends owner marketing SMS.

### Phase B — Lifecycle + nudges (own PR, touches Stripe webhook + crons; feature-flagged, test-business-first)
Branch `feature/4b-b-lifecycle` from `dev`. Contains: cancellation reason survey, cancellation-save (transactional SMS), NPS detractor Telegram alert (internal), onboarding nudge extensions, plan-upgrade prompt. Gate: a synthetic test business as the harness; never debut a flow against GM Towing or Spectrum.

### Phase C — Growth mechanics (own PR, gated on compliance sign-off)
Branch `feature/4b-c-growth` from `dev`. Contains: referral mechanism (in-portal first; SMS only with opt-in + opt-out + real credit mechanism + T&Cs), "Powered by TalkMate" badge, and the cross-industry knowledge-base groundwork (Part 6). Hold until owner marketing-SMS consent and ACCC "free month" T&Cs are confirmed.

---

## PART 1 — DATABASE MIGRATION 076 (consolidated, additive, verified)

File: `supabase/migrations/076_retention_intelligence.sql`. Run on preview first, verify, then prod with explicit go.

```sql
BEGIN;

-- ── Transcript gaps: questions the agent could not answer ────────────────────
-- industry is denormalised on insert so gaps can later be aggregated across
-- businesses in the same industry (future cross-industry knowledge base — Part 6).
CREATE TABLE IF NOT EXISTS transcript_gaps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  call_id UUID REFERENCES calls(id) ON DELETE SET NULL,
  industry TEXT,                       -- copied from businesses.industry at insert
  question TEXT NOT NULL,
  context TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','accepted','dismissed','added_to_kb')),
  kb_entry_id UUID REFERENCES knowledge_base_entries(id) ON DELETE SET NULL,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  actioned_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Frustration: reuse the EXISTING intelligence pipeline, do not duplicate ───
-- calls already has intelligence_flags (jsonb), flagged, owner_alerted, alert_reason.
-- Add ONE narrow column for the review-queue state used by the /insights page.
-- Frustration signals live inside intelligence_flags (jsonb), NOT a new array column.
ALTER TABLE calls
  ADD COLUMN IF NOT EXISTS needs_review BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS needs_review_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

-- ── Billing contact + monthly summary ────────────────────────────────────────
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS billing_contact_name TEXT,
  ADD COLUMN IF NOT EXISTS billing_contact_email TEXT,
  ADD COLUMN IF NOT EXISTS monthly_summary_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_monthly_summary_sent_at TIMESTAMPTZ;

-- ── Referral codes (reuse businesses.referred_by for the link, do NOT add a dup)
CREATE TABLE IF NOT EXISTS referral_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  used_by_business_id UUID REFERENCES businesses(id) ON DELETE SET NULL,
  credit_applied BOOLEAN NOT NULL DEFAULT false,
  credit_applied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (business_id)
);

-- ── Cancellation data ────────────────────────────────────────────────────────
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
  ADD COLUMN IF NOT EXISTS cancellation_reason_detail TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancellation_save_sent BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cancellation_save_sent_at TIMESTAMPTZ;

-- ── Upgrade prompt tracking ──────────────────────────────────────────────────
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS upgrade_prompt_last_shown_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS upgrade_prompt_dismissed_count INT NOT NULL DEFAULT 0;

-- ── Referral prompt tracking + chatbot attribution ──────────────────────────
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS referral_prompt_sent BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS referral_prompt_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS chatbot_show_powered_by BOOLEAN NOT NULL DEFAULT false;

-- ── Owner marketing-SMS consent (NEW — required for Spam Act compliance) ─────
-- Referral SMS (Part 5A) may only send when owner_marketing_sms_consent = true.
-- Transactional messages (cancellation-save, service notices) are exempt.
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS owner_marketing_sms_consent BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS owner_marketing_sms_consent_at TIMESTAMPTZ;

-- ── Feature-discovery banner dismissals ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS banner_dismissals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  banner_key TEXT NOT NULL,
  dismissed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (business_id, banner_key)
);

-- ── RLS (get_current_client_id() returns businesses.id — verified) ───────────
ALTER TABLE transcript_gaps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS client_transcript_gaps ON transcript_gaps;
CREATE POLICY client_transcript_gaps ON transcript_gaps
  FOR ALL TO authenticated
  USING (business_id = private.get_current_client_id())
  WITH CHECK (business_id = private.get_current_client_id());

ALTER TABLE referral_codes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS client_referral_codes ON referral_codes;
CREATE POLICY client_referral_codes ON referral_codes
  FOR ALL TO authenticated
  USING (business_id = private.get_current_client_id())
  WITH CHECK (business_id = private.get_current_client_id());

ALTER TABLE banner_dismissals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS client_banner_dismissals ON banner_dismissals;
CREATE POLICY client_banner_dismissals ON banner_dismissals
  FOR ALL TO authenticated
  USING (business_id = private.get_current_client_id())
  WITH CHECK (business_id = private.get_current_client_id());

-- ── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_transcript_gaps_business ON transcript_gaps(business_id, status, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_transcript_gaps_call ON transcript_gaps(call_id) WHERE call_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transcript_gaps_industry ON transcript_gaps(industry, status);
CREATE INDEX IF NOT EXISTS idx_referral_codes_code ON referral_codes(code);
CREATE INDEX IF NOT EXISTS idx_banner_dismissals_business ON banner_dismissals(business_id, banner_key);
CREATE INDEX IF NOT EXISTS idx_calls_needs_review ON calls(business_id, needs_review) WHERE needs_review = true;

COMMIT;
```

**No `activated_at`, no `frustration_detected`/`frustration_signals`/`flagged_for_review`/`flagged_at`, no `referral_code`/`referred_by_business_id` on businesses, no migration "addendum".** Where v1 used those:
- "activation date" → use `COALESCE(payment_confirmed_at, golive_verified_at, trial_converted_at)`.
- frustration flag → `calls.needs_review` + signals stored inside `calls.intelligence_flags` jsonb.
- referral link → existing `businesses.referred_by`.

Verify on preview: the 3 new tables exist, the new columns exist on `calls`/`businesses`, RLS is enabled, and a non-owner cannot select another business's `transcript_gaps`.

---

## PART 2 — TRANSCRIPT INTELLIGENCE (EXTEND the existing pipeline)

**Before writing anything, read these:** `src/lib/call-intelligence.ts`, `src/lib/score-call-async.ts`, `src/app/api/cron/score-pending-calls/route.ts`, and the post-call section of `src/app/api/webhooks/vapi/route.ts`. The agent is ALREADY scored after each call (Grok/Haiku) with results in `calls.intelligence_*`. Do not add a second analyser.

### 2A. Gap + frustration extraction inside the existing scoring pass
In the existing scoring routine (`call-intelligence.ts` / `score-call-async.ts`), where it already has the transcript and is already calling the model, extend the prompt to ALSO return:
```
gaps: [{ question, context }]   // moments the assistant could not answer; max 5; [] if handled well
frustration: { detected: boolean, signals: string[] }   // repeated questions, urgency language, abrupt end
```
Then, in the same pass (no new webhook fetch, no fire-and-forget):
- For each gap, `INSERT INTO transcript_gaps (business_id, call_id, industry, question, context)` — set `industry` from `businesses.industry`. Dedup: skip if the same question (case-insensitive) was detected for this business in the last 7 days.
- If `frustration.detected`: set `calls.needs_review = true`, `needs_review_at = now()`, and merge the signals into `calls.intelligence_flags` (jsonb). Do NOT create a parallel flag system — reuse `intelligence_flags` and the existing `flagged`/`owner_alerted` semantics.
- Notification: if ≥3 new pending gaps for a business today and none alerted today, send the admin Telegram via the existing `sendAdminTelegram`/`system_alerts` dedup pattern.

This runs on the existing cadence (post-call + the `score-pending-calls` cron retry), so it inherits the existing retry/idempotency. No webhook blocking, no double AI spend.

### 2B. Self-training UI — read endpoints + action endpoint
- `src/app/api/transcript/gaps/route.ts` — GET, Supabase user auth (supports `?adminClientId=`). Returns pending `transcript_gaps`, newest first, limit 20, with the joined call date/duration.
- `src/app/api/transcript/gaps/[id]/route.ts` — PATCH, Supabase user auth. Body `{ action: 'accept' | 'dismiss' | 'add_to_kb' }`.
  - `accept` → status='accepted', actioned_at=now()
  - `dismiss` → status='dismissed', actioned_at=now()
  - `add_to_kb` → INSERT into `knowledge_base_entries (business_id, category='faq', question=gap.question, answer='')`; set `transcript_gaps.status='added_to_kb'`, `kb_entry_id`, `actioned_at=now()`; set `businesses.kb_sync_status='pending'`; return `{ kbEntryId }`. Client then navigates to `/train` to fill the answer.

### 2C. `/insights` page (read-only) + sidebar + admin parity
- `src/app/(portal)/insights/page.tsx`:
  - Section 1 "Unanswered Questions" — pending gaps as cards (call date, "A customer asked:" question, context quote muted/truncated, buttons: `+ Add to Training` / `Dismiss` / `Already covered`). "Add all to training" if ≥3. Empty state: "Your agent is handling all questions well. Check back after more calls."
  - Section 2 "Calls needing a closer look" — `calls WHERE needs_review = true` (last 10, by `needs_review_at` desc): date/time/duration, masked caller number, signal tags from `intelligence_flags`, "Listen to summary" reusing the existing calls drawer, "Mark reviewed" → `needs_review=false, reviewed_at=now()`. Empty state copy as v1.
- Sidebar: add "Insights" after "Calls", `Lightbulb` icon, badge = count of pending gaps (reuse the inbox-unread realtime pattern).
- Admin parity: `/admin/clients/[id]/portal/insights` thin server page passing adminClientId; add "Gaps" and "Flagged" counts to the admin clients list (note: `/admin/clients/page.tsx` already imports the intelligence flag — extend it, don't fork).

### 2D. Sales transcript digest (Phase A, no AI cost)
- `src/app/api/cron/sales-transcript-digest/route.ts` — GET, CRON_SECRET. Schedule `0 22 * * 0` (Mon 08:00 AEST). Pure SQL pattern-matching over the last 7 days of transcripts, grouped by `businesses.industry`: top question starters, booking-signal phrases (`outcome='booked'` or signal phrases), hang-up phrases (`was_abandoned=true`/short+no-booking). Build with `sendEmail()` (`src/lib/email.ts`) from `SALES_EMAIL_FROM` to active `sales_reps` with `notification_email`. Subject "TalkMate Sales Intel — Week of [date]".

---

## PART 3 — CLIENT RETENTION

### 3A. Extend client health score (Phase A — read/score only)
Extend `src/lib/client-health.ts` and `/api/cron/client-health-watch` (do not rebuild). Add signals: no login 14+ days (`auth.users.last_sign_in_at`); `kb` count < 5; winback disabled; review requests disabled with a `google_review_url` present; zero calls in 7 days for a business older than 30 days; ≥3 pending `transcript_gaps` older than 3 days. Score = 100 − riskScore (floor 0). Below 40 → extend the existing Telegram alert with the triggered signals. No schema change.

### 3B. NPS extension (Phase B — internal alert is fine; referral SMS is gated)
Extend `/api/cron/nps-check` (read it first). After processing a response:
- score ≤ 6 → internal Telegram to Jade (transactional/internal, no consent issue): business, owner, plan, comment, "Call within 48 hours."
- score ≥ 8 → do NOT auto-send a marketing SMS. Instead set a flag that surfaces an **in-portal** referral prompt (Part 5A), and only send a referral SMS if `owner_marketing_sms_consent = true`. Track `referral_prompt_sent`.

### 3C. Cancellation save (Phase B)
- In the Stripe webhook `customer.subscription.deleted` handler, after existing logic, set `businesses.cancelled_at = now()` (inside try/catch, never throwing into the existing path).
- `src/app/api/cron/cancellation-save/route.ts` — GET, CRON_SECRET, schedule `0 * * * *` (hourly). Select businesses `account_status='cancelled' AND cancelled_at BETWEEN now()-interval '24 hours' AND now()-interval '22 hours' AND cancellation_save_sent=false LIMIT 10`. Send ONE message to `owner_phone` via `sendSMS()`, then mark sent.
  - **This message is transactional** (it concerns service the customer paid for ending and data retention) — allowed without marketing consent. Keep it factual, drop the "23 hours" precision and the salesy tone. Suggested copy: "Your TalkMate agent has stopped answering calls. Your contacts and call history are saved for 30 days. To reactivate, sign in at app.talkmate.com.au or reply HELP." Do not promise "back up in minutes". Confirm whether the Twilio number can actually receive and route a reply before implying one.
- Add `cancellation_save` to `SmsType` in `src/lib/sms.ts`.

### 3D. Cancellation reason survey (Phase B)
Modal before the existing cancel confirmation in billing settings. Title "Before you go, one quick question". Options: Too expensive / Not enough calls to justify it / Service quality / Sorted it another way / Other. (Reworded "My customers didn't like the AI" → "Service quality" to avoid the internal/external AI contradiction the council flagged; keep the optional free-text.) `src/app/api/billing/cancel-with-reason/route.ts` POST: save `cancellation_reason` + `cancellation_reason_detail`, then call the existing cancel flow. Surface reason on the admin client detail page + the existing admin digest.

### 3E. Feature-discovery banners (Phase A — read-only)
- `src/app/api/dashboard/feature-prompts/route.ts` GET + `.../dismiss/route.ts` POST (insert into `banner_dismissals ON CONFLICT DO NOTHING`).
- Conditions use real columns (`winback_enabled`, `review_requests_enabled`, `google_review_url`, `chatbot_enabled`, kb count, pending gap count). **Fix v1's precedence bug:** the chatbot condition must be `!dismissed.includes('chatbot') && !business.chatbot_enabled && (business.plan === 'growth' || business.plan === 'pro')` — parenthesise the OR. Return at most 2, sorted by priority.
- `<FeaturePrompts />` on the dashboard below ROI: amber left border, title/body/CTA/dismiss-X, fade on dismiss, renders nothing if empty.

### 3F. Onboarding nudges (Phase B — extend `/api/cron/onboard-day7`)
Read the existing cron. Add day-3 (kb < 5 → SMS to `/train`) and day-14 (chatbot not enabled on growth/pro → SMS to `/chatbot`) checks, and extend the day-7 path for reviews. **Use `COALESCE(payment_confirmed_at, golive_verified_at, trial_converted_at)` as the activation reference — not a new `activated_at`.** These onboarding nudges are arguably transactional (helping a paying customer set up what they bought); still, respect `sms_opted_out` semantics and keep them minimal.

---

## PART 4 — REVENUE INTELLIGENCE

### 4A. Billing contact field (Phase A)
Settings "Billing Contact" card (name, email, "Send monthly summary" toggle default ON). `src/app/api/settings/billing-contact/route.ts` GET/PATCH on the new columns.

### 4B. Monthly performance report (Phase A — email is transactional)
`src/app/api/cron/monthly-performance-report/route.ts` — GET, CRON_SECRET, schedule `0 23 1 * *` (1st, 09:00 AEST). For each `account_status IN ('active','trial')` business, gather last-month stats (calls, after-hours, abandoned, winbacks, review requests, chat leads, avg duration, ROI via `src/lib/roi.ts` `computeRoiForBusiness()`, top 3 gaps, count of `needs_review` calls, escalation rate). Email template `src/lib/email-templates/monthly-report.ts`, brand colours, to owner + `billing_contact_email` when set and `monthly_summary_enabled`. From `hello@talkmate.com.au`.
- **ROI honesty (council):** the headline must not read as invented. Use "Estimated value recovered" with a one-line "How we estimate this" link to the methodology, and pull the number and assumptions from `src/lib/roi.ts` (which already holds the conversion-rate config on `businesses.roi_*`). Never a bare "$X recovered" with no basis.

### 4C. Plan upgrade prompt (Phase B)
`src/app/api/dashboard/upgrade-prompt/route.ts` GET. **Import plan costs from `src/lib/pricing.ts`** (do not hardcode 299/499/799), and respect `src/lib/eofy-sale.ts` for any displayed price. Show only if avg monthly ROI (via `roi.ts`) > 10× plan cost AND plan !== 'pro' AND not dismissed in 30 days AND not shown in 7 days. `<UpgradePrompt />` below the ROI hero. Reword the copy: drop "The math makes sense" (patronising per the council); state the numbers plainly and let the owner conclude. Dismiss writes `upgrade_prompt_last_shown_at` + increments `upgrade_prompt_dismissed_count`.

---

## PART 5 — GROWTH MECHANICS (Phase C — gated on compliance)

### 5A. Referral mechanism
- `src/lib/referral.ts` — `generateReferralCode(businessId)` and `getOrCreateReferralCode(businessId, supabase)` (maybeSingle, insert if absent). `src/app/api/referral/route.ts` GET returns/creates the code.
- Public landing `src/app/refer/[code]/page.tsx` — looks up `referral_codes` by code, shows referrer business name + benefit, CTA into the existing signup with the code in the URL. On signup, store the code and set the new business's existing `referred_by` to the referrer's business id.
- Settings "Refer a business" card with link + copy button + "X referred / X credits earned".
- **In-portal first. SMS only when `owner_marketing_sms_consent = true`** and the SMS includes an opt-out ("Reply STOP to opt out"). Wire STOP handling.
- **"Free month" claims (ACCC):** do not state "you both get a free month" in any automated message until the credit mechanism is real and the T&Cs are written. Until then use "you could earn account credit — see terms". Referral credit application stays manual (Telegram to Irfan) but log it to `referral_codes.credit_applied` so there is an audit trail; "applied manually with no record" is not acceptable.

### 5B. "Powered by TalkMate" badge (Phase C, low risk)
Toggle in `/chatbot` settings (default OFF). Add `chatbot_show_powered_by` to `src/app/api/chatbot/config/route.ts` GET/PATCH and to the widget config at `/api/chat/widget/[slug]`. In `public/widget/talkmate-chat.js`, render the badge when `config.showPoweredBy`.

---

## PART 6 — CROSS-INDUSTRY KNOWLEDGE BASE (groundwork only this session)

The council's strongest upside point: aggregated gap-detection across all businesses in an industry is a compounding moat (a pre-loaded "industry brain" so each new agent is smart on day one). We are NOT building the aggregation product this session, but we make it cheap later by denormalising `industry` onto `transcript_gaps` now (done in migration 076) and adding one admin view:
- `/admin/insights` (Phase A, read-only): all pending `transcript_gaps` across businesses, filterable by industry, sortable by date/status, with bulk add-to-KB / dismiss. This is also the admin operational view. The cross-customer aggregation/seeding is a future session, explicitly out of scope here.

---

## PART 7 — VERCEL.JSON CRON ADDITIONS

Current count: 30 (Pro ceiling 40). Adding 3 → 33. Add (do not modify existing entries), off-minute schedules:
```json
{ "path": "/api/cron/sales-transcript-digest",    "schedule": "0 22 * * 0" },
{ "path": "/api/cron/monthly-performance-report", "schedule": "0 23 1 * *" },
{ "path": "/api/cron/cancellation-save",          "schedule": "0 * * * *" }
```
`sales-transcript-digest` ships in Phase A; `cancellation-save` in Phase B.

---

## PART 8 — WEBSITE UPDATES (talkmate-website repo, Phase A)
- Homepage tiles: "Your agent gets smarter automatically" and "Monthly performance report" (copy as v1, no em dashes).
- Pricing rows (all plans): agent insights & gap detection; monthly performance report; billing contact / monthly summary; referral program (only once Phase C ships and T&Cs exist).

---

## PART 9 — ENV VARS
No new env vars. Uses existing `GROK_API_KEY`, `CRON_SECRET`, `NEXT_PUBLIC_APP_URL`, `SALES_EMAIL_FROM`, Resend via `sendEmail()`.

---

## DEPLOYMENT CHECKLIST

### Phase 0
- [ ] Firefox widget fix verified in `public/widget/talkmate-chat.js`; `?v=2` in website `ChatbotWidget.tsx`. PROD deploy of this requires explicit Irfan authorisation.
- [ ] NoticeBanner + notice-codes.ts wired into both portal layouts; top redirects carry `?notice=`.

### Phase A (DB then features)
- [ ] Run 076 on preview (rgifivtzmjvanzqwgadq); verify 3 tables, new columns, RLS, cross-tenant denial.
- [ ] Confirm 074/075 migration files present locally before 076 (else wrong branch).
- [ ] Run 076 on prod (mdsfdaefsxwrakgkyflr) — explicit go.
- [ ] Gap + frustration extraction added INSIDE the existing scoring pass (no new fire-and-forget; no duplicate flag columns).
- [ ] `/insights` read-only page + sidebar badge + admin parity.
- [ ] Feature prompts (chatbot OR-precedence parenthesised), billing-contact, monthly report (ROI from roi.ts, methodology link), sales digest cron.

### Phase B (webhook + crons, feature-flagged, test-business-first)
- [ ] Stripe webhook sets `cancelled_at` in try/catch behind existing logic; preview-replay before prod.
- [ ] cancellation-save cron tested via Stripe CLI trigger + a backdated `cancelled_at` row — never cancel a real customer.
- [ ] NPS detractor Telegram (internal) + onboarding nudges using COALESCE activation reference.
- [ ] Upgrade prompt importing pricing.ts.

### Phase C (compliance gate)
- [ ] Owner marketing-SMS consent capture + STOP handling live before any referral SMS.
- [ ] "Free month" T&Cs written and credit mechanism real, or copy reworded.
- [ ] Referral landing + settings + Powered-by badge.

### Cross-cutting
- [ ] `npm run build` + `npx tsc --noEmit` clean before each PR.
- [ ] No SMS/marketing flow debuts against GM Towing or Spectrum — use a synthetic test business.
- [ ] All deviations + Donna handoffs documented in DEPLOYMENT.md.

### Donna / manual handoffs
1. Verify monthly-report rendering via a test send to a synthetic business (not a live customer).
2. Referral credit applied manually in Stripe, then mark `referral_codes.credit_applied=true` for the audit trail.
3. Token rotation reminder: 4 leaked tokens still unrotated (see SYSTEM_MAP Known Gaps) — separate action.
4. `call-forward-check` false-positive investigation (GM Towing / Spectrum / Rapid Plumbing) — check the cron's test path before contacting owners.

---

## BUILD PROMPT (paste into Claude Code)

```
Read docs/briefs/talkmate-session-4b-brief-v2.md in full before writing any code. This v2 is DB-verified; follow it over v1.

Pull latest dev. Confirm 074 + 075 migration files exist locally (else you are on the wrong branch). Do NOT touch PR #119.

Ship in phases, each its own PR off dev: Phase 0 (pre-build fixes), Phase A (migration 076 + transcript intelligence as an EXTENSION of the existing call-intelligence pipeline + read-only /insights + feature prompts + billing contact + monthly report + sales digest), Phase B (Stripe webhook + cancellation/NPS/onboarding/upgrade, feature-flagged, test-business-first), Phase C (referral + powered-by, gated on SMS consent + ACCC T&Cs). STOP after Phase A and report before starting B.

Hard rules verified from prod:
1. private.get_current_client_id() returns businesses.id — new tables use business_id = private.get_current_client_id(). Correct as written.
2. Theme 1 EXTENDS src/lib/call-intelligence.ts + score-call-async.ts + score-pending-calls cron. Do NOT add /api/transcript/analyse or duplicate frustration columns. Read those files first.
3. Migration 076 is additive, all IF NOT EXISTS, one block. No activated_at (use COALESCE(payment_confirmed_at, golive_verified_at, trial_converted_at)). No referred_by_business_id (use existing businesses.referred_by).
4. Import plan prices from src/lib/pricing.ts; respect src/lib/eofy-sale.ts. Never hardcode 299/499/799.
5. Owner SMS: cancellation-save + onboarding nudges = transactional (OK). Referral SMS = marketing → only with owner_marketing_sms_consent + STOP handling. No "free month" promise without real credit mechanism + T&Cs.
6. Live Vapi/Stripe webhook edits go behind existing logic in try/catch, preview-replay before prod. Never debut a flow against GM Towing or Spectrum.
7. Migrations: preview (Supabase MCP) first, verify, then prod. These steps + webhook edits + new crons require an explicit go — do not auto-deploy them.
8. No em dashes; no Vapi/Twilio/ElevenLabs/Make.com in client-facing copy. businesses (never clients). Never .single() on businesses.

npm run build + npx tsc --noEmit clean before each PR. Document deviations + Donna handoffs in DEPLOYMENT.md.
```
```
