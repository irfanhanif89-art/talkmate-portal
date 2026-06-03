-- Migration 072: ServiceM8 Job Push (Session 3B) — built DARK.
-- Global kill switch defaults OFF; per-business servicem8_enabled defaults false.
-- Nothing pushes until both are turned on AND a client connects an API key.

BEGIN;

ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS servicem8_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS servicem8_api_key text,
  ADD COLUMN IF NOT EXISTS servicem8_company_uuid text,
  ADD COLUMN IF NOT EXISTS servicem8_default_job_status text NOT NULL DEFAULT 'Quote';

CREATE TABLE IF NOT EXISTS servicem8_push_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  call_id uuid REFERENCES calls(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  servicem8_job_uuid text,
  status text NOT NULL DEFAULT 'success' CHECK (status IN ('success','failed','skipped')),
  payload jsonb,
  error_message text,
  pushed_at timestamptz NOT NULL DEFAULT now()
);

-- Idempotency key for the push (Vapi retries call.ended): a pushed call is never re-pushed.
ALTER TABLE calls
  ADD COLUMN IF NOT EXISTS servicem8_pushed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS servicem8_job_uuid text;

ALTER TABLE servicem8_push_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS client_servicem8_log ON servicem8_push_log;
CREATE POLICY client_servicem8_log ON servicem8_push_log
  FOR ALL TO authenticated
  USING (business_id = private.get_current_client_id())
  WITH CHECK (business_id = private.get_current_client_id());

CREATE INDEX IF NOT EXISTS idx_servicem8_log_business ON servicem8_push_log(business_id, pushed_at DESC);

-- Global master kill switch (N2), default OFF. Irfan flips to 'true' from admin when ready.
INSERT INTO admin_settings (key, value) VALUES ('servicem8_globally_enabled','false')
  ON CONFLICT (key) DO NOTHING;

COMMIT;
