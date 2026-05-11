-- Migration 024: Dispatcher system for towing-style businesses.
--
-- Adds the data model behind Session 10: vehicles registry, drivers
-- (optionally linked to team_members from Session 9), shift schedule,
-- live availability overrides, and a job queue with auto-generated
-- job numbers.
--
-- Gated by `businesses.dispatch_enabled` so we can roll it to one
-- industry at a time. The brief targets towing; other dispatch-style
-- industries (couriers, trades with vans, etc.) can flip the flag
-- later without code changes.
--
-- Deviations from the brief noted inline:
--   * The brief writes `call_log_id` on dispatch_jobs; the canonical
--     call table is `calls` so the FK is `call_id` (matches Session 9).
--   * `team_member_id` on drivers is nullable + ON DELETE SET NULL so
--     a driver outlives any soft-delete of a team_members row.

----------------------------------------------------------------------
-- 1. businesses — dispatch toggle + config blob.
----------------------------------------------------------------------

alter table businesses
  add column if not exists dispatch_enabled boolean default false,
  add column if not exists dispatch_config jsonb default '{}'::jsonb;
-- dispatch_config shape:
-- {
--   "job_types": ["car_tow","4wd_tow","container","machinery","motorcycle","van"],
--   "default_wait_minutes": 45,
--   "auto_wait_calculation": true,
--   "max_concurrent_jobs": 5,
--   "after_hours_dispatch": true,
--   "overbooking_action": "queue" | "decline" | "waitlist"
-- }

create index if not exists idx_businesses_dispatch_enabled
  on businesses(dispatch_enabled) where dispatch_enabled = true;

----------------------------------------------------------------------
-- 2. vehicles — the trucks the business operates.
----------------------------------------------------------------------

create table if not exists vehicles (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  type text not null,
  registration text,
  capabilities text[] not null default '{}',
  capacity_notes text,
  active boolean default true,
  created_at timestamptz default now()
);

create index if not exists idx_vehicles_client_active
  on vehicles(client_id) where active = true;
-- GIN on capabilities so the dispatch-availability function can match
-- by job_type with `capabilities @> ARRAY[$1]` cheaply.
create index if not exists idx_vehicles_capabilities_gin
  on vehicles using gin (capabilities);

alter table vehicles enable row level security;
create policy "vehicles_client_access" on vehicles
  for all using (client_id = get_current_client_id());

----------------------------------------------------------------------
-- 3. drivers — people who actually run the trucks.
--    Optionally linked to a team_members row (Session 9) so a driver
--    that's also a "team member" for transfer routing isn't double-
--    keyed.
----------------------------------------------------------------------

create table if not exists drivers (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references businesses(id) on delete cascade,
  team_member_id uuid references team_members(id) on delete set null,
  name text not null,
  phone text not null,
  vehicle_id uuid references vehicles(id) on delete set null,
  license_class text,
  active boolean default true,
  created_at timestamptz default now()
);

create index if not exists idx_drivers_client_active
  on drivers(client_id) where active = true;

alter table drivers enable row level security;
create policy "drivers_client_access" on drivers
  for all using (client_id = get_current_client_id());

----------------------------------------------------------------------
-- 4. driver_shifts — recurring weekly shift schedule.
----------------------------------------------------------------------

create table if not exists driver_shifts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references businesses(id) on delete cascade,
  driver_id uuid not null references drivers(id) on delete cascade,
  day_of_week int not null check (day_of_week between 0 and 6),
  -- 0=Sunday, 1=Monday ... 6=Saturday (matches JS Date.getDay()).
  start_time time not null,
  end_time time not null,
  active boolean default true,
  unique (driver_id, day_of_week)
);

create index if not exists idx_driver_shifts_client
  on driver_shifts(client_id, driver_id);

alter table driver_shifts enable row level security;
create policy "driver_shifts_client_access" on driver_shifts
  for all using (client_id = get_current_client_id());

----------------------------------------------------------------------
-- 5. driver_availability — manual status overrides.
----------------------------------------------------------------------

create table if not exists driver_availability (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references businesses(id) on delete cascade,
  driver_id uuid not null references drivers(id) on delete cascade,
  status text not null default 'unavailable'
    check (status in ('available', 'on_job', 'unavailable', 'off_shift')),
  job_id uuid,
  override_start timestamptz,
  override_end timestamptz,
  note text,
  updated_at timestamptz default now()
);

create index if not exists idx_driver_availability_active
  on driver_availability(driver_id, override_end)
  where override_end is null or override_end > now();

alter table driver_availability enable row level security;
create policy "driver_availability_client_access" on driver_availability
  for all using (client_id = get_current_client_id());

----------------------------------------------------------------------
-- 6. dispatch_jobs — the job queue.
--    job_number is text and auto-generated from the shared sequence
--    below ("JOB-0001" format, zero-padded to 4 digits). Numbers are
--    globally unique across businesses so support can reference them
--    unambiguously.
----------------------------------------------------------------------

create sequence if not exists job_number_seq start 1;

create table if not exists dispatch_jobs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references businesses(id) on delete cascade,
  job_number text unique,
  job_type text not null,
  timing text not null default 'now'
    check (timing in ('now', 'scheduled')),
  scheduled_at timestamptz,
  caller_name text,
  caller_phone text not null,
  pickup_address text,
  dropoff_address text,
  vehicle_description text,
  notes text,
  status text not null default 'pending'
    check (status in ('pending', 'assigned', 'in_progress', 'complete', 'cancelled', 'declined')),
  assigned_driver_id uuid references drivers(id) on delete set null,
  assigned_vehicle_id uuid references vehicles(id) on delete set null,
  assigned_at timestamptz,
  completed_at timestamptz,
  -- NB: brief writes `call_log_id` but our canonical table is `calls`.
  call_id uuid references calls(id) on delete set null,
  created_at timestamptz default now()
);

create index if not exists idx_dispatch_jobs_client_status
  on dispatch_jobs(client_id, status, created_at desc);
create index if not exists idx_dispatch_jobs_client_today
  on dispatch_jobs(client_id, created_at desc);

alter table dispatch_jobs enable row level security;
create policy "dispatch_jobs_client_access" on dispatch_jobs
  for all using (client_id = get_current_client_id());

----------------------------------------------------------------------
-- 7. Auto-enable dispatch for existing towing Growth/Pro businesses.
----------------------------------------------------------------------

update businesses
   set dispatch_enabled = true
 where industry = 'towing'
   and plan in ('growth', 'pro', 'professional')
   and dispatch_enabled is distinct from true;
