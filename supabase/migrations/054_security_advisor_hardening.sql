-- Clear the remaining Supabase advisor findings flagged on 2026-05-28
-- after the critical rls_disabled_in_public issues were fixed in
-- migration 053.
--
-- Scope:
--   1. ERROR: admin_sms_failures view defined with SECURITY DEFINER
--   2. WARN x7: functions with mutable search_path
--   3. INFO x8: tables with RLS enabled but no policies (purely cosmetic --
--      these are already deny-all for anon/authenticated; we just make
--      the intent explicit so the linter stops nagging)
--   4. WARN x3 (documented, not changed): SECURITY DEFINER RPC-callable
--      RLS helper functions. Used inside RLS policies, so anon/authenticated
--      MUST keep EXECUTE. They return only the caller's own identity
--      context (rep_id / client_id / admin status), so direct RPC is not
--      a privilege escalation. Documented via COMMENT to mark intent.
--
-- Not addressed in SQL (requires Supabase Dashboard / Management API):
--   - auth_leaked_password_protection: enable HaveIBeenPwned check in
--     Authentication settings.

-- ----------------------------------------------------------------------
-- 1. Pin search_path on every function the linter flagged.
-- ----------------------------------------------------------------------
ALTER FUNCTION public.get_current_client_id()                SET search_path = public;
ALTER FUNCTION public.enforce_single_active_script()         SET search_path = public;
ALTER FUNCTION public.update_sales_updated_at()              SET search_path = public;
ALTER FUNCTION public.scheduler_settings_touch_updated_at()  SET search_path = public;
ALTER FUNCTION public.update_updated_at_column()             SET search_path = public;
ALTER FUNCTION public.update_dispatch_updated_at()           SET search_path = public;
ALTER FUNCTION public.generate_dispatch_job_number()         SET search_path = public;

-- ----------------------------------------------------------------------
-- 2. Recreate admin_sms_failures as SECURITY INVOKER.
--    Admin pages call this with the service-role admin client (which
--    bypasses RLS anyway), so security_invoker is safe and removes the
--    SECURITY DEFINER footgun.
-- ----------------------------------------------------------------------
DROP VIEW IF EXISTS public.admin_sms_failures;

CREATE VIEW public.admin_sms_failures
WITH (security_invoker = true) AS
SELECT
    sl.id,
    sl.client_id        AS business_id,
    b.name              AS business_name,
    sl.to_phone         AS recipient_phone,
    sl.message          AS message_body,
    sl.sms_type,
    sl.status,
    sl.twilio_sid       AS twilio_message_sid,
    sl.call_id,
    sl.error_message,
    sl.sent_at          AS created_at
FROM sms_log sl
JOIN businesses b ON b.id = sl.client_id
WHERE sl.status = ANY (ARRAY['failed'::text, 'rejected'::text])
ORDER BY sl.sent_at DESC;

-- ----------------------------------------------------------------------
-- 3. Explicit deny-all policy for anon + authenticated on the 8 tables
--    that already had RLS enabled with no policy. All real access goes
--    through createAdminClient() which uses the service_role JWT and
--    bypasses RLS, so this changes nothing functionally -- it just
--    makes the existing "deny everyone except service_role" posture
--    explicit so the advisor stops listing them.
-- ----------------------------------------------------------------------
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'admin_audit_log',
    'admin_settings',
    'contractor_agreements',
    'contractor_commissions',
    'contractors',
    'sales_scripts',
    'script_acknowledgements',
    'stripe_webhook_events'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS "service_role_only" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "service_role_only" ON public.%I AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)',
      t
    );
  END LOOP;
END $$;

-- ----------------------------------------------------------------------
-- 4. Document the 3 SECURITY DEFINER RLS-helper functions as intentional.
--    These are referenced inside RLS policies; revoking EXECUTE from
--    anon/authenticated would break those policies. Direct RPC exposure
--    is acceptable because each function only returns the caller's own
--    identity context.
-- ----------------------------------------------------------------------
COMMENT ON FUNCTION public.current_rep_id() IS
  'RLS helper: returns auth.uid()''s sales_reps.id. Intentionally callable '
  'by anon/authenticated because RLS policies reference it; direct RPC '
  'returns only data the caller already implicitly has.';

COMMENT ON FUNCTION public.get_current_client_id() IS
  'RLS helper: returns auth.uid()''s businesses.id. Intentionally callable '
  'by anon/authenticated because RLS policies reference it.';

COMMENT ON FUNCTION public.is_super_admin() IS
  'RLS helper: returns true if auth.uid()''s email is on the super-admin '
  'allowlist. Intentionally callable by anon/authenticated because RLS '
  'policies reference it; users can already infer this from their own UI.';
