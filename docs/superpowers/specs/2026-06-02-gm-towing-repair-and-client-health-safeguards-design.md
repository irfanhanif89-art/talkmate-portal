# GM Towing Repair + Client-Health Safeguards — Design

**Date:** 2026-06-02
**Author:** Claude (with Irfan)
**Status:** Draft for review

## Background

GM Towing (`df0ab1a1-eb8c-479e-b92c-63acf9957cbc`, Growth plan) gave written notice to cancel. An audit of all 158 of their calls (14–28 May) found the churn was caused by configuration and monitoring failures, not by the product being incapable:

- **87% of calls were under 15 seconds; 57% under 5 seconds.** 124 calls ended with the customer hanging up at an average of 6 seconds.
- GM is a **B2B container/heavy-haulage** business with ~124 regular trade-account customers who call constantly. 25 of 64 distinct callers were on their regulars list; several called 5–9 times, repeatedly hanging up within 1–3 seconds.
- Their agent was built from the **roadside car-towing template and never converted**: FAQs ("I've got RACV/NRMA", "accident scene pressuring me to sign") and escalation rules ("caller on a freeway shoulder", "children in vehicle") do not match container transport.
- The 124 regulars were loaded as VIP callers, but **VIP fast-path was never functional**: 123 are typed `account_type='vip'` with `vip_bypass=false` AND `transfer_to_member_id=NULL`, and `businesses.notifications_config.live_transfer_number` is null. So even a matched regular returns `caller_type='vip'` with no transfer destination.
- The agent prompt **never branches on `check_caller`** — transcripts show it asks "Do you have an account with us?" even to known repeat callers.
- **Nothing alerted anyone** that average call duration had collapsed to 8 seconds for two weeks.

Two safety nets were missing: nothing caught the bad setup at launch, and nothing caught it going wrong afterward. This design fixes GM and builds both safety nets.

## Goals

1. **Repair GM Towing's agent** so regulars are recognised and fast-pathed, and the agent matches a container-haulage business — as the concrete basis for a save attempt with Hayden.
2. **Per-client health alert** (safety net in the wild) — catch any client whose calls degrade, weeks before they churn. Protects existing clients retroactively.
3. **Go-live gates** (safety net at the door) — block launch of a misconfigured agent: template/FAQ mismatch, and a regulars list loaded without a working fast-path.

Non-goal (deferred): outcome/value (`$ saved/made`) tracking. Important for social proof, but does not prevent churn; separate later build.

## Mechanism reference (verified)

`check_caller` (in `src/app/api/vapi/functions/route.ts`) matches the inbound number on the last 9 digits against `vip_callers` and resolves, in priority order:

- `account_type='account'` → `caller_type='account'` (is_existing, company_name, rate_type=account)
- `account_type='vip'` AND `vip_bypass=true` → `caller_type='vip_bypass'` (returns `live_transfer_number`)
- `account_type='vip'` AND `vip_bypass!=true` → `caller_type='vip'` (returns `vip_action` + `vip_transfer_member` from `transfer_to_member_id`)
- contact history → `existing`; else `unknown`

`check_caller` is already a required tool. The failure is (a) GM's row data resolves to a dead `vip` branch, and (b) the agent prompt does not act on the result.

---

## Part 1 — GM Towing repair

### 1a. Data fix (reversible, Supabase)

For GM's 123 `vip` regulars (the 1 already-`account` row is left as-is):

- Set `account_type='account'` so they resolve to the `account` branch — recognised as trade accounts, "do you have an account?" becomes unnecessary, account rate applies.
- Set `businesses.notifications_config.live_transfer_number = '0434838808'` (Hayden) so every transfer path has a destination.

Rationale for `account` over `vip_bypass`: these callers don't all want Hayden every time — many want to place a container job fast. `account` recognises them and skips the interrogation while still allowing a quote or a transfer-on-request. `vip_bypass` (straight-transfer-always) is too blunt for a trade book.

A one-row backup of the prior state is captured before the update (stored in the migration/PR notes) so the change is fully reversible.

### 1b. Agent prompt rewrite (Vapi, live)

Rebuild GM's assistant so it:

1. **Calls `check_caller` on answer**, before anything else.
2. **Branches on the result:**
   - Known account/regular → greet by name/company ("GM Towing, hi — is that {company}?"), **skip** the "do you have an account / what company" questions, and ask **"Chasing an existing job, or booking a new move?"**
   - Existing-job chase → take the reference + callback, fast hand-off (no quote interrogation).
   - New move → run the (shortened) container quote flow.
   - Asks for Hayden / wants a human → transfer to `0434838808`.
