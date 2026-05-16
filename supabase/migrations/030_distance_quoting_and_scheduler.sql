-- Migration 030: Distance quoting engine + scheduler foundation (Session 14).
--
-- Adds Google Maps-driven job quoting for towing/dispatch businesses and lays
-- the scheduler_settings table for the Session 15 booking work.
--
-- Surface area:
--   1. businesses.service_area_radius / service_area_mode / service_area_postcodes
--      drive the eligibility check inside /api/maps/distance. quote_config holds
--      validity window, after-hours surcharge, minimum-fee, and currency.
--   2. quotes table logs every quote the AI gives a caller. call_id references
--      calls.vapi_call_id (text) because Vapi only knows its own call id at the
--      time calculate_job_quote runs.
--   3. scheduler_settings is forward-looking — Session 15 wires the booking
--      engine on top of it. Created here so 030 can ship as a single migration.
--
-- All statements are idempotent. No data backfill needed; defaults are correct
-- for every existing tenant.

----------------------------------------------------------------------
-- 1. businesses — quoting config columns
----------------------------------------------------------------------

alter table businesses
  add column if not exists service_area_radius integer default 100,
  add column if not exists service_area_mode text default 'radius'
    check (service_area_mode in ('radius', 'postcodes')),
  add column if not exists service_area_postcodes jsonb default '[]'::jsonb,
  add column if not exists quote_config jsonb default '{}'::jsonb;

-- quote_config shape:
-- {
--   "enabled": true,
--   "quote_validity_minutes": 120,
--   "poa_threshold_km": 100,
--   "after_hours_surcharge_percent": 0,
--   "minimum_job_fee": 0,
--   "currency": "AUD"
-- }

----------------------------------------------------------------------
-- 2. quotes — every quote the AI agent has given.
--    call_id is text and references calls(vapi_call_id) so Vapi's own
--    call identifier can be written through directly. ON DELETE SET NULL
--    so a hard-deleted call row never cascades a quote away.
----------------------------------------------------------------------

create table if not exists quotes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references businesses(id) on delete cascade,
  call_id text references calls(vapi_call_id) on delete set null,
  caller_phone text,
  pickup_address text not null,
  dropoff_address text,
  pickup_lat double precision,
  pickup_lng double precision,
  dropoff_lat double precision,
  dropoff_lng double precision,
  distance_km numeric(8,2),
  duration_minutes integer,
  truck_type text,
  rate_type text check (rate_type in ('account', 'retail')),
  base_price numeric(10,2),
  addons jsonb default '[]'::jsonb,
  total_price numeric(10,2),
  is_poa boolean default false,
  quote_valid_until timestamptz,
  status text default 'given'
    check (status in ('given', 'accepted', 'declined', 'expired')),
  created_at timestamptz default now()
);

create index if not exists idx_quotes_client_created
  on quotes(client_id, created_at desc);
create index if not exists idx_quotes_client_status
  on quotes(client_id, status, created_at desc);
create index if not exists idx_quotes_call_id
  on quotes(call_id) where call_id is not null;

alter table quotes enable row level security;

drop policy if exists "Client can view own quotes" on quotes;
create policy "Client can view own quotes" on quotes
  for all using (client_id = get_current_client_id());

----------------------------------------------------------------------
-- 3. scheduler_settings — foundation for Session 15.
--    One row per client; default mode is `native` so the booking engine
--    doesn't need a Google Calendar connection to function. Timezone
--    default matches GM Towing (Melbourne). Operating hours seeded as a
--    sensible 8-6 weekday window; clients override via UI in 15.
----------------------------------------------------------------------

create table if not exists scheduler_settings (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references businesses(id) on delete cascade,
  mode text default 'native'
    check (mode in ('native', 'google_calendar', 'both')),
  timezone text default 'Australia/Melbourne',
  state text default 'VIC'
    check (state in ('NSW','VIC','QLD','WA','SA','TAS','ACT','NT')),
  operating_hours jsonb default '{
    "monday":    { "open": "08:00", "close": "18:00", "enabled": true },
    "tuesday":   { "open": "08:00", "close": "18:00", "enabled": true },
    "wednesday": { "open": "08:00", "close": "18:00", "enabled": true },
    "thursday":  { "open": "08:00", "close": "18:00", "enabled": true },
    "friday":    { "open": "08:00", "close": "18:00", "enabled": true },
    "saturday":  { "open": "09:00", "close": "14:00", "enabled": false },
    "sunday":    { "open": "09:00", "close": "14:00", "enabled": false }
  }'::jsonb,
  buffer_minutes integer default 30,
  max_concurrent_jobs integer default 1,
  booking_confirmation_sms boolean default true,
  booking_confirmation_email boolean default false,
  waitlist_enabled boolean default false,
  google_calendar_token jsonb default null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (client_id)
);

create index if not exists idx_scheduler_settings_client
  on scheduler_settings(client_id);

alter table scheduler_settings enable row level security;

drop policy if exists "Client can manage own scheduler settings" on scheduler_settings;
create policy "Client can manage own scheduler settings" on scheduler_settings
  for all using (client_id = get_current_client_id());

----------------------------------------------------------------------
-- 4. updated_at trigger for scheduler_settings.
--    Reuse the standard updated_at touch fn if present; otherwise no-op
--    so the migration stays idempotent on fresh DBs.
----------------------------------------------------------------------

create or replace function scheduler_settings_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_scheduler_settings_updated_at on scheduler_settings;
create trigger trg_scheduler_settings_updated_at
  before update on scheduler_settings
  for each row execute function scheduler_settings_touch_updated_at();
