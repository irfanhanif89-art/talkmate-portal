-- Migration 011: Admin client management.
-- Adds account lifecycle fields, admin notes / comms log, and the
-- billing-override + payment-link plumbing the admin "Create new client"
-- flow needs. All statements are idempotent so re-running is safe.
--
-- DECISION (also recorded in DEPLOYMENT.md): the brief specifies an
-- `admin only` RLS policy that compares the caller's email to a session
-- setting (`current_setting('app.admin_email', true)`). Supabase doesn't
-- expose a stable hook to set that GUC per-request, so the API routes
-- always go through the service-role client (`createAdminClient`) which
-- bypasses RLS — and the admin gate is enforced in the route handler
-- (super-admin email check, identical to every other /api/admin/* route).
-- The RLS policies below remain restrictive so that no anon/authenticated
-- session can ever read or write these tables, even by accident.

----------------------------------------------------------------------
-- 1. businesses lifecycle + admin-onboarding fields.
----------------------------------------------------------------------

alter table businesses add column if not exists account_status text
  default 'active'
  check (account_status in ('active', 'pending', 'suspended', 'cancelled'));

alter table businesses add column if not exists onboarded_by text
  default 'self'
  check (onboarded_by in ('self', 'admin', 'partner'));

alter table businesses add column if not exists temp_password text;

alter table businesses add column if not exists welcome_email_sent boolean default false;

alter table businesses add column if not exists agent_phone_number text;

alter table businesses add column if not exists stripe_payment_link text;

alter table businesses add column if not exists stripe_payment_link_id text;

alter table businesses add column if not exists billing_override_note text;

alter table businesses add column if not exists manual_next_billing_date date;

create index if not exists idx_businesses_account_status
  on businesses(account_status);
create index if not exists idx_businesses_stripe_payment_link
  on businesses(stripe_payment_link)
  where stripe_payment_link is not null;

----------------------------------------------------------------------
-- 2. client_comms_log — chronological customer-touch log (admin-only).
----------------------------------------------------------------------

create table if not exists client_comms_log (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references businesses(id) on delete cascade not null,
  note text not null,
  logged_by text default 'admin',
  created_at timestamptz default now()
);

create index if not exists idx_client_comms_log_business
  on client_comms_log(business_id, created_at desc);

alter table client_comms_log enable row level security;

-- Service-role-only access. The /api/admin/* routes use the service-role
-- client which bypasses RLS, so these tables are effectively admin-only
-- by virtue of having no policies for anon/authenticated.
drop policy if exists "service role manages comms log" on client_comms_log;
create policy "service role manages comms log" on client_comms_log
  for all to service_role using (true) with check (true);

----------------------------------------------------------------------
-- 3. client_admin_notes — internal notes about a client (admin-only).
----------------------------------------------------------------------

create table if not exists client_admin_notes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references businesses(id) on delete cascade not null,
  note text not null,
  created_at timestamptz default now()
);

create index if not exists idx_client_admin_notes_business
  on client_admin_notes(business_id, created_at desc);

alter table client_admin_notes enable row level security;

drop policy if exists "service role manages admin notes" on client_admin_notes;
create policy "service role manages admin notes" on client_admin_notes
  for all to service_role using (true) with check (true);
