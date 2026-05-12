-- Migration 025: prevent duplicate businesses per owner.
--
-- Two changes that together make it impossible for the same auth.users
-- row to end up with two active businesses rows (the bug that caused
-- the redirect loop when an admin "deleted" a client by flipping
-- account_status to 'cancelled' but the user's session still pointed
-- at the old row).
--
-- 1. UNIQUE constraint on businesses.owner_user_id so the DB rejects a
--    second insert outright.
-- 2. Drop the NOT NULL on owner_user_id and replace it with a partial
--    CHECK: the column is only required when account_status is not
--    cancelled/expired. This lets us null the link out on a cancellation
--    so a stale owner_user_id can never strand the user.
--
-- ---------------------------------------------------------------------
-- IMPORTANT — verify there are no existing duplicates BEFORE running.
-- ---------------------------------------------------------------------
-- Run this read-only query first; if any rows come back, resolve them
-- manually (merge or null out the older record) before applying the
-- constraint:
--
--   SELECT owner_user_id, COUNT(*)
--   FROM businesses
--   WHERE owner_user_id IS NOT NULL
--   GROUP BY owner_user_id
--   HAVING COUNT(*) > 1;
--
-- The ALTER TABLE will fail loudly if duplicates exist, which is the
-- desired outcome — better a failed migration than a silently-broken
-- constraint.

-- ---------------------------------------------------------------------
-- 1. Allow NULL on owner_user_id (only meaningful for cancelled/expired).
-- ---------------------------------------------------------------------

alter table businesses
  alter column owner_user_id drop not null;

-- Partial requirement: owner_user_id must be set unless the account is
-- cancelled or expired. Existing rows are unaffected because they all
-- still have a non-null owner_user_id at this point.
alter table businesses
  drop constraint if exists owner_user_id_required_when_active;

alter table businesses
  add constraint owner_user_id_required_when_active
  check (
    account_status in ('cancelled', 'expired')
    or owner_user_id is not null
  );

-- ---------------------------------------------------------------------
-- 2. UNIQUE constraint on owner_user_id.
-- ---------------------------------------------------------------------
-- NULLs are allowed and don't count toward uniqueness in PG, so any
-- number of cancelled/expired rows can sit at NULL without colliding.

alter table businesses
  drop constraint if exists businesses_owner_user_id_unique;

alter table businesses
  add constraint businesses_owner_user_id_unique
  unique (owner_user_id);
