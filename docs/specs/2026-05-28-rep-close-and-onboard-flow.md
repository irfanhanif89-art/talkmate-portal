# Rep Close & Onboard Flow Rework

**Date:** 2026-05-28
**Status:** Approved, ready to build
**Author:** Claude (Opus 4.7) with Irfan

## Problem

A sales rep on a phone call hits a roadblock the moment they want to close a deal:

1. The only "close" action is **Mark Won**, which immediately submits for admin approval.
2. After Mark Won, the rep has to wait for admin to manually flip `approval_status='approved'` before the lead appears in their **Onboard Client** tab.
3. The post-Mark-Won "Email payment link" button on the confirmation screen hard-fails (400) if the lead has no `email` column populated — which is the case for every lead imported via CSV that didn't carry an email.
4. Once admin approves, the rep is then expected to fill a 9-field business config form (ABN, address, industry, etc.) — back-office work that does not belong on a sales call.

Net effect: the rep cannot complete an onboarding while still on the phone with the customer.

## Target Flow

### Rep, on the phone with prospect

1. Opens the lead in their pipeline.
2. Clicks **"Close & onboard"** (single button — replaces both Mark Won and the post-Mark-Won "Email payment link" steps).
3. Single modal opens with these fields, pre-filled from whatever's on the lead:
   - Business name (required, editable)
   - Contact name (required)
   - Customer email (required — this unblocks every CSV-imported lead)
   - Customer phone (required)
   - Plan (Starter / Growth / Pro)
   - Billing (Monthly / Annual)
   - Live commission breakdown (unchanged from today)
4. Clicks **"Send payment link & close"**. One atomic server call:
   - Updates lead with captured contact details
   - Flips `status='won'`, `approval_status='pending'`
   - Creates pending commission row
   - Creates Stripe Checkout session (per-lead, `client_reference_id=lead.id`)
   - Emails customer from `hello@talkmate.com.au` with rep on reply-to
   - Notifies admin (Telegram + internal email)
5. Modal shows brief success state: "Payment link emailed to X. Deal is now in admin's hands." → close → back to pipeline.

No second click required. Rep is done.

### Admin, post-close

1. Deal lands in the existing **`/admin/onboarding-queue`** page.
2. Card shows a payment-status badge:
   - 🟡 **Payment link sent** — Stripe session created, customer hasn't paid yet
   - 🟢 **Paid — ready for full onboarding** — `payment_confirmed_at` set by Stripe webhook
3. Admin clicks the existing **"Create from lead"** action and fills the nitty-gritty (ABN, address, industry, owner first/last name, contact preference, etc.).
4. Admin then reviews the agent at `/admin/approve`, calls the preview number, clicks **"Approve & Go Live"**.
5. That **"Approve & Go Live"** click is now the single moment that approves the rep's commission (in addition to provisioning Twilio + welcome email).

## Commission Lifecycle Changes

| Event | Today | New |
|-------|-------|-----|
| Rep closes deal | Commission `pending` | Same (via Close & Onboard) |
| Customer pays Stripe | Webhook auto-flips to `approved` | Webhook only stamps `payment_confirmed_at` and pings admin Telegram. Commission stays `pending`. |
| Admin "Approve" on `/admin/sales-team` | Flips `approval_status='approved'` AND commission `approved` | Still works as admin override. No longer the primary trigger. |
| Admin "Approve & Go Live" on `/admin/approve` | Provisions Twilio + welcome email only | Same PLUS approves the matching commission row (subject to 14-day clawback gate). |

14-day clawback gate is mirrored on the go-live path — if go-live fires before clawback window ends, commission update returns a soft warning and Twilio still provisions (don't block client activation on a commission timing issue).

## What Gets Deleted

| Surface | Action |
|---------|--------|
| `src/app/sales/onboard/page.tsx` | **Deleted** |
| `src/app/api/sales/onboard/route.ts` | **Deleted** |
| `src/components/sales/onboard-form.tsx` | **Deleted** |
| "Onboard Client" nav link in `src/components/sales/sales-nav.tsx` | **Removed** |
| `src/components/sales/won-modal.tsx` | **Deleted** (replaced by `close-and-onboard-modal.tsx`) |
| `src/components/sales/WonConfirmationScreen.tsx` | **Deleted** (its useful bits — payment-link UX, welcome script, commission breakdown — fold into the new modal's success state) |

## What Gets Added / Modified

| Surface | Action |
|---------|--------|
| `src/app/api/sales/leads/[id]/close-and-onboard/route.ts` | **New.** Atomic close + payment link + admin notify. |
| `src/components/sales/close-and-onboard-modal.tsx` | **New.** Form + plan picker + commission breakdown + success state. |
| `src/components/sales/lead-drawer.tsx` | **Modified.** Replace Mark Won button + WonModal wiring with Close & Onboard. |
| `src/app/api/webhooks/stripe/route.ts` | **Modified.** Back out auto-approval of commission on `checkout.session.completed`. Still stamp `payment_confirmed_at` + Telegram admin. |
| `src/app/api/admin/approve-agent/route.ts` | **Modified.** Also approve the matching commission row (gated by clawback). |
| `src/components/admin/OnboardingQueueClient.tsx` | **Modified.** Add payment-status badge per card (link-sent vs paid). |

## Edge Cases & Guards

- **Lead missing email when rep opens modal** → modal collects it inline. Whole point of the redesign.
- **Customer never pays** → admin can manually approve commission via existing `/admin/sales-team` override path. Their call.
- **Rep tries to close same lead twice** → 409 (existing `status='won'` guard).
- **Stripe email send fails** → Stripe session is still persisted on lead. Modal surfaces a warning so rep knows admin will need to follow up. (Mirrors today's `email_send_error` field.)
- **Twilio provisioning fails at "Approve & Go Live"** → commission stays `pending`. Admin retries the full go-live action.
- **Rep moves deal to Lost or Bad before admin onboards** → existing lost/bad-lead flows already revoke the pending commission. No change.
- **Clawback period (14 days) hasn't ended by the time admin clicks "Approve & Go Live"** → commission stays `pending` with a soft warning in the response; Twilio still provisions. Admin can re-trigger commission approval later.

## Database Changes

**None mandatory.** All required columns already exist on `leads`: `business_name`, `contact_name`, `email`, `phone`, `won_plan`, `won_billing_cycle`, `payment_confirmed_at`, `approval_status`, `stripe_payment_link`, `stripe_payment_link_created_at`.

## Out of Scope (Explicitly)

- New "ops" user role — admin is the sole owner of post-close onboarding.
- Auto-go-live triggered by payment (admin still reviews + clicks).
- Refund / clawback automation — existing manual paths are fine.
- Changes to `/admin/sales-team` approval modal — kept as an override path.
- Lead drawer redesign beyond the button swap.
