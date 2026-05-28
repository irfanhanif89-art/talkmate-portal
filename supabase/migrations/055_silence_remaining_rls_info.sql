-- Silence the last two RLS-no-policy INFO findings from migration 053
-- (webhook_debug, client_golive_checklist) by making the existing
-- "service-role only" posture explicit, matching migration 054's pattern.
DO $$
DECLARE
  t text;
  tables text[] := ARRAY['webhook_debug', 'client_golive_checklist'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS "service_role_only" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "service_role_only" ON public.%I AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)',
      t
    );
  END LOOP;
END $$;
