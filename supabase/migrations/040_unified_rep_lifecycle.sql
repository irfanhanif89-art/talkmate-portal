-- ============================================================
-- 040_unified_rep_lifecycle.sql
-- Session 25 — unify contractor signing with sales rep portal.
--
-- Goal: when a contractor finishes the digital signing flow and
-- their status becomes 'active', the system can auto-provision a
-- sales_reps row linked back to the contractor. This migration
-- only adds the linkage columns and a legacy flag; the application
-- code in /api/contractor-onboarding/[token]/sign owns the actual
-- provisioning.
--
-- Safe to run twice — every statement is guarded.
-- ============================================================

-- 1a. contractors → sales_reps linkage
alter table contractors
  add column if not exists sales_rep_id uuid references sales_reps(id) on delete set null;

alter table contractors
  add column if not exists portal_invited_at timestamptz;

alter table contractors
  add column if not exists portal_access_email text;

-- 1b. sales_reps → contractors backlink, plus how the rep entered the system
alter table sales_reps
  add column if not exists contractor_id uuid references contractors(id) on delete set null;

alter table sales_reps
  add column if not exists onboarded_via text default 'manual';

-- onboarded_via constraint added separately so it survives re-runs cleanly.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'sales_reps_onboarded_via_check'
      and conrelid = 'sales_reps'::regclass
  ) then
    alter table sales_reps
      add constraint sales_reps_onboarded_via_check
      check (onboarded_via in ('manual', 'contractor_flow'));
  end if;
end $$;

-- 1c. Legacy flag so the old /admin/sales-team page can filter to pre-Session-25 reps.
alter table sales_reps
  add column if not exists is_legacy boolean default false;

-- Backfill: anyone already in sales_reps before this session is legacy.
-- Guarded by onboarded_via = 'manual' so rerunning after contractor-flow reps
-- exist will not retroactively flag them as legacy.
update sales_reps
   set is_legacy = true,
       onboarded_via = 'manual'
 where contractor_id is null
   and onboarded_via = 'manual'
   and is_legacy is distinct from true;

-- Indexes for the new lookups.
create index if not exists idx_contractors_sales_rep_id on contractors(sales_rep_id);
create index if not exists idx_sales_reps_contractor_id on sales_reps(contractor_id);
create index if not exists idx_sales_reps_is_legacy on sales_reps(is_legacy);

-- No new RLS — inherits from contractors / sales_reps which already have
-- admin-only and self-row policies (see migrations 036 and 038).
