-- Migration 082: RLS security hardening v2 (Security Session, 2026-06-11)
--
-- Trigger: Supabase security advisor email (08 Jun 2026) flagged rls_disabled_in_public.
-- Migrations 053-056 already did the bulk RLS hardening; a live audit on 2026-06-11
-- found only TWO public tables still RLS-disabled, plus a small set of related
-- advisor findings worth closing in the same pass.
--
-- This migration is existence-guarded throughout because prod and preview have
-- drifted: demo_tts exists on PROD only, webhook_debug + increment_sms_used exist
-- on PREVIEW only. The same file therefore runs cleanly on both projects.
--
-- service_role bypasses RLS, so every admin/cron/server-route path is unaffected.
-- None of the targeted tables are read by any anon/authenticated app code (verified
-- 2026-06-11: zero references in the portal or website source).
--
-- Pre-check (run before applying, expect demo_tts on prod / webhook_debug on preview):
--   SELECT t.tablename,
--          CASE WHEN c.relrowsecurity THEN 'ENABLED' ELSE 'DISABLED' END AS rls
--   FROM pg_tables t JOIN pg_class c ON c.relname=t.tablename
--   JOIN pg_namespace n ON n.oid=c.relnamespace AND n.nspname=t.schemaname
--   WHERE t.schemaname='public' AND NOT c.relrowsecurity;

-- ----------------------------------------------------------------------
-- Part A: service-role-only RLS on the remaining flagged tables.
--   demo_tts        (PROD)    -- demo TTS audio cache, no client_id, no readers
--   webhook_debug   (PREVIEW) -- raw webhook debug log (re-asserts the 053/055 posture)
--   rate_limit_log  (BOTH)    -- RLS was enabled with no policy; make intent explicit
-- Reuses the exact restrictive "service_role_only" pattern from migration 054.
-- ----------------------------------------------------------------------
DO $$
DECLARE
  tbl  text;
  tables text[] := ARRAY['demo_tts', 'webhook_debug', 'rate_limit_log'];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    IF EXISTS (
      SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = tbl
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
      EXECUTE format('DROP POLICY IF EXISTS "service_role_only" ON public.%I', tbl);
      EXECUTE format(
        'CREATE POLICY "service_role_only" ON public.%I '
        'AS RESTRICTIVE FOR ALL TO anon, authenticated '
        'USING (false) WITH CHECK (false)',
        tbl
      );
    END IF;
  END LOOP;
END $$;

-- ----------------------------------------------------------------------
-- Part B: revoke EXECUTE from PUBLIC/anon/authenticated on data-mutating
-- SECURITY DEFINER functions that are reachable over PostgREST (/rest/v1/rpc).
--
--   app_purge_business / app_purge_sales_rep -- DELETE account data; called only by
--       the account-purge cron via the service-role admin client.
--   kb_entries_mark_pending -- trigger helper; triggers run regardless of EXECUTE grant.
--   increment_sms_used -- SMS counter; called only via createAdminClient() in sms.ts.
--
-- These are NOT the RLS-helper functions (current_rep_id / get_current_client_id /
-- is_super_admin). Those were deliberately left anon-executable in migration 054 and
-- then moved to the private schema in 056 -- DO NOT touch them here.
-- service_role keeps EXECUTE (separate explicit grant), so all server paths still work.
-- ----------------------------------------------------------------------
DO $$
DECLARE
  fn   text;
  fns  text[] := ARRAY[
    'public.app_purge_business(uuid)',
    'public.app_purge_sales_rep(uuid)',
    'public.kb_entries_mark_pending()',
    'public.increment_sms_used(uuid)'
  ];
BEGIN
  FOREACH fn IN ARRAY fns LOOP
    IF to_regprocedure(fn) IS NOT NULL THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
    END IF;
  END LOOP;
END $$;

-- ----------------------------------------------------------------------
-- Part C: pin search_path on the two remaining flagged functions (matches the
-- migration 054 approach). Guarded so it is a no-op where the function is absent
-- (increment_sms_used exists on PREVIEW only). Safe: both reference only public
-- objects. Closes the function_search_path_mutable WARN.
-- ----------------------------------------------------------------------
DO $$
DECLARE
  fn   text;
  fns  text[] := ARRAY[
    'public.bookings_status_stamp()',
    'public.increment_sms_used(uuid)'
  ];
BEGIN
  FOREACH fn IN ARRAY fns LOOP
    IF to_regprocedure(fn) IS NOT NULL THEN
      EXECUTE format('ALTER FUNCTION %s SET search_path = public', fn);
    END IF;
  END LOOP;
END $$;

-- ----------------------------------------------------------------------
-- Post-check (run after applying, expect 0 rows on both projects):
--   SELECT t.tablename FROM pg_tables t JOIN pg_class c ON c.relname=t.tablename
--   JOIN pg_namespace n ON n.oid=c.relnamespace AND n.nspname=t.schemaname
--   WHERE t.schemaname='public' AND NOT c.relrowsecurity;
-- Then re-run get_advisors(security) -- rls_disabled_in_public must be gone.
-- ----------------------------------------------------------------------

-- ======================================================================
-- ROLLBACK (commented -- only if a legitimate anon/authenticated reader is found):
--
-- DO $$
-- DECLARE tbl text; tables text[] := ARRAY['demo_tts','webhook_debug','rate_limit_log'];
-- BEGIN
--   FOREACH tbl IN ARRAY tables LOOP
--     IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename=tbl) THEN
--       EXECUTE format('DROP POLICY IF EXISTS "service_role_only" ON public.%I', tbl);
--       EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', tbl);
--     END IF;
--   END LOOP;
-- END $$;
-- -- Re-grant only if a function caller breaks (it should not):
-- -- GRANT EXECUTE ON FUNCTION public.increment_sms_used(uuid) TO authenticated;
-- ======================================================================
