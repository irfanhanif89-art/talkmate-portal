-- =====================================================================
-- Migration 050: Session 42 — additive schema for H8 + H10 + idempotency.
--
-- This migration is intentionally additive only. It adds new columns,
-- a new table, indexes, the UUID backfill, and the plan-data
-- normalisation UPDATEs. It does NOT add the plan CHECK constraint
-- (deferred to migration 051) because the CHECK must apply AFTER the
-- new code is live — otherwise old in-flight Stripe webhook code paths
-- could briefly write CHECK-violating rows during the deploy window.
--
-- Apply order:
--   1. 050 → before code deploy (safe: additive, doesn't block any writes)
--   2. Code deploy
--   3. 051 → after Vercel READY confirmed (adds the CHECK constraints)
--
-- Pre-deploy snapshot from production (2026-05-26):
--   businesses: starter=5, growth=3, premium=1 (Hume Towing, cancelled
--               test row labelled cus_test_donna_screenshot),
--               professional=1 (Rapid Plumbing & Gas, cancelled).
--   subscriptions: growth=2, professional=1 (Rapid Plumbing), starter=1.
--
-- Hume Towing's linked subscription row is `starter`, so we map 'premium'
-- to 'starter'. Rapid Plumbing is mapped 'professional' to 'pro' (the
-- canonical enum). Both rows are cancelled non-paying customers; no
-- billing impact from the normalisation.
-- =====================================================================

-- ---------------------------------------------------------------------
-- H8: Vapi phoneNumber tracking + unassign state on businesses
-- ---------------------------------------------------------------------
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS vapi_phone_number_id text,
  ADD COLUMN IF NOT EXISTS vapi_phone_unassigned_at timestamptz,
  ADD COLUMN IF NOT EXISTS vapi_phone_unassigned_reason text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'businesses_vapi_phone_unassigned_reason_chk'
  ) THEN
    ALTER TABLE public.businesses
      ADD CONSTRAINT businesses_vapi_phone_unassigned_reason_chk
      CHECK (vapi_phone_unassigned_reason IS NULL
             OR vapi_phone_unassigned_reason IN ('cancelled','expired','suspended','manual'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_businesses_vapi_phone_unassigned
  ON public.businesses(vapi_phone_unassigned_at)
  WHERE vapi_phone_unassigned_at IS NOT NULL;

-- ---------------------------------------------------------------------
-- Stripe webhook idempotency
-- Prevents Stripe retries from double-firing handlers. Wraps every case
-- in the webhook switch, not just the new H8/H10 ones.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  event_id     text PRIMARY KEY,
  event_type   text NOT NULL,
  received_at  timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_type
  ON public.stripe_webhook_events(event_type, received_at DESC);

ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;
-- No policies = service-role-only access via createAdminClient bypass.

-- ---------------------------------------------------------------------
-- H10: normalise existing drifted plan rows BEFORE adding CHECK
-- ---------------------------------------------------------------------
DO $$
DECLARE
  biz_prof int;
  biz_prem int;
  sub_prof int;
BEGIN
  SELECT count(*) INTO biz_prof FROM public.businesses    WHERE plan = 'professional';
  SELECT count(*) INTO biz_prem FROM public.businesses    WHERE plan = 'premium';
  SELECT count(*) INTO sub_prof FROM public.subscriptions WHERE plan = 'professional';
  RAISE NOTICE 'Plan drift backfill: businesses professional=%, premium=%; subscriptions professional=%',
    biz_prof, biz_prem, sub_prof;
END $$;

UPDATE public.businesses    SET plan = 'pro'     WHERE plan = 'professional';
UPDATE public.businesses    SET plan = 'starter' WHERE plan = 'premium';
UPDATE public.subscriptions SET plan = 'pro'     WHERE plan = 'professional';

-- CHECK constraints intentionally NOT added here — see migration 051.

-- ---------------------------------------------------------------------
-- One-time backfill of vapi_phone_number_id for GM Towing + Spectrum
-- Towing. UUIDs captured 2026-05-26 from the Vapi API. Idempotent: only
-- writes if the column is currently NULL, so re-running the migration
-- never clobbers a future change.
-- ---------------------------------------------------------------------
UPDATE public.businesses
SET vapi_phone_number_id = 'd28934a0-4e5a-4040-b62d-36c9761263ee'
WHERE vapi_agent_id = '25443e10-2ff0-4a9c-a3f1-4cdbdead9715'
  AND vapi_phone_number_id IS NULL;

UPDATE public.businesses
SET vapi_phone_number_id = '0e856abc-ee2d-4cec-87da-ea96a5fab6ca'
WHERE vapi_agent_id = '8121a8b0-ae4d-43ed-a3a6-8285b858d5d9'
  AND vapi_phone_number_id IS NULL;
