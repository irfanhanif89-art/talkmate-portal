# GM Towing Repair + Client-Health Safeguards — Design

**Date:** 2026-06-02
**Author:** Claude (with Irfan)
**Status:** In progress — Part 1a shipped (live), Parts 2/3 building
**Base:** `dev` (main `390be8f`). Next migration `069` (Parts 2/3 need none).

## Background

GM Towing (`df0ab1a1-eb8c-479e-b92c-63acf9957cbc`, Growth plan) gave written notice to cancel. An audit of all 158 of their calls (14–28 May) found the churn was caused by configuration and monitoring failures, not by the product being incapable:

- **87% of calls were under 15 seconds; 57% under 5 seconds.** 124 calls ended with the customer hanging up at an average of 6 seconds.
- GM is a **B2B container/heavy-haulage** business with ~124 regular trade-account customers who call constantly. 25 of 64 distinct callers were on their regulars list; several called 5–9 times, repeatedly hanging up within 1–3 seconds.
- Their agent was built from the **roadside car-towing template and never converted**: FAQs ("I've got RACV/NRMA", "accident scene pressuring me to sign") and escalation rules ("freeway shoulder", "children in vehicle") do not match container transport.
- The 124 regulars were loaded as VIP callers, but **VIP fast-path was never functional**: 123 were typed `account_type='vip'` with `vip_bypass=false` AND `transfer_to_member_id=NULL`, and `businesses.notifications_config.live_transfer_number` was null. So even a matched regular returned `caller_type='vip'` with no transfer destination.
- The agent prompt **never branches on `check_caller`** — transcripts show it asks "Do you have an account with us?" even to known repeat callers.
- **Nothing alerted anyone** that average call duration had collapsed to 8 seconds for two weeks.

Two safety nets were missing: nothing caught the bad setup at launch, and nothing caught it going wrong afterward. This design fixes GM and builds both safety nets.

## Goals

1. **Repair GM Towing's agent** so regulars are recognised and fast-pathed, and the agent matches a container-haulage business — basis for a save attempt with Hayden.
2. **Per-client health alert** (safety net in the wild) — catch any client whose calls degrade, weeks before they churn. Protects existing clients retroactively.
3. **Go-live gates** (safety net at the door) — block launch of a misconfigured agent: template/FAQ mismatch, and a regulars list loaded without a working fast-path.

Non-goal (deferred): outcome/value (`$ saved/made`) tracking. Important for social proof, but does not prevent churn; separate later build.

## Mechanism reference (verified)

`check_caller` (`src/app/api/vapi/functions/route.ts`) matches the inbound number on the last 9 digits against `vip_callers` and resolves, in priority order:

- `account_type='account'` → `caller_type='account'` (is_existing, company_name, rate_type=account)
- `account_type='vip'` AND `vip_bypass=true` → `caller_type='vip_bypass'` (returns `live_transfer_number`)
- `account_type='vip'` AND `vip_bypass!=true` → `caller_type='vip'` (returns `vip_action` + `vip_transfer_member` from `transfer_to_member_id`)
- contact history → `existing`; else `unknown`

`check_caller` is already a required tool. The failure was (a) GM's rows resolved to a dead `vip` branch, and (b) the agent prompt does not act on the result.

---

## Part 1 — GM Towing repair

### 1a. Data fix (SHIPPED 2026-06-02, reversible)

Done live on prod:
- GM's 123 `vip` regulars → `account_type='account'` (recognised as trade accounts; "do you have an account?" unnecessary; account rate applies). The 1 already-`account` row left as-is. Total now 124 `account`.
- `businesses.notifications_config.live_transfer_number = '0434838808'` (Hayden) so every transfer path has a destination.

Verified: repeat hang-up numbers (e.g. `1300 sparebox`) now resolve to `caller_type='account'`. Backup of prior state (123 row IDs, all `vip`/`vip_bypass=false`; `live_transfer_number` was null) recorded in session transcript. Reversal: set those IDs back to `vip`, null the transfer number.

Rationale for `account` over `vip_bypass`: these callers don't all want Hayden every time — many want to place a container job fast. `account` recognises them and skips the interrogation while still allowing a quote or transfer-on-request. `vip_bypass` (straight-transfer-always) is too blunt for a trade book.

### 1b. Agent prompt rewrite (Vapi, live — HOLD for approval)

Rebuild GM's assistant so it:
1. **Calls `check_caller` on answer**, before anything else.
2. **Branches on the result:**
   - Known account/regular → greet by name/company, **skip** "do you have an account / what company", ask **"Chasing an existing job, or booking a new move?"**
   - Existing-job chase → take reference + callback, fast hand-off (no quote interrogation).
   - New move → run the shortened container quote flow.
   - Asks for Hayden / wants a human → transfer to `0434838808`.
3. **Container-native:** FAQs and escalation rewritten for container/heavy-haulage; remove roadside accident-scene / RACV / freeway content.
4. **Has a name** (persona) + warmer greeting, matching Spectrum's "Harley" quality.
5. **Shortens the quote flow** — group questions; lead with what / where-from / where-to / when, defer the rest.

Prepared and validated against `agent-config-validator.ts` before any push. Live Vapi push only after the sync path (`src/app/api/admin/vapi/sync/route.ts`) is confirmed non-destructive on this assistant.

