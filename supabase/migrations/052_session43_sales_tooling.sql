-- =====================================================================
-- Migration 052: Session 43 — sales tooling.
--
-- Three concerns in one additive migration:
--   1. leads payment-link tracking (Payment Link feature)
--   2. admin_settings table (Sales Pipeline sprint config + future
--      cross-cutting admin settings)
--   3. lead_activities CHECK constraint extended with 'reassign' type
--      (Deal Reassignment audit trail)
--
-- Apply order: safe pre-deploy. All changes additive — no behaviour
-- change for existing code paths.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. leads payment-link tracking
-- ---------------------------------------------------------------------
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS stripe_payment_link text,
  ADD COLUMN IF NOT EXISTS stripe_payment_link_created_at timestamptz,
  ADD COLUMN IF NOT EXISTS payment_confirmed_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_leads_payment_confirmed
  ON public.leads(payment_confirmed_at)
  WHERE payment_confirmed_at IS NOT NULL;

-- ---------------------------------------------------------------------
-- 2. admin_settings — generic key/value store for cross-cutting
--    admin-only settings. Service-role-only via RLS bypass.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_settings (
  key         text PRIMARY KEY,
  value       text NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.admin_settings ENABLE ROW LEVEL SECURITY;
-- No policies = service-role-only access via createAdminClient bypass.

-- Seed Session 43 defaults — current month AEST as sprint window,
-- $26K MRR target. Idempotent: ON CONFLICT DO NOTHING preserves any
-- value an admin may have set before re-running.
INSERT INTO public.admin_settings (key, value)
SELECT 'sales_sprint_start',
       to_char(date_trunc('month', now() AT TIME ZONE 'Australia/Brisbane'), 'YYYY-MM-DD')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.admin_settings (key, value)
SELECT 'sales_sprint_end',
       to_char((date_trunc('month', now() AT TIME ZONE 'Australia/Brisbane') + interval '1 month' - interval '1 day')::date, 'YYYY-MM-DD')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.admin_settings (key, value)
VALUES ('sales_mrr_target', '26000')
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------
-- 3. lead_activities — extend CHECK to allow 'reassign' type.
--    Idempotent — drops and re-adds the constraint each time.
-- ---------------------------------------------------------------------
DO $$
BEGIN
  ALTER TABLE public.lead_activities
    DROP CONSTRAINT IF EXISTS lead_activities_activity_type_check;
  ALTER TABLE public.lead_activities
    ADD CONSTRAINT lead_activities_activity_type_check
    CHECK (activity_type IN (
      'note','call','email','demo','proposal',
      'status_change','system','approval','reassign'
    ));
END $$;
