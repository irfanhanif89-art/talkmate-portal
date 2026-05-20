-- Session 20 hotfix — sms_used_this_month counter not incrementing.
--
-- Symptom: GM Towing had an sms_log row with sms_type='other', status='sent'
-- sent 2026-05-16, but businesses.sms_used_this_month stayed at 0. The
-- read-then-update pattern in /lib/sms.ts swallowed the .update() error
-- silently, so any failure (RLS, null in source row, race) left the
-- counter unchanged.
--
-- Fix:
-- 1. Postgres RPC for atomic increment that COALESCEs null → 0. /lib/sms.ts
--    will rpc('increment_sms_used', { p_client_id }) instead of the
--    read-then-update pair.
-- 2. Backfill sms_used_this_month for every business from sms_log,
--    counting only successful sends of non-bypass types since the last
--    monthly reset.
-- 3. Backfill sms_reset_at where null — set to the start of the current
--    month so the next ensureMonthlyReset() call doesn't double-reset.
--
-- Idempotent throughout.

-- ────────────────────────────────────────────────────────────────────────
-- 1. RPC: atomic counter increment with null self-healing.
-- ────────────────────────────────────────────────────────────────────────

create or replace function increment_sms_used(p_client_id uuid)
returns integer
language plpgsql
security definer
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

-- Restrict to service-role callers. Anon users must never increment.
revoke all on function increment_sms_used(uuid) from public;
grant execute on function increment_sms_used(uuid) to service_role;

-- ────────────────────────────────────────────────────────────────────────
-- 2. Backfill sms_reset_at where null. Without a reset timestamp, the
--    ensureMonthlyReset() helper in /lib/sms.ts treats the counter as
--    epoch-zero and resets it on every send.
-- ────────────────────────────────────────────────────────────────────────

update businesses
set sms_reset_at = date_trunc('month', now())
where sms_reset_at is null;

-- ────────────────────────────────────────────────────────────────────────
-- 3. Backfill sms_used_this_month from sms_log. Only successful sends
--    (status='sent') of non-bypass types count. Bypass types
--    (intelligence alerts, recovery SMS) are explicitly excluded — they
--    never increment the counter by design.
-- ────────────────────────────────────────────────────────────────────────

update businesses b
set sms_used_this_month = sub.cnt
from (
  select
    sl.client_id,
    count(*)::integer as cnt
  from sms_log sl
  join businesses bb on bb.id = sl.client_id
  where sl.status = 'sent'
    and sl.sms_type not in (
      'call_intelligence_alert',
      'dropped_call_recovery',
      'early_hangup_recovery',
      'missed_lead_recovery'
    )
    and sl.sent_at >= coalesce(bb.sms_reset_at, date_trunc('month', now()))
  group by sl.client_id
) sub
where b.id = sub.client_id;

-- Businesses with no qualifying sends since their reset point should be
-- left at 0 (the column default). Don't overwrite — leave them as-is.
