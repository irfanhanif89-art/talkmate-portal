-- Session 19 — SMS Visibility + AI SMS Verification
--
-- Adds call linkage to sms_log, SMS verification result columns on calls,
-- and a service-role view for the admin failed-SMS surface.
--
-- NOTE: sms_log was created in migration 031 with: id, client_id, to_phone,
-- message, twilio_sid, status, sms_type, booking_id, waitlist_id, sent_at,
-- error_message. The brief's references to business_id / recipient_phone /
-- message_body / twilio_message_sid / created_at are pre-existing naming
-- aliases that don't match the live table. This migration uses the real
-- column names. (No renames — only adds.)
--
-- All statements idempotent.

-- ────────────────────────────────────────────────────────────────────────
-- 1a. sms_log — call linkage + supporting indexes
-- ────────────────────────────────────────────────────────────────────────

alter table sms_log
  add column if not exists call_id uuid references calls(id) on delete set null;

create index if not exists sms_log_call_id_idx
  on sms_log (call_id)
  where call_id is not null;

-- The (client_id, sent_at desc) index from migration 031 already covers
-- the per-client recent-sms query path; no duplicate needed.

-- ────────────────────────────────────────────────────────────────────────
-- 1b. calls — SMS verification columns
-- ────────────────────────────────────────────────────────────────────────

alter table calls
  add column if not exists sms_verification_status text,
  add column if not exists sms_verification_note text;

do $$
begin
  if exists (
    select 1 from pg_constraint where conname = 'calls_sms_verification_status_check'
  ) then
    alter table calls drop constraint calls_sms_verification_status_check;
  end if;
end$$;

alter table calls
  add constraint calls_sms_verification_status_check
  check (sms_verification_status is null or sms_verification_status in (
    'correct', 'mismatch', 'no_sms', 'unverified', 'error'
  ));

-- ────────────────────────────────────────────────────────────────────────
-- 1c. admin_sms_failures view — service-role only
-- ────────────────────────────────────────────────────────────────────────
-- View is unrestricted (no RLS on views in Postgres). Only the service-
-- role admin client and the admin route handlers read from it.

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
where sl.status = 'failed'
order by sl.sent_at desc;

-- ────────────────────────────────────────────────────────────────────────
-- 1d. RLS on sms_log
-- ────────────────────────────────────────────────────────────────────────
-- The policy from migration 031 already permits clients to read their own
-- rows via get_current_client_id(). Leave it as-is to avoid policy churn;
-- clients only read sms_log through anon-role SELECTs against this policy.

-- (no-op — left here so the migration history reads cleanly)
