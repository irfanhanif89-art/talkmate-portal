-- Session 6A — Live-call indicator.
--
-- A dedicated table for "a call is in progress right now" so the portal can
-- show a live indicator WITHOUT putting the whole `businesses` row into the
-- realtime publication (which would broadcast sensitive columns). One row per
-- business at most (UNIQUE business_id) — the Vapi webhook upserts on
-- call.started and deletes on call.ended.

BEGIN;

CREATE TABLE IF NOT EXISTS active_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  vapi_call_id TEXT NOT NULL,
  from_number TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (business_id)
);

ALTER TABLE active_calls ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS client_active_calls ON active_calls;
CREATE POLICY client_active_calls ON active_calls
  FOR SELECT TO authenticated
  USING (business_id = private.get_current_client_id());

-- Add to the realtime publication so the portal can subscribe.
-- (ALTER PUBLICATION ... ADD TABLE errors if already a member, so guard it.)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'active_calls'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE active_calls;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_active_calls_business ON active_calls(business_id);

COMMIT;
