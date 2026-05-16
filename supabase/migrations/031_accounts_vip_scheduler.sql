-- Migration 031: Accounts CRM + VIP bypass + native scheduler (Session 15).
--
-- Extends vip_callers with account/company fields, vip_bypass flag, and
-- linked phone numbers so trade accounts and bypass VIPs share the same
-- table. Extends bookings with scheduler metadata, SMS tracking flags,
-- and route info. Adds waitlist, public_holidays, sms_log tables.
--
-- All statements idempotent.
--
-- Naming notes:
--   * vip_callers already uses `active` (not `is_active`) — Session 15
--     brief mentioned both but the live table uses `active`. We keep it.
--   * bookings has an existing `caller_phone`, `caller_name`, `service`,
--     `date`, `time`, `notes`, `status`, `created_at`. We extend with the
--     new scheduler fields and never rename anything.
--   * scheduler_settings is from migration 030; we add `overridden_holidays`
--     and 2h-reminder preference there.

----------------------------------------------------------------------
-- 1a. vip_callers — accounts + bypass extensions
----------------------------------------------------------------------

alter table vip_callers
  add column if not exists account_type text default 'vip'
    check (account_type in ('account', 'vip')),
  add column if not exists company_name text,
  add column if not exists abn text,
  add column if not exists billing_contact_name text,
  add column if not exists billing_contact_email text,
  add column if not exists linked_numbers jsonb default '[]'::jsonb,
  add column if not exists vip_bypass boolean default false;

-- GIN over linked_numbers so check_caller can match an inbound phone
-- against any linked number quickly.
create index if not exists idx_vip_callers_linked_numbers_gin
  on vip_callers using gin (linked_numbers);

create index if not exists idx_vip_callers_account_type
  on vip_callers(client_id, account_type, active);

----------------------------------------------------------------------
-- 1b. bookings — scheduler extensions
----------------------------------------------------------------------

alter table bookings
  add column if not exists description text,
  add column if not exists pickup_address text,
  add column if not exists pickup_contact_name text,
  add column if not exists pickup_contact_phone text,
  add column if not exists dropoff_address text,
  add column if not exists dropoff_contact_name text,
  add column if not exists dropoff_contact_phone text,
  add column if not exists pickup_lat double precision,
  add column if not exists pickup_lng double precision,
  add column if not exists dropoff_lat double precision,
  add column if not exists dropoff_lng double precision,
  add column if not exists distance_km numeric(8,2),
  add column if not exists duration_minutes integer,
  add column if not exists truck_type text,
  add column if not exists rate_type text check (rate_type in ('account', 'retail')),
  add column if not exists account_id uuid references vip_callers(id) on delete set null,
  add column if not exists driver_id uuid references drivers(id) on delete set null,
  add column if not exists booking_source text default 'manual'
    check (booking_source in ('agent', 'manual', 'google_calendar', 'walk_in')),
  add column if not exists estimated_value numeric(10,2),
  add column if not exists scheduled_start timestamptz,
  add column if not exists scheduled_end timestamptz,
  add column if not exists actual_start timestamptz,
  add column if not exists actual_end timestamptz,
  add column if not exists no_show boolean default false,
  add column if not exists sms_confirmation_sent boolean default false,
  add column if not exists sms_reminder_24h_sent boolean default false,
  add column if not exists sms_reminder_2h_sent boolean default false,
  add column if not exists cancellation_reason text,
  add column if not exists waitlist_position integer;

create index if not exists idx_bookings_client_scheduled
  on bookings(client_id, scheduled_start desc)
  where scheduled_start is not null;
create index if not exists idx_bookings_account
  on bookings(account_id) where account_id is not null;
create index if not exists idx_bookings_driver_scheduled
  on bookings(driver_id, scheduled_start) where driver_id is not null;
create index if not exists idx_bookings_reminder_pending
  on bookings(scheduled_start)
  where status in ('pending', 'confirmed') and scheduled_start is not null
    and (sms_reminder_24h_sent = false or sms_reminder_2h_sent = false);

----------------------------------------------------------------------
-- 1c. waitlist
----------------------------------------------------------------------

