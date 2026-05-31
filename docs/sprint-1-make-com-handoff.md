# Sprint Session 1 — Make.com audit findings

**Audience:** Donna / Irfan
**Updated:** 2026-05-31 — original "audit required" doc replaced with actual blueprint findings

## TL;DR
- ✅ **Auto Agent Brief (5668121) does NOT touch Vapi.** No collision risk with the `BUSINESS KNOWLEDGE:` block. The scenario name is misleading — it's actually a webhook → Twilio SMS notification to Irfan's phone when a new business signs up. The original concern in the brief turned out to be a false alarm.
- ✅ **Callback Reminder (5684595) is Telegram-only.** No Twilio, no Inbox impact. Sends to chat `7809273812` (Irfan).
- ✅ **Dispatch Job Notification (5684671) sends two Twilio SMS + a Telegram.** Both Twilio SMS now go through the new statusCallback so they appear in the Inbox alongside the operator's own replies.

## Already actioned via the Make.com API (2026-05-31)

| Change | Why | Scenarios |
|---|---|---|
| `From` swapped from `+61468024020` (GM Towing) → `+61468005893` (Spare) | Prevents reply-routing collisions: any customer or driver replying to a Dispatch SMS no longer lands in GM Towing's Inbox + triggers Vapi auto-reply impersonating GM Towing | 5668121 (1 module), 5684671 (2 modules) |

Verified by re-fetching each blueprint after the PATCH; all four `"From"` values now read `+61468005893`. No other scenario fields touched.

## 🚨 Carry-over for when you rotate the Twilio auth token

Scenarios 5668121 and 5684671 carry **hardcoded Basic auth** for the Twilio Messages API in plaintext in the `Authorization` HTTP header:

```
Authorization: Basic <base64 of TWILIO_ACCOUNT_SID:TWILIO_AUTH_TOKEN>
```

When you rotate `TWILIO_AUTH_TOKEN` (item still pending), **regenerate the base64 string** (`echo -n "<SID>:<NEW_TOKEN>" | base64`) and paste it into both scenarios' HTTP modules in the Make.com UI. Otherwise those scenarios start failing the moment Twilio invalidates the old token.

Callback Reminder (5684595) doesn't use Twilio — only the Telegram bot token, which lives in the URL path (`api.telegram.org/bot<TOKEN>/sendMessage`). That's a different rotation concern — out of Sprint 1 scope.

## Pre-existing issues surfaced during the audit

- **Auto Agent Brief** has `isinvalid=true` flag in Make.com's metadata. This means the scenario itself was already broken before Sprint 1 (likely a webhook config issue, possibly missing a required field on the source webhook). The From-number swap was applied successfully but the underlying invalid state is unrelated. Open it in the Make.com UI; the validator chip will point at the actual problem field.
- The Auto Agent Brief webhook is named "TalkMate - Auto Agent Brief" but the body only notifies a human — there's no Vapi assistant write. If the original intent was to actually push agent config to Vapi automatically on signup, that flow doesn't exist. May or may not matter; just flagging the gap between scenario name and behavior.

## Make.com token access for future audits

Stored in Vercel env as `MAKE_API_TOKEN` (production, eu1 region). Future audit scripts should pull from there rather than asking for the token in chat.
