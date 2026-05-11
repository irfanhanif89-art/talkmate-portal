-- Migration 023: Core receptionist feature set.
--
-- Adds the data model behind Session 9: team directory, VIP callers,
-- bookings queue, callbacks queue, plus per-business escalation/routing
-- config and call-outcome metadata on the existing `calls` table.
--
-- Deviations from the brief noted inline:
--   * The brief writes `call_logs` — our canonical call-record table is
--     actually `calls` (see migration 001). All call-record column adds
--     target `calls`.
--   * `calls.outcome` already exists from migration 001, so we skip that
--     column add and only add the new outcome-tracking fields.
--   * All new tables use `client_id` to reference businesses(id), per
--     the CRM-foundation convention introduced in migration 008. RLS
--     scoping is `client_id = get_current_client_id()`.

----------------------------------------------------------------------
-- 1. team_members — who the agent can transfer to.
----------------------------------------------------------------------

create table if not exists team_members (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  role text not null,
  department text,
  phone text not null,
  extension text,
  is_escalation_contact boolean default false,
  active boolean default true,
  sort_order int default 0,
  created_at timestamptz default now()
);

create index if not exists idx_team_members_client_active
  on team_members(client_id) where active = true;

-- Enforce "at most one escalation contact per client" at the DB level so
-- the API doesn't have to do a read-modify-write to maintain the
-- invariant. A partial unique index is the cheapest way.
create unique index if not exists idx_team_members_one_escalation
  on team_members(client_id) where is_escalation_contact = true;

alter table team_members enable row level security;

create policy "team_members_client_access" on team_members
  for all using (client_id = get_current_client_id());

----------------------------------------------------------------------
-- 2. vip_callers — phones that get priority handling.
----------------------------------------------------------------------

create table if not exists vip_callers (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references businesses(id) on delete cascade,
  phone text not null,
  name text,
  note text,
  action text default 'transfer_escalation'
    check (action in ('transfer_escalation', 'transfer_to_member', 'take_message', 'skip_queue')),
  transfer_to_member_id uuid references team_members(id) on delete set null,
  active boolean default true,
  created_at timestamptz default now(),
  unique (client_id, phone)
);

create index if not exists idx_vip_callers_client
  on vip_callers(client_id) where active = true;

alter table vip_callers enable row level security;

create policy "vip_callers_client_access" on vip_callers
  for all using (client_id = get_current_client_id());

----------------------------------------------------------------------
-- 3. bookings — appointments/jobs/quotes captured by the agent.
----------------------------------------------------------------------

create table if not exists bookings (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references businesses(id) on delete cascade,
  caller_name text,
  caller_phone text not null,
  booking_type text check (booking_type in ('appointment', 'job', 'callback', 'quote_request')),
  service_requested text,
  preferred_date date,
  preferred_time text,
  notes text,
  status text default 'pending'
    check (status in ('pending', 'confirmed', 'cancelled', 'completed', 'no_show')),
  confirmed_at timestamptz,
  confirmation_sms_sent boolean default false,
  call_id uuid references calls(id) on delete set null,
  -- Brief's field was `call_log_id` referencing call_logs(id). Our table
  -- is `calls` (migration 001) so the FK targets calls(id) and the
  -- column is renamed for consistency.
  created_at timestamptz default now()
);

create index if not exists idx_bookings_client_status
  on bookings(client_id, status, created_at desc);

alter table bookings enable row level security;

create policy "bookings_client_access" on bookings
  for all using (client_id = get_current_client_id());

----------------------------------------------------------------------
-- 4. callbacks — requests for the business to call them back.
----------------------------------------------------------------------

create table if not exists callbacks (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references businesses(id) on delete cascade,
  caller_name text,
  caller_phone text not null,
  preferred_callback_time timestamptz,
  reason text,
  status text default 'pending'
    check (status in ('pending', 'completed', 'cancelled')),
  call_id uuid references calls(id) on delete set null,
  created_at timestamptz default now()
);

create index if not exists idx_callbacks_client_status
  on callbacks(client_id, status, created_at desc);

alter table callbacks enable row level security;

create policy "callbacks_client_access" on callbacks
  for all using (client_id = get_current_client_id());

----------------------------------------------------------------------
-- 5. businesses — escalation/routing config + knowledge base + plan gate.
----------------------------------------------------------------------

alter table businesses
  add column if not exists escalation_config jsonb default '{}'::jsonb,
  add column if not exists knowledge_base text,
  add column if not exists call_transfer_enabled boolean default false;

-- Auto-enable transfer for existing Growth/Pro businesses. Starter stays
-- false (plan gating).
update businesses
   set call_transfer_enabled = true
 where plan in ('growth', 'pro', 'professional')
   and call_transfer_enabled is distinct from true;

----------------------------------------------------------------------
-- 6. calls — outcome-tracking metadata.
--
-- `outcome` already exists from migration 001, so it's NOT re-added.
-- The brief's set of outcome values (message_taken, transferred, etc.)
-- is enforced at the application layer rather than via a CHECK, so we
-- don't break pre-existing rows that may have older outcome strings.
----------------------------------------------------------------------

alter table calls
  add column if not exists transfer_to text,
  add column if not exists transfer_success boolean,
  add column if not exists is_repeat_caller boolean default false,
  add column if not exists is_vip_caller boolean default false,
  add column if not exists booking_id uuid references bookings(id) on delete set null,
  add column if not exists callback_id uuid references callbacks(id) on delete set null;
