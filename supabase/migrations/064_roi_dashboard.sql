-- Migration 064: Sprint Session 2 — ROI Dashboard
-- roi_events is the conversion audit trail that makes the headline "recovered
-- revenue" number defensible. The /api/dashboard/roi route can read from this
-- table OR calculate directly from source tables (calls/chat_sessions/
-- review_requests) — at current client volume it calculates directly and uses
-- roi_events only as the append-only audit log.
--
-- businesses.avg_job_value already exists (migration 062). Here we only add the
-- three tunable conversion-rate columns and a banner-dismiss timestamp.
--
-- Brief called this 042; renumbered to 064 (042 is session-27 fixes on this repo).

BEGIN;

-- 1. ROI event audit trail
CREATE TABLE IF NOT EXISTS roi_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN (
    'call_answered',
    'call_after_hours',
    'call_answered_concurrent',
    'winback_sent',
    'winback_replied',
    'review_request_sent',
    'chat_lead_captured',
    'chat_session_started'
  )),
  source_id uuid,
  source_table text,
  estimated_value numeric(10,2) NOT NULL DEFAULT 0,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'
);

-- 2. Tunable conversion rates (percentages) + the avg-job-value banner dismiss.
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS roi_conversion_rate_calls numeric(5,2) DEFAULT 40.00,
  ADD COLUMN IF NOT EXISTS roi_conversion_rate_chat numeric(5,2) DEFAULT 20.00,
  ADD COLUMN IF NOT EXISTS roi_conversion_rate_winback numeric(5,2) DEFAULT 30.00,
  ADD COLUMN IF NOT EXISTS roi_avg_job_value_prompt_dismissed_at timestamptz;

-- 3. RLS
ALTER TABLE roi_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS client_roi_events ON roi_events;
CREATE POLICY client_roi_events ON roi_events
  FOR ALL TO authenticated
  USING (business_id = private.get_current_client_id())
  WITH CHECK (business_id = private.get_current_client_id());

-- 4. Indexes
CREATE INDEX IF NOT EXISTS idx_roi_events_business_month ON roi_events(business_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_roi_events_type ON roi_events(business_id, event_type, occurred_at DESC);

COMMIT;
