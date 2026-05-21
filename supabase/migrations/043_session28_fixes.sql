-- Migration 043: Session 28 fixes
--
-- No new tables. Two changes to support the call-intelligence retry
-- improvements in this session:
--
-- 1. calls.intelligence_retry_count — exposes a counter for the retry
--    cron so we can cap attempts in a future session. Defaults to 0
--    and is safe to add without a backfill.
--
-- 2. Index on (intelligence_status, created_at) where the status is
--    'pending' or 'error' — speeds up the split queries added to
--    /api/cron/score-pending-calls in Session 28. The partial WHERE
--    keeps the index small (we only ever filter on those two states).
--
-- All statements are idempotent so this migration can be re-run.

ALTER TABLE calls
  ADD COLUMN IF NOT EXISTS intelligence_retry_count INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_calls_intelligence_status_created
  ON calls (intelligence_status, created_at)
  WHERE intelligence_status IN ('pending', 'error');
