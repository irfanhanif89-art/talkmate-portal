-- =====================================================================
-- Migration 051: Session 42 — lock the plan enum at the DB level.
--
-- Apply ONLY after migration 050 has cleared existing plan drift AND
-- the new code from feature/session-42-lifecycle-integrity is live on
-- production (Vercel deploy READY). Applying this before code is live
-- briefly causes old in-flight Stripe webhook handlers to fail with
-- CHECK violations on 'Professional'-nicknamed events (Stripe retries
-- would eventually succeed once the new code deploys, but cleaner to
-- avoid the window entirely).
--
-- Pre-apply check (run from psql or Supabase SQL editor):
--   SELECT DISTINCT plan FROM public.businesses;
--   SELECT DISTINCT plan FROM public.subscriptions;
-- Expected: only 'starter', 'growth', 'pro' (and possibly NULL).
-- If anything else appears, STOP and investigate before applying 051.
-- =====================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'businesses_plan_valid'
  ) THEN
    ALTER TABLE public.businesses
      ADD CONSTRAINT businesses_plan_valid CHECK (plan IN ('starter','growth','pro'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'subscriptions_plan_valid'
  ) THEN
    ALTER TABLE public.subscriptions
      ADD CONSTRAINT subscriptions_plan_valid CHECK (plan IN ('starter','growth','pro'));
  END IF;
END $$;
