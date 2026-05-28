-- Fix critical Supabase advisor errors: rls_disabled_in_public on 3 tables.
-- Email received 2026-05-28 flagged these as publicly accessible via PostgREST.
--
-- Strategy: enable RLS on all three. service_role bypasses RLS so all admin /
-- cron / server-route access is unaffected. Add the minimum policy needed to
-- preserve the one authenticated-user read path (portal reading public_holidays).

-- 1. webhook_debug -- debug table, service-role writes only, no code reads it
ALTER TABLE public.webhook_debug ENABLE ROW LEVEL SECURITY;

-- 2. client_golive_checklist -- all reads/writes go via service-role admin client
ALTER TABLE public.client_golive_checklist ENABLE ROW LEVEL SECURITY;

-- 3. public_holidays -- read-only reference data; portal users need SELECT
ALTER TABLE public.public_holidays ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_holidays_select_authenticated"
  ON public.public_holidays
  FOR SELECT
  TO authenticated
  USING (true);