### 1c. Save message to Hayden

Short message: we found exactly what went wrong, here's what we rebuilt, give us another go. Delivered to Irfan to send — not sent autonomously.

---

## Part 2 — Per-client health watcher (Vercel cron)

Distinct from existing crons: `health-monitor` (system), `agent-health-check` (Vapi liveness), `daily-quality-digest` (per-call quality digest). This one is a **per-client churn-risk early warning** over a trailing window.

Standard watcher recipe: `src/app/api/cron/client-health-watch/route.ts` + `vercel.json`, `verifyCron`, `createAdminClient`, admin Telegram notification, dedup via `system_alerts`.

**Schedule:** off-minute daily, after the quality digest — `40 22 * * *` (08:40 AEST).

**Per active client, trailing window (default 7 days, min 8 calls):**

| Signal | Default trigger |
|--------|-----------------|
| Avg call duration | < 20s |
| Share of sub-5s calls | > 50% |
| Repeat callers hanging up < 5s | ≥ 3 distinct numbers |
| Silence-timeout rate | > 15% |

A client breaching ≥1 threshold → one Telegram alert naming the client, breached signals, the numbers. Dedup with a `system_alerts` row keyed `client_health_<businessId>_<isoWeek>` so each client alerts at most once per week (re-alerts next week if still bad). Healthy → no-op. Thresholds in a config block at top of the route. Applied retroactively, GM would have alerted ~16 May.

Returns `{ checked, alerted, skipped_low_volume }`.

## Part 3 — Go-live gates (extend `src/lib/golive-checks.ts`)

Add two checks to the existing go-live verification used by `approve-agent`:

1. **Template-match gate (warning):** detect template/business mismatch — roadside FAQ phrases ("RACV", "NRMA", "accident scene", "freeway", "lowered") present while the catalogue category is container/freight, or `industry` not matching catalogue. Forces a human to confirm the template was actually converted.
2. **VIP fast-path gate (blocking):** if a client has `vip_callers` rows but **none** resolve to a working fast-path (no `account_type='account'`, no `vip_bypass=true` with a `live_transfer_number`, no `vip` with a `transfer_to_member_id`), block go-live with a clear message. This is the exact GM failure; it can never ship silently again.

Both return results consistent with the existing `golive-checks.ts` shape and appear in the admin Go-Live checklist UI.

---

## Sequencing

1. Part 1a (GM data fix) — **done, live.**
2. Part 2 (health watcher) — highest leverage; protects all current clients. Pipeline → `dev` → `main`.
3. Part 3 (go-live gates) — prevents recurrence for new clients. Same pipeline.
4. Part 1b/1c (GM agent rewrite + Hayden message) — prepared in parallel; live push after sync-path verification + Irfan's go.

## Testing

- **2:** unit-test metric/threshold computation against fixture call sets (GM-shaped degraded set + a healthy set); verify dedup key prevents double-fire; `npm run build` + `tsc --noEmit`.
- **3:** unit-test each gate with passing + failing fixtures (GM-shaped config fails both gates); verify results render in the checklist.
- Standard pipeline: build, validator, QA (Playwright on admin go-live page), reviewer verdict.

## Build notes / refinements (2026-06-02)

- **Pure logic extracted for testing:** watcher math → `src/lib/client-health.ts` (`evaluateClientHealth`); gates exported from `golive-checks.ts` (`computeVipFastPath`, `computeTemplateMatch`). Unit tests: `client-health.test.ts`, `golive-gates.test.ts` (node:assert, run via `tsx`).
- **Gates are blocking-with-override, not soft warnings.** `provisionAgent` already blocks go-live on any false auto-check, with an admin `override` that fires a Telegram alert. Both new gates use that mechanism — a heuristic false-positive can be overridden (and the override is logged), which is better than a silent warning.
- **VIP gate credits `take_message`.** A `vip` whose action only takes a message is valid recognised handling (no transfer needed). The gate fails only when a regular needs a transfer (`transfer_*`) but has no destination (no member, no bypass+live number) — the exact GM pre-fix shape.
- **Watcher excludes demo/test businesses** via `is_demo IS NOT TRUE`.

## Real-data QA (verified against prod)

Watcher metrics over a representative 7-day window:
- **GM Towing (20–27 May):** 74 calls · avg 7.8s · 55% sub-5s · 9 repeat hang-ups → **CRITICAL**. Confirms it would have alerted weeks before the cancellation.
- **Spectrum Towing:** 18 calls · avg 17.4s · 61% sub-5s → would also alert (its traffic is mostly test calls). Acceptable for v1: weekly dedup caps it to one ping, and the low real-capture is worth a glance. Flagged as a tuning candidate (e.g. raise `MIN_CALLS`, add a min-distinct-real-callers floor).

## Risks

- **Live Vapi push (1b):** could disrupt GM's live agent. Mitigated: validate offline, verify sync path, GM has had no calls for 5 days (low blast radius).
- **Health-alert false positives** (low-volume clients): mitigated by min-call-count floor + weekly dedup.
- **Go-live blocking gate** could block a legitimate launch: mitigated by clear messaging + admin override consistent with existing checklist behaviour.
