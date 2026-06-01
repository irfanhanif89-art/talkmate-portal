-- =====================================================================
-- 066 — Sales-rep contractor invoices
-- =====================================================================
-- Sales reps are contractors. They generate their own invoice (PDF)
-- outside the platform and upload it here so TalkMate can process and
-- pay it within 14 days. This migration adds:
--   * rep_invoices table (one row per submitted invoice)
--   * a private `rep-invoices` storage bucket for the PDFs
--   * RLS so a rep only sees their own invoices; admins see all
--
-- Uploads/updates happen through service-role API routes (which bypass
-- RLS), but the policies below keep direct PostgREST access correct.
-- RLS helper functions live in the `private` schema (migration 056).

CREATE TABLE IF NOT EXISTS rep_invoices (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rep_id            UUID NOT NULL REFERENCES sales_reps(id) ON DELETE CASCADE,
  invoice_number    TEXT,
  amount            NUMERIC(10,2),
  period_label      TEXT,                       -- e.g. "May 2026" / "Deals: Cohen's, GM Towing"
  notes             TEXT,                       -- optional rep note to admin
  document_path     TEXT NOT NULL,              -- object path in the rep-invoices bucket
  document_name     TEXT,                       -- original filename, for display
  status            TEXT NOT NULL DEFAULT 'submitted'
                      CHECK (status IN ('submitted', 'approved', 'paid', 'rejected')),
  admin_note        TEXT,                       -- reason on reject / note on pay
  payment_reference TEXT,                       -- bank/transfer ref when paid
  submitted_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  due_at            TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '14 days'),
  reviewed_at       TIMESTAMPTZ,
  paid_at           TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rep_invoices_rep_id  ON rep_invoices(rep_id);
CREATE INDEX IF NOT EXISTS idx_rep_invoices_status  ON rep_invoices(status);

ALTER TABLE rep_invoices ENABLE ROW LEVEL SECURITY;

-- Rep can read + insert their own; admin can read everything.
DROP POLICY IF EXISTS rep_invoices_rep_select ON rep_invoices;
CREATE POLICY rep_invoices_rep_select ON rep_invoices
  FOR SELECT TO authenticated
  USING (rep_id = private.current_rep_id() OR private.is_super_admin());

DROP POLICY IF EXISTS rep_invoices_rep_insert ON rep_invoices;
CREATE POLICY rep_invoices_rep_insert ON rep_invoices
  FOR INSERT TO authenticated
  WITH CHECK (rep_id = private.current_rep_id() OR private.is_super_admin());

-- Only admins move an invoice through its lifecycle (approve / pay / reject).
DROP POLICY IF EXISTS rep_invoices_admin_update ON rep_invoices;
CREATE POLICY rep_invoices_admin_update ON rep_invoices
  FOR UPDATE TO authenticated
  USING (private.is_super_admin())
  WITH CHECK (private.is_super_admin());

-- ------------------------------------------------------------------
-- Storage bucket for the uploaded invoice PDFs (private).
-- ------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('rep-invoices', 'rep-invoices', false)
ON CONFLICT (id) DO NOTHING;

-- Admin (super-admin) full access; reps read only their own folder
-- ({rep_id}/...). All serving is via signed URLs from API routes.
DROP POLICY IF EXISTS "rep_invoices_storage_admin_all" ON storage.objects;
CREATE POLICY "rep_invoices_storage_admin_all" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'rep-invoices' AND private.is_super_admin())
  WITH CHECK (bucket_id = 'rep-invoices' AND private.is_super_admin());

DROP POLICY IF EXISTS "rep_invoices_storage_rep_read" ON storage.objects;
CREATE POLICY "rep_invoices_storage_rep_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'rep-invoices'
    AND (storage.foldername(name))[1] = private.current_rep_id()::text
  );
