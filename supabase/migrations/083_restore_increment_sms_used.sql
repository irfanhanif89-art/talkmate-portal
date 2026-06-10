-- Migration 083: restore increment_sms_used on production (2026-06-11)
--
-- The atomic SMS-counter RPC defined in migration 035 is ABSENT on PROD
-- (present on PREVIEW). sms.ts calls rpc('increment_sms_used', { p_client_id })
-- via createAdminClient() (service role) on every non-bypass send. With the
-- function missing on prod, the RPC errors (swallowed into a console.error),
-- businesses.sms_used_this_month never increments, and SMS plan limits are not
-- enforced. No migration drops it -- it was lost outside the migration history.
--
-- This restores it idempotently (create or replace) and adds:
--   - SET search_path = public  (closes the function_search_path_mutable WARN)
--   - service_role-only EXECUTE (revoke from public/anon/authenticated)
--
-- Impact to date is negligible (2 counter-eligible sends in 90 days, both live
-- clients at sms_used_this_month = 0), so NO backfill is performed. Going-forward
-- increments are restored.
--
-- Pre-check:  SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--             WHERE n.nspname='public' AND proname='increment_sms_used';  -- 0 rows on prod
-- Post-check: same query returns 1 row; proacl = service_role only; proconfig = search_path=public.

create or replace function public.increment_sms_used(p_client_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  new_value integer;
begin
  update businesses
  set sms_used_this_month = coalesce(sms_used_this_month, 0) + 1
  where id = p_client_id
  returning sms_used_this_month into new_value;

  -- If no row matched, return null so the caller can log a warning.
  return new_value;
end;
$$;

-- service-role only (sms.ts calls via createAdminClient()); never anon/authenticated.
revoke all on function public.increment_sms_used(uuid) from public, anon, authenticated;
grant execute on function public.increment_sms_used(uuid) to service_role;

-- ======================================================================
-- ROLLBACK (commented):
-- DROP FUNCTION IF EXISTS public.increment_sms_used(uuid);
-- ======================================================================
