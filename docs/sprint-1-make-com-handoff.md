# Sprint Session 1 — Make.com handoff for Donna

**Audience:** Donna (Irfan's Make.com operator)
**Reason:** Sprint Session 1 adds a portal Inbox + a Vapi knowledge-base sync. Three existing Make.com scenarios touch the same surface area and want a small audit + (optional) update.

This is a triage doc — none of these are urgent. Read all three, action whatever Irfan signs off on, leave the rest as comments in the scenario.

---

## TL;DR

| Scenario                    | ID      | Status                       | Action                                                                 |
|-----------------------------|---------|------------------------------|------------------------------------------------------------------------|
| Callback Reminder           | 5684595 | Working — no break           | Optional: nothing today. Outbound from Make.com won't appear in Inbox. |
| Dispatch Job                | 5684671 | Working — no break           | Same as above.                                                         |
| Auto Agent Brief            | 5668121 | **Audit required**           | Verify it does not stomp the new `BUSINESS KNOWLEDGE:` prompt block.   |

---

## Context — what changed in Sprint 1

Two things landed on prod 2026-05-31 that you should know about before touching these scenarios:

1. **Two-way SMS Inbox** at `https://app.talkmate.com.au/inbox`. Inbound SMS to GM Towing + Spectrum Towing now hits **our** webhook (`/api/webhooks/twilio/sms-inbound`), which logs the message into `sms_conversations` / `sms_messages` AND forwards the payload to `https://api.vapi.ai/twilio/sms` so Vapi auto-reply still fires exactly as before.
2. **Train TalkMate** at `/train` + `POST /api/knowledge-base/sync` + `GET /api/cron/kb-sync` (every 5 min). Anything a client adds in `/train` gets pushed to their Vapi assistant's `systemPrompt` as a **fenced block** that starts with the header line `BUSINESS KNOWLEDGE:`. The rest of the system prompt is preserved verbatim — TalkMate code never touches lines outside that block.

The relevant file for the prompt-block logic is `src/lib/kb-block.ts` — anchored regex `/^BUSINESS KNOWLEDGE:[\s\S]*?(?:\n\s*\n|$)/m`. As long as nothing outside Sprint 1 writes that block header, the two surfaces don't collide.

---

## 1) Callback Reminder (scenario 5684595)

**What it does today:** sends a callback-reminder SMS to the customer via the Twilio module.

**Is it broken?** No. It will keep working unchanged.

**Optional improvement:** The Sprint 1 Inbox shows inbound customer messages + outbound replies sent through `src/lib/sms.ts`. Make.com outbound SMS does NOT go through `lib/sms.ts`, so the operator sitting in `/inbox` won't see the callback reminder we sent earlier — only the customer's reply when it lands.

This is not breaking, but it's a UX gap. Two ways to close it (do NOT do either without Irfan's sign-off):

**Option A — change nothing.** Customer reply still lands in Inbox via the inbound webhook. Operator sees only the reply, not the original reminder. Acceptable for now.

**Option B — POST to a new portal endpoint after the Twilio send.** We'd need to build `/api/sms/log-outbound` first (not built in Sprint 1). Spec for when we get there:

```
POST https://app.talkmate.com.au/api/sms/log-outbound
Headers: Authorization: Bearer <MAKE_SHARED_SECRET>   (new env var, TBD)
Body (JSON):
{
  "businessId": "<uuid>",
  "toPhone": "+614XXXXXXXX",
  "body": "the SMS text you sent",
  "twilioSid": "SMxxxx",
  "sentBy": "callback"
}
```

Don't add this module until the endpoint exists.

---

## 2) Dispatch Job (scenario 5684671)

Same shape, same recommendation as #1. Outbound dispatch SMS doesn't appear in Inbox today; that's acceptable; close the gap later via the same `/api/sms/log-outbound` endpoint when it's built.

---

## 3) Auto Agent Brief (scenario 5668121) — AUDIT REQUIRED

**What it does today:** when a client updates their agent brief in Make.com, this scenario writes to the Vapi assistant's `systemPrompt`.

**Why it matters:** Sprint 1 also writes to `systemPrompt` — but only the `BUSINESS KNOWLEDGE:` block (anchored regex). If Auto Agent Brief does a **full systemPrompt replace**, it WILL overwrite the BUSINESS KNOWLEDGE block on every run. If it does a **partial / append** that leaves existing sections alone, we're fine.

**What to check:**

1. Open scenario 5668121 in Make.com.
2. Find the module that PATCHes `https://api.vapi.ai/assistant/{assistantId}`.
3. Look at the body it sends.

   - If the body contains the entire `model.systemPrompt` string (full replace) → **this stomps the BUSINESS KNOWLEDGE block**. Two fixes:
     - Easiest: BEFORE the PATCH, add an HTTP module that does `GET https://api.vapi.ai/assistant/{assistantId}`, read `agent.model.systemPrompt`, find the existing `BUSINESS KNOWLEDGE:` block (regex `^BUSINESS KNOWLEDGE:[\s\S]*?(?:\n\s*\n|$)`), and append it to whatever new systemPrompt you're about to PATCH.
     - Or: have the Auto Agent Brief scenario POST to `https://app.talkmate.com.au/api/knowledge-base/sync` (with `?adminClientId=<businessId>` + admin auth — same way the admin portal calls it) AFTER its own PATCH. The KB sync will re-add the BUSINESS KNOWLEDGE block.
   - If the body PATCHes a different field (e.g. a custom `metadata.brief` field) → no collision, leave it alone.
   - If the body PATCHes a specific named section of systemPrompt via string replace → check whether the replace anchor could swallow our block header. If `BUSINESS KNOWLEDGE:` appears anywhere in the search pattern, we have a problem.

4. Once you've confirmed the shape, ping Irfan with one of:
   - "Auto Agent Brief leaves BUSINESS KNOWLEDGE alone — no action needed."
   - "Auto Agent Brief was overwriting BUSINESS KNOWLEDGE — patched to preserve it. Tested by adding a Train TalkMate FAQ on a test client, running Auto Agent Brief, GET-ing the assistant, confirming both blocks are still present."

5. If the scenario writes to any field on the Vapi assistant other than `model.systemPrompt` (voice, model name, temperature, tools), don't change those — Sprint 1 KB sync preserves them verbatim and assumes they're owned elsewhere.

---

## What I (Donna) get out of this

The Inbox + Train TalkMate features are live regardless of what you do in Make.com. The bullets above are about preventing **the next round** of regressions, not the current rollout. Treat this as a clean-as-you-go list, not a blocker.

If you want to discuss any of this before touching scenarios, ping Irfan on Telegram — he's signed off on the audit but not on the (potentially destructive) fix to Auto Agent Brief until you've confirmed what it actually does today.
