-- ============================================================
-- 041_contractor_signature_metadata.sql
-- Add captured-signature metadata to contractor_agreements so the
-- executed copy is auditable under the Electronic Transactions Act
-- 2001 (Qld): signature method (drawn vs typed), client-side
-- timestamp, and the IP the signing request came from.
--
-- The signature image itself is embedded in the generated PDF
-- (stored in the contractor-agreements Supabase Storage bucket).
-- Only the metadata lives in this table.
--
-- Idempotent — safe to run twice.
-- ============================================================

alter table contractor_agreements
  add column if not exists signature_method text;

-- The CHECK constraint is added in a guarded DO block so re-running
-- after the constraint exists doesn't error.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'contractor_agreements_signature_method_check'
      and conrelid = 'contractor_agreements'::regclass
  ) then
    alter table contractor_agreements
      add constraint contractor_agreements_signature_method_check
      check (signature_method is null or signature_method in ('drawn', 'typed'));
  end if;
end $$;

alter table contractor_agreements
  add column if not exists signature_timestamp timestamptz;

alter table contractor_agreements
  add column if not exists ip_address text;
