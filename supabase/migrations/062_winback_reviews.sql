-- Migration 062: Sprint Session 1 — Missed Call Win-back + Google Review Follow-up
-- Note: calls.duration_seconds already exists from earlier migrations; we reuse it
-- rather than introducing a parallel call_duration_seconds column.

BEGIN;

-- 1. Extend calls with win-back + review tracking columns
ALTER TABLE calls
  ADD COLUMN IF NOT EXISTS was_abandoned boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS abandoned_at timestamptz,
  ADD COLUMN IF NOT EXISTS winback_sent boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS winback_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_request_sent boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS review_request_sent_at timestamptz;

-- 2. review_requests log
CREATE TABLE IF NOT EXISTS review_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  call_id uuid REFERENCES calls(id) ON DELETE SET NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  platform text NOT NULL DEFAULT 'google' CHECK (platform IN ('google','other')),
  sms_message_id uuid REFERENCES sms_messages(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Contact-level review throttle
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS last_review_request_sent_at timestamptz;

-- 4. Business-level settings for win-back + reviews
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS google_review_url text,
  ADD COLUMN IF NOT EXISTS review_requests_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS review_request_delay_hours int DEFAULT 2,
  ADD COLUMN IF NOT EXISTS review_request_custom_message text,
  ADD COLUMN IF NOT EXISTS winback_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS winback_custom_message text,
  ADD COLUMN IF NOT EXISTS avg_job_value numeric(10,2) DEFAULT 250.00;

-- 5. RLS for review_requests
ALTER TABLE review_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS client_review_requests ON review_requests;
CREATE POLICY client_review_requests ON review_requests
  FOR ALL TO authenticated
  USING (business_id = private.get_current_client_id())
  WITH CHECK (business_id = private.get_current_client_id());

-- 6. Indexes
CREATE INDEX IF NOT EXISTS idx_review_requests_business_id ON review_requests(business_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_review_requests_call_id ON review_requests(call_id) WHERE call_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_review_requests_contact_id ON review_requests(contact_id) WHERE contact_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_calls_was_abandoned
  ON calls(business_id, was_abandoned)
  WHERE was_abandoned = true;

-- Partial index that the review follow-up cron uses to find eligible calls fast.
CREATE INDEX IF NOT EXISTS idx_calls_review_pending
  ON calls(business_id, ended_at)
  WHERE review_request_sent = false AND was_abandoned = false;

CREATE INDEX IF NOT EXISTS idx_calls_winback_pending
  ON calls(business_id, abandoned_at)
  WHERE was_abandoned = true AND winback_sent = false;

COMMIT;