create table if not exists waitlist (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references businesses(id) on delete cascade,
  caller_phone text not null,
  caller_name text,
  requested_date date,
  requested_time_preference text,
  truck_type text,
  rate_type text,
  pickup_address text,
  dropoff_address text,
  description text,
  position integer not null default 1,
  status text default 'waiting'
    check (status in ('waiting', 'offered', 'claimed', 'expired', 'cancelled')),
  offered_at timestamptz,
  offer_expires_at timestamptz,
  claimed_at timestamptz,
  booking_id uuid references bookings(id) on delete set null,
  call_id text references calls(vapi_call_id) on delete set null,
  created_at timestamptz default now()
);

create index if not exists waitlist_client_status_idx
  on waitlist(client_id, status, position);
create index if not exists waitlist_offer_expiry_idx
  on waitlist(offer_expires_at) where status = 'offered';

alter table waitlist enable row level security;

drop policy if exists "Client can manage own waitlist" on waitlist;
create policy "Client can manage own waitlist" on waitlist
  for all using (client_id = get_current_client_id());

----------------------------------------------------------------------
-- 1d. public_holidays — shared reference table (no RLS).
--     Sourced from data.gov.au; one row per (state, holiday_date).
--     National holidays fan out into one row per state on sync so the
--     scheduler can query a single state cleanly.
----------------------------------------------------------------------

create table if not exists public_holidays (
  id uuid primary key default gen_random_uuid(),
  state text not null,
  holiday_name text not null,
  holiday_date date not null,
  year integer not null,
  is_national boolean default false,
  created_at timestamptz default now(),
  unique(state, holiday_date)
);

create index if not exists public_holidays_state_year_idx
  on public_holidays(state, year);
create index if not exists public_holidays_state_date_idx
  on public_holidays(state, holiday_date);

----------------------------------------------------------------------
-- 1e. sms_log — every SMS sent through src/lib/sms.ts
----------------------------------------------------------------------

create table if not exists sms_log (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references businesses(id) on delete cascade,
  to_phone text not null,
  message text not null,
  twilio_sid text,
  status text default 'sent',
  sms_type text check (sms_type in (
    'booking_confirmation', 'booking_reminder_24h', 'booking_reminder_2h',
    'booking_cancellation', 'waitlist_offer', 'waitlist_claimed',
    'waitlist_expired', 'callback_reminder', 'vip_missed_call', 'other'
  )),
  booking_id uuid references bookings(id) on delete set null,
  waitlist_id uuid references waitlist(id) on delete set null,
  sent_at timestamptz default now(),
  error_message text
);

create index if not exists sms_log_client_sent_idx
  on sms_log(client_id, sent_at desc);
create index if not exists sms_log_booking_idx
  on sms_log(booking_id) where booking_id is not null;

alter table sms_log enable row level security;

drop policy if exists "Client can view own sms log" on sms_log;
create policy "Client can view own sms log" on sms_log
  for all using (client_id = get_current_client_id());

----------------------------------------------------------------------
-- 1f. businesses — monthly SMS counter
----------------------------------------------------------------------

alter table businesses
  add column if not exists sms_used_this_month integer default 0,
  add column if not exists sms_reset_at timestamptz default date_trunc('month', now());

----------------------------------------------------------------------
-- 1g. scheduler_settings — Session 15 additions on the Session 14 table
----------------------------------------------------------------------

alter table scheduler_settings
  add column if not exists default_duration_tilt_minutes integer default 120,
  add column if not exists default_duration_sideloader_minutes integer default 180,
  add column if not exists default_duration_minutes integer default 60,
  add column if not exists reminder_24h_enabled boolean default true,
  add column if not exists reminder_2h_enabled boolean default true,
  add column if not exists waitlist_auto_notify boolean default true,
  add column if not exists waitlist_claim_window_minutes integer default 30,
  add column if not exists cancellation_policy_enabled boolean default false,
  add column if not exists cancellation_notice_hours integer default 24,
  add column if not exists cancellation_fee_aud numeric(10,2) default 0,
  add column if not exists overridden_holidays jsonb default '[]'::jsonb;
