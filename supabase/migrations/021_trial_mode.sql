-- Migration 021: 7-day trial mode + admin "ready to brief Donna" flag.
--
-- Adds the columns Session 6 needs on top of the existing admin lifecycle
-- model. Idempotent — safe to re-run.
--
-- IMPORTANT: migration 011 created `account_status` with a CHECK constraint
-- restricted to ('active', 'pending', 'suspended', 'cancelled'). Session 6
-- needs 'trial' and 'expired' as additional values. We drop the old
-- constraint and recreate it with the widened set. Existing values are
-- preserved untouched.
--
-- Note on `onboarding_complete` vs `onboarding_completed`:
--   * `onboarding_completed` (already exists) = the client finished the
--     self-onboarding wizard in the portal.
--   * `onboarding_complete`   (this migration) = the admin has confirmed
--     all the fields Donna needs to build the Vapi agent and has fired
--     the auto-brief webhook. Distinct concept, distinct column.

------------------------------------------------------------------
-- 1. Widen account_status CHECK to include 'trial' and 'expired'.
------------------------------------------------------------------

alter table businesses
  drop constraint if exists businesses_account_status_check;

alter table businesses
  add constraint businesses_account_status_check
  check (account_status in ('trial', 'active', 'pending', 'expired', 'suspended', 'cancelled'));

------------------------------------------------------------------
-- 2. Trial lifecycle columns.
------------------------------------------------------------------

alter table businesses add column if not exists trial_start_date timestamptz;
alter table businesses add column if not exists trial_end_date   timestamptz;
alter table businesses add column if not exists trial_converted_at timestamptz;

create index if not exists idx_businesses_trial_end_date
  on businesses(trial_end_date)
  where account_status = 'trial';

------------------------------------------------------------------
-- 3. Admin "brief Donna" flag.
------------------------------------------------------------------

alter table businesses add column if not exists onboarding_complete boolean default false;
alter table businesses add column if not exists onboarding_complete_at timestamptz;

------------------------------------------------------------------
-- 4. Backfill: existing rows with NULL/empty account_status → 'active'.
--    Migration 011 already set the default to 'active', so this only
--    catches anything that slipped through before that.
------------------------------------------------------------------

update businesses
   set account_status = 'active'
 where account_status is null or account_status = '';
