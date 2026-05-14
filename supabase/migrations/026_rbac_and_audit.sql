-- Migration 026: Security foundations — RBAC, admin audit log, retention.
--
-- Session 11 brief. Three independent concerns bundled into one
-- migration because they're all small additive changes touched by the
-- same release:
--
--   1. staff_members — TalkMate clients can invite non-owner users
--      (manager / staff roles) into their portal. This is separate from
--      the existing team_members table (migration 023), which is the
--      *business's* personnel directory used by call escalation.
--   2. admin_audit_log — every admin action on a client account is
--      written here. Service-role only; no RLS published.
--   3. businesses.data_retention_days — cron infrastructure for time-
--      based purges. Default keeps everything for 365 days; clients can
--      shorten this for privacy requests.
--
-- Numbering note: 027 (TalkMate Command) and 028 (vapi_call_id) were
-- shipped first because of Session 12; this 026 lands after them on
-- production. Both Supabase and our deploy tooling apply migrations in
-- filename order, but each migration is recorded independently — so a
-- "back-filled" 026 runs cleanly on a database that already has 027/028
-- applied.

----------------------------------------------------------------------
-- 1. staff_members — invited (non-owner) users for a client account.
----------------------------------------------------------------------
-- Lifecycle:
--   - Owner invites someone via /settings/security (Team Access).
--     Row inserted with auth_user_id NULL and accepted_at NULL.
--   - Invitee follows the emailed link to /accept-invite?token=...,
--     creates a Supabase Auth user, and we stamp auth_user_id +
--     accepted_at on the matching row.
--   - Owner can deactivate (active=false) without deleting history.
--
-- Distinction from team_members:
--   team_members  → escalation/routing directory (no portal login).
--   staff_members → portal users with view-only or edit-limited access.

create table if not exists staff_members (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references businesses(id) on delete cascade,
  email text not null,
  full_name text not null,
  role text not null default 'staff'
    check (role in ('staff', 'manager')),
  -- The invite token sent in the email. We store the *hashed* form so a
  -- DB leak can't be used to walk pending invites; the plaintext value
  -- only ever lives in the email body.
  invite_token_hash text,
  invite_expires_at timestamptz,
  invited_at timestamptz default now(),
  accepted_at timestamptz,
  auth_user_id uuid,
  active boolean default true,
  created_at timestamptz default now(),
  unique (client_id, email)
);

create index if not exists idx_staff_members_auth_user
  on staff_members(auth_user_id) where auth_user_id is not null;
create index if not exists idx_staff_members_invite_lookup
  on staff_members(invite_token_hash) where invite_token_hash is not null;

alter table staff_members enable row level security;

-- Owners + already-accepted staff can read their own client's rows.
-- (Pending invitees don't have an auth session yet, so they never hit
-- RLS — the accept-invite endpoint uses the service-role client.)
drop policy if exists "staff_members_client_access" on staff_members;
create policy "staff_members_client_access" on staff_members
  for all using (client_id = get_current_client_id());

----------------------------------------------------------------------
-- 2. admin_audit_log — append-only record of admin actions.
----------------------------------------------------------------------
-- Service-role only. We don't publish an RLS policy because the admin
-- UI reads via /api/admin/* routes which already gate on requireAdmin().

create table if not exists admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_email text not null,
  action text not null,
  -- e.g. 'client_created', 'client_updated', 'plan_changed',
  -- 'account_status_changed', 'trial_started', 'trial_converted',
  -- 'trial_ended', 'trial_extended', 'dispatch_toggled',
  -- 'team_member_added', 'team_member_removed', 'data_retention_purge'.
  business_id uuid references businesses(id) on delete set null,
  -- Denormalised so audit history survives a business being deleted.
  business_name text,
  before_value jsonb,
  after_value jsonb,
  ip_address text,
  created_at timestamptz default now()
);

create index if not exists idx_audit_log_business
  on admin_audit_log(business_id);
create index if not exists idx_audit_log_created
  on admin_audit_log(created_at desc);
create index if not exists idx_audit_log_action
  on admin_audit_log(action);

alter table admin_audit_log enable row level security;
-- No public policies — admin routes use the service-role client.

----------------------------------------------------------------------
-- 3. businesses.data_retention_days — retention cron config.
----------------------------------------------------------------------
-- Default 365 days. NULL means "use the default"; 0 means "delete
-- nothing" (legal hold). The cron in /api/cron/data-retention reads
-- this column per client.

alter table businesses
  add column if not exists data_retention_days int default 365;
