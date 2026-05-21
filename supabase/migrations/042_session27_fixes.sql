-- Session 27 — Revenue-critical fixes.
--
-- Five database changes from the system audit. All statements idempotent.
--
--   1. businesses.signup_at — written by the self-serve signup route so
--      every downstream cron that filters on this column (abandoned-cart,
--      onboarding-incomplete, day-7, day-10, day-13, NPS) finally fires.
--      Column may already exist from earlier migrations; IF NOT EXISTS
--      keeps this safe.
--
--   2. businesses.welcome_email_sent — flipped to TRUE after the welcome
--      email lands via Resend. Likewise idempotent.
--
--   3. commissions.clawback_period_ends_at — the rep-side commissions
--      table never had the 14-day clawback timestamp the contractor flow
--      already enforces. Adds the column + backfills every existing row
--      to created_at + 14 days. App-side gate lives in
--      /api/admin/commissions/[id]/route.ts.
--
--   4. sms_log_sms_type_check — extend the CHECK constraint to allow
--      'callback_confirmation' and 'dispatcher_callback_alert' (the two
--      types Session 22's schedule_callback handler sends). Without this
--      every such SMS bills via Twilio but fails to log to sms_log so
--      the admin failures view never sees them. Existing types preserved
--      verbatim from migration 032; we only ADD, never remove.
--
--   5. admin_sms_failures view — recreated with the full original SELECT
--      (preserves the businesses join) but the WHERE clause widens to
--      include 'rejected' rows so plan-quota refusals are visible to
--      admin alongside Twilio failures.

-- ────────────────────────────────────────────────────────────────────────
-- 1. businesses.signup_at
-- ────────────────────────────────────────────────────────────────────────

alter table businesses
  add column if not exists signup_at timestamptz;

-- Backfill any self-serve row that doesn't have signup_at yet. Use
-- created_at as the best-available approximation for pre-Session-27 rows.
update businesses
   set signup_at = created_at
 where signup_at is null
   and onboarded_by = 'self';

-- ────────────────────────────────────────────────────────────────────────
-- 2. businesses.welcome_email_sent
-- ────────────────────────────────────────────────────────────────────────

alter table businesses
  add column if not exists welcome_email_sent boolean default false;

-- ────────────────────────────────────────────────────────────────────────
-- 3. commissions.clawback_period_ends_at
-- ────────────────────────────────────────────────────────────────────────

alter table commissions
  add column if not exists clawback_period_ends_at timestamptz;

update commissions
   set clawback_period_ends_at = created_at + interval '14 days'
 where clawback_period_ends_at is null;

-- ────────────────────────────────────────────────────────────────────────
-- 4. sms_log_sms_type_check — extend to include callback types
-- ────────────────────────────────────────────────────────────────────────
-- Drop-and-recreate so the new constraint definition wins. Preserves the
-- full existing list from migration 032 plus the two Session 22 additions.

do $$
declare
  cname text;
begin
  select conname into cname
  from pg_constraint
  where conrelid = 'public.sms_log'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%sms_type%';
  if cname is not null then
    execute format('alter table sms_log drop constraint %I', cname);
  end if;
end$$;

alter table sms_log
  add constraint sms_log_sms_type_check
  check (sms_type in (
    'booking_confirmation', 'booking_reminder_24h', 'booking_reminder_2h',
    'booking_cancellation', 'waitlist_offer', 'waitlist_claimed',
    'waitlist_expired', 'callback_reminder', 'vip_missed_call',
    'call_intelligence_alert',
    'dropped_call_recovery', 'early_hangup_recovery', 'missed_lead_recovery',
    -- Session 27 (H16) — Session 22 callback flow.
    'callback_confirmation', 'dispatcher_callback_alert',
    'other'
  ));

-- ────────────────────────────────────────────────────────────────────────
-- 5. admin_sms_failures view — include rejected rows
-- ────────────────────────────────────────────────────────────────────────
-- Preserve every column + the businesses join from migration 033.
-- Widen WHERE so plan-quota refusals (status='rejected') show in admin UI.

create or replace view admin_sms_failures as
select
  sl.id,
  sl.client_id              as business_id,
  b.name                    as business_name,
  sl.to_phone               as recipient_phone,
  sl.message                as message_body,
  sl.sms_type,
  sl.status,
  sl.twilio_sid             as twilio_message_sid,
  sl.call_id,
  sl.error_message,
  sl.sent_at                as created_at
from sms_log sl
join businesses b on b.id = sl.client_id
where sl.status in ('failed', 'rejected')
order by sl.sent_at desc;
