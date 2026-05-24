-- 047_dedupe_health_alerts.sql
--
-- One-time cleanup of duplicate unresolved agent_health_alerts rows that
-- accumulated before the Session 35 auto-resolve fix shipped. The cron's
-- maybeCreateConfigAlert() always had a 2-hour dedup window, but nothing
-- ever auto-resolved alerts whose underlying issue had been fixed — so a
-- single persistent issue produced a fresh row every ~2 hours forever.
--
-- For each (business_id, issue_code) pair with multiple unresolved rows,
-- keep only the most recent open row and mark the rest as resolved with
-- a 'session_35_dedup_cleanup' tag. UPDATE rather than DELETE preserves
-- the audit trail.
--
-- Scope: alert_type = 'config_issue' only. webhook_gap and
-- transcript_violation alerts have their own lifecycle and are left
-- untouched.
--
-- 1-hour buffer (created_at < now() - interval '1 hour') prevents a race
-- where a live cron run that just inserted a row gets its row clobbered.
--
-- Idempotent: if there are no duplicates (e.g. on a re-run after the fix
-- is in place), the UPDATE matches zero rows and the migration logs the
-- skip via RAISE NOTICE.

DO $$
DECLARE
  dup_count int;
BEGIN
  SELECT COUNT(*) - COUNT(DISTINCT (business_id, issue_code))
    INTO dup_count
    FROM agent_health_alerts
    WHERE resolved_at IS NULL
      AND alert_type = 'config_issue';

  IF dup_count > 0 THEN
    RAISE NOTICE 'Marking % duplicate unresolved config_issue alerts as resolved', dup_count;

    UPDATE agent_health_alerts
    SET resolved_at = now(),
        resolved_by = 'session_35_dedup_cleanup'
    WHERE id NOT IN (
      SELECT DISTINCT ON (business_id, issue_code) id
      FROM agent_health_alerts
      WHERE resolved_at IS NULL
        AND alert_type = 'config_issue'
      ORDER BY business_id, issue_code, created_at DESC
    )
    AND resolved_at IS NULL
    AND alert_type = 'config_issue'
    AND created_at < now() - interval '1 hour';
  ELSE
    RAISE NOTICE 'No duplicate unresolved config_issue alerts found, skipping cleanup';
  END IF;
END $$;