3. **Is container-native:** FAQs and escalation rewritten for container/heavy-haulage; remove roadside accident-scene / RACV / freeway content.
4. **Has a name** (persona) and a warmer greeting, matching the quality of Spectrum's "Harley".
5. **Shortens the quote flow** — group questions, stop interrogating; lead with the essentials (what / where-from / where-to / when), defer the rest.

The rewrite is prepared and validated against `agent-config-validator.ts` before any push. The live Vapi push happens only after the sync path is confirmed non-destructive (dry check of `src/app/api/admin/vapi/sync/route.ts` behaviour on this assistant).

### 1c. Save message to Hayden

Draft a short message: we found exactly what went wrong, here's what we rebuilt, give us another go. The technical fix is the proof; the message is what converts it to a save. Delivered to Irfan to send — not sent autonomously.

---

## Part 2 — Per-client health alert (Vercel cron)

Follows the standard 24/7 watcher recipe (`src/app/api/cron/<name>/route.ts` + `vercel.json`, `verifyCron`, `createAdminClient`, `sendAdminTelegram`, dedup via `system_alerts`).

**Route:** `/api/cron/client-health-watch`, schedule off-minute daily (e.g. `23 8 * * *`).

**Per active client, over a trailing window (default 7 days, min 8 calls):** compute and evaluate against thresholds:

| Signal | Default trigger |
|--------|-----------------|
| Avg call duration | < 20s |
| Share of sub-5s calls | > 50% |
| Repeat callers hanging up < 5s | ≥ 3 distinct numbers |
| Silence-timeout rate | > 15% |

A client breaching ≥1 threshold → fire one Telegram alert naming the client, the breached signals, and the numbers. Dedup with a `system_alerts` row keyed `client_health_<businessId>_<isoWeek>` so each client alerts at most once per week (re-alerts next week if still bad). Healthy → no-op.

Thresholds live in a small config block at the top of the route for easy tuning. Applying these retroactively, GM would have alerted ~16 May.

## Part 3 — Go-live gates (extend `src/lib/golive-checks.ts`)

Add two checks to the existing go-live verification used by `approve-agent`:

1. **Template-match gate (warning, surfaced; blocks if severity escalated):** detect template/business mismatch — e.g. roadside FAQ phrases ("RACV", "NRMA", "accident scene", "freeway") present while the catalogue is container/freight, or `industry` not matching catalogue category. Forces a human to confirm the template was actually converted.
2. **VIP fast-path gate (blocking):** if a client has a VIP/regulars list loaded (`vip_callers` rows exist) but **none** resolve to a working fast-path (no `account_type='account'`, no `vip_bypass=true` with a `live_transfer_number`, no `vip` with a `transfer_to_member_id`), block go-live with a clear message. This is the exact GM failure; it can never ship silently again.

Both gates return structured results consistent with the existing `golive-checks.ts` shape and appear in the admin Go-Live checklist UI.

---

## Sequencing

1. Part 1a (GM data fix) — safe, reversible, immediate.
2. Part 2 (health watcher) — highest leverage; protects all current clients. Ship through pipeline → `dev` → `main`.
3. Part 3 (go-live gates) — prevents recurrence for new clients. Same pipeline.
4. Part 1b/1c (GM agent rewrite + Hayden message) — prepared in parallel; live push after sync-path verification.

## Testing

- **1a:** verify `check_caller` returns `caller_type='account'` for a sample GM regular post-update (call the function path or unit-check the query); confirm backup captured.
- **2:** unit-test the metric/threshold computation against fixture call sets (including a GM-shaped degraded set and a healthy set); verify dedup key prevents double-fire; `npm run build` + `tsc --noEmit`.
- **3:** unit-test each gate with a passing and a failing fixture (GM-shaped config fails the VIP gate and the template gate); verify results render in the checklist.
- Standard pipeline: build, validator, QA (Playwright on admin go-live page), reviewer verdict.

## Risks

- **Live Vapi push (1b)** could disrupt GM's live agent. Mitigated: validate offline, verify sync path, and GM has had no calls for 5 days (low blast radius).
- **Health-alert false positives** (low-volume clients): mitigated by the min-call-count floor and weekly dedup.
- **Go-live blocking gate** could block a legitimate launch: mitigated by clear messaging and an admin override path consistent with existing checklist behaviour.
