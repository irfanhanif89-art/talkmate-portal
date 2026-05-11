-- Migration 022: add 'pending_payment' to the account_status CHECK.
--
-- Session 8 introduces a self-serve signup flow at app.talkmate.com.au/signup.
-- When a visitor chooses "Pay now" instead of "Start free trial" we create
-- their business record immediately but flag it as awaiting Stripe payment
-- via account_status = 'pending_payment'. Once Stripe confirms (existing
-- webhook), the status flips to 'active'.
--
-- The Session 6 migration set the CHECK to
--   ('trial', 'active', 'pending', 'expired', 'suspended', 'cancelled')
-- This migration widens it by one more value. Idempotent.
--
-- NOTE: the Session 8 brief said no migration was needed for this column.
-- The brief was wrong on that point — the existing CHECK rejects any
-- value outside the allow-list, so the column must be widened or every
-- "Pay now" signup would fail with a constraint violation.

alter table businesses
  drop constraint if exists businesses_account_status_check;

alter table businesses
  add constraint businesses_account_status_check
  check (account_status in ('trial', 'active', 'pending', 'pending_payment', 'expired', 'suspended', 'cancelled'));
