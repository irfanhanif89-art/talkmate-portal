# TalkMate Referral Program — Terms (DRAFT — NEEDS LEGAL REVIEW)

> ⚠️ This is a DRAFT for Irfan / legal review. Do NOT publish or make a binding
> "free month" / credit claim in product copy until these terms are finalised
> and checked against ACCC guidance (misleading conduct, clear conditions).
> Current in-product copy is deliberately neutral ("we will thank you both").

## How it works (as built — Session 4B Phase C)
1. Each business gets a unique referral link: `app.talkmate.com.au/refer/<CODE>`
   (generated on demand, stored in `referral_codes`).
2. A new business signs up via that link (`/register?ref=<CODE>`).
3. On signup the new business is linked to the referrer
   (`businesses.referred_by`) and the code is marked used
   (`referral_codes.used_by_business_id`). An admin Telegram fires.
4. Credit is applied **manually** in Stripe by TalkMate, then
   `referral_codes.credit_applied` is set true (audit trail).

## Draft terms to finalise
- **Who can refer:** active TalkMate clients in good standing.
- **The reward:** define precisely. Options to decide:
  - "One month account credit for both the referrer and the referred business,
    applied after the referred business completes their first paid month."
  - Credit value = the referred business's first monthly plan fee, or a fixed $ amount.
- **Conditions (must be clear + not misleading per ACCC):**
  - Referred business must be NEW (no prior TalkMate account) and must reach a
    qualifying event (e.g. first successful payment), not just sign up.
  - One reward per referred business; one code use per signup.
  - Credit is account credit, not cash; non-transferable; no expiry stated unless intended.
  - TalkMate may vary or end the program; existing earned credits honoured.
  - Self-referral / fraud / circular referrals are excluded.
- **Timing:** when the credit is applied and how the customer is notified.
- **Privacy / SMS:** referral SMS only sent to clients who opted in
  (`owner_marketing_sms_consent`); every message carries a STOP opt-out
  (Spam Act 2003 compliance).

## Product copy guardrail
Until finalised, product copy must NOT promise a specific "free month" or dollar
amount. Use neutral phrasing ("we will thank you both", "you could earn account
credit — see terms"). Once finalised, update:
- `src/app/refer/[code]/page.tsx`
- `src/components/portal/referral-card.tsx`
- NPS-promoter SMS in `src/app/api/nps/route.ts`
- website pricing/referral copy
and publish the final terms at a stable URL linked from each surface.
