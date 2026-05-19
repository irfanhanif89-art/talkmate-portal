-- Session 18 — Call Intelligence
-- Adds AI-scored quality columns to calls, a scoring-attempt log,
-- per-business alert routing config, and extends sms_log.sms_type to
-- cover intelligence and recovery sends.
--
-- All statements are idempotent so the migration can be re-run safely.

-- ────────────────────────────────────────────────────────────────────────
-- 1a. calls — intelligence result columns
-- ────────────────────────────────────────────────────────────────────────

alter table calls
  add column if not exists intelligence_score integer,
  add column if not exists intelligence_status text,
  add column if not exists intelligence_summary text,
  add column if not exists intelligence_flags jsonb default '[]'::jsonb,
  add column if not exists intelligence_actions jsonb default '[]'::jsonb,
  add column if not exists intelligence_scored_at timestamptz,
  add column if not exists owner_alerted boolean default false,
  add column if not exists alert_reason text;

-- Status check constraint — drop+recreate so re-runs don't fail if the
-- constraint already exists with a different name.
do $$
begin
  if exists (
    select 1 from pg_constraint where conname = 'calls_intelligence_status_check'
  ) then
    alter table calls drop constraint calls_intelligence_status_check;
  end if;
end$$;

alter table calls
  add constraint calls_intelligence_status_check
  check (intelligence_status is null or intelligence_status in (
    'resolved', 'review', 'critical', 'pending', 'error'
  ));

-- Partial index for the cron retry sweep — only pending/error rows.
create index if not exists calls_intelligence_retry_idx
  on calls (created_at desc)
  where intelligence_status in ('pending', 'error');

-- Index for the calls page Flagged filter.
create index if not exists calls_intelligence_status_business_idx
  on calls (business_id, intelligence_status, created_at desc);

-- ────────────────────────────────────────────────────────────────────────
-- 1b. call_intelligence_log — scoring attempts + retries
-- ────────────────────────────────────────────────────────────────────────

create table if not exists call_intelligence_log (
  id uuid primary key default gen_random_uuid(),
  call_id text not null,
  client_id uuid not null references businesses(id) on delete cascade,
  attempt integer default 1,
  model text default 'claude-sonnet-4-6',
  prompt_tokens integer,
  completion_tokens integer,
  status text default 'success' check (status in ('success', 'failed', 'skipped')),
  error_message text,
  scored_at timestamptz default now()
);

create index if not exists call_intelligence_log_call_idx
  on call_intelligence_log (call_id, scored_at desc);
create index if not exists call_intelligence_log_client_idx
  on call_intelligence_log (client_id, scored_at desc);

alter table call_intelligence_log enable row level security;

drop policy if exists "Client can view own intelligence log" on call_intelligence_log;
create policy "Client can view own intelligence log" on call_intelligence_log
  for select using (client_id = get_current_client_id());

-- ────────────────────────────────────────────────────────────────────────
-- 1c. businesses — per-client alert routing config
-- ────────────────────────────────────────────────────────────────────────

alter table businesses
  add column if not exists intelligence_alert_config jsonb default '{}'::jsonb;

-- ────────────────────────────────────────────────────────────────────────
-- 1d. sms_log — extend sms_type check to cover intelligence + recovery
-- ────────────────────────────────────────────────────────────────────────
-- Drop + recreate the check constraint with the expanded enum. Migration
-- 031 created it without a name so we look up the conname.

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
    'other'
  ));
