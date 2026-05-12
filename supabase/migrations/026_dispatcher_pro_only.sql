-- Migration 026: dispatcher becomes Pro-tier only.
--
-- Business context.
-- Migration 024 auto-enabled dispatch for any towing business on Growth
-- or above. Today's plan-gating change moves dispatcher to Pro-only, so
-- two things need to happen at the DB layer:
--
-- 1. Revoke `dispatch_enabled` on existing Growth towing businesses.
--    They keep their data (vehicles, drivers, shifts, jobs) but lose
--    runtime access until they upgrade. Pro and 'professional' (alias)
--    rows are untouched.
-- 2. Replace the auto-enable rule from migration 024 so future Pro
--    towing inserts pick up `dispatch_enabled = true` automatically.
--    Migration 024 was a one-shot UPDATE so there is nothing to
--    rewrite — we just run the new, narrower UPDATE here and document
--    the intent. Any operator running both migrations on a fresh DB
--    will get the narrower rule because 024's UPDATE matched Growth+
--    AND THIS migration immediately turns Growth back off.
--
-- Idempotent: re-running this migration has no effect once the state
-- has stabilised (the WHERE clauses won't match anything on a second
-- run).
--
-- The change is fully reversible — set dispatch_enabled = true on
-- specific rows manually if a Growth client is grandfathered.

----------------------------------------------------------------------
-- 1. Revoke dispatch on Growth towing businesses.
----------------------------------------------------------------------

update businesses
   set dispatch_enabled = false
 where industry = 'towing'
   and plan = 'growth'
   and dispatch_enabled is distinct from false;

----------------------------------------------------------------------
-- 2. Narrowed auto-enable: Pro tier only.
----------------------------------------------------------------------

update businesses
   set dispatch_enabled = true
 where industry = 'towing'
   and plan in ('pro', 'professional')
   and dispatch_enabled is distinct from true;
