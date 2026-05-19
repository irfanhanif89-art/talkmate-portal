-- Session 20 — Go-Live Verification Checklist (admin only)
--
-- Adds a per-client checklist table that mixes automated checks (computed
-- server-side on every read) and manual confirmation items (Irfan ticks
-- after physically verifying each step). The businesses table also gets
-- a top-level verified flag for the admin client list badge.
--
-- All statements idempotent. Service-role-only access — no RLS needed
-- on the checklist table; client users must never reach this surface.

-- ────────────────────────────────────────────────────────────────────────
-- 1a. client_golive_checklist
-- ────────────────────────────────────────────────────────────────────────

create table if not exists client_golive_checklist (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  verified_at timestamptz,
  verified_by text,

  -- AUTO checks (system sets these on every GET)
  check_escalation_number boolean default false,
  check_notifications_config_match boolean default false,
  check_intelligence_alert_config boolean default false,
  check_vapi_agent_id boolean default false,
  check_vapi_phone_number boolean default false,
  check_sms_reset_at boolean default false,
  check_account_status boolean default false,
  check_plan_set boolean default false,
  check_first_call_logged boolean default false,
  check_first_booking_created boolean default false,
  check_first_sms_sent boolean default false,
  check_intelligence_scored boolean default false,

  -- MANUAL checks (admin ticks these)
  manual_vapi_functions_registered boolean default false,
  manual_test_call_made boolean default false,
  manual_agent_greets_correctly boolean default false,
  manual_phone_readback_correct boolean default false,
  manual_booking_appears_in_portal boolean default false,
  manual_sms_delivered_to_owner boolean default false,
  manual_after_hours_tested boolean default false,
  manual_transfer_tested boolean default false,
  manual_client_login_tested boolean default false,
  manual_client_walked_through_portal boolean default false,
  manual_test_data_cleaned boolean default false,
  manual_welcome_email_sent boolean default false,

  notes text,
  unique(business_id)
);

create index if not exists golive_business_id_idx
  on client_golive_checklist (business_id);

-- ────────────────────────────────────────────────────────────────────────
-- 1b. businesses — top-level verified flag for the admin list badge
-- ────────────────────────────────────────────────────────────────────────

alter table businesses
  add column if not exists golive_verified boolean default false,
  add column if not exists golive_verified_at timestamptz;

-- ────────────────────────────────────────────────────────────────────────
-- 1c. Seed: create a checklist row for every existing business so the
--     admin page works on first load without an explicit "Start" action.
-- ────────────────────────────────────────────────────────────────────────

insert into client_golive_checklist (business_id)
select id from businesses
on conflict (business_id) do nothing;
