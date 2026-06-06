-- Session 5B — Mobile push notifications.
-- Stores the Expo push token for a business owner's device + a throttle stamp
-- for the once-per-day transcript-gap notification. Additive + idempotent.

BEGIN;

ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS expo_push_token TEXT,
  ADD COLUMN IF NOT EXISTS expo_push_token_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS expo_push_last_gap_notified_at TIMESTAMPTZ;

-- Lookup by token (used when clearing a token Expo reports as unregistered).
CREATE INDEX IF NOT EXISTS idx_businesses_push_token
  ON businesses(expo_push_token)
  WHERE expo_push_token IS NOT NULL;

COMMIT;
