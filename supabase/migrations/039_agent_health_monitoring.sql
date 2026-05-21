-- Session 24 — Agent health monitoring
-- ----------------------------------------------------------------
-- New tables:
--   • agent_config_snapshots   — point-in-time copy of every assistant
--                                config the health cron has inspected
--   • agent_health_alerts      — open issues surfaced by the health
--                                cron or the transcript scanner
--   • transcript_violations    — speech-pattern hits from scoring
--
-- Column additions:
--   • businesses.last_health_check_at
--   • businesses.health_status            ('healthy'|'warning'|'critical'|'unknown')
--   • businesses.health_issues_count
--   • calls.scanned_for_patterns          (idempotency flag for the cron)
--   • calls.pattern_violations_count
--
-- RLS: all three new tables are admin-only. The service role bypasses
-- RLS so the cron + admin pages work via createAdminClient. The deny-
-- by-default policy (USING false) ensures no client portal user can
-- read them even if they happen to query the table by mistake.

-- ── agent_config_snapshots ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_config_snapshots (
  id                  uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id         uuid        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  vapi_assistant_id   text        NOT NULL,
  snapshot_at         timestamptz NOT NULL DEFAULT now(),
  config_json         jsonb       NOT NULL,
  health_status       text        NOT NULL DEFAULT 'unknown',
  health_issues       jsonb       NOT NULL DEFAULT '[]'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_config_snapshots_business_id
  ON agent_config_snapshots(business_id);
CREATE INDEX IF NOT EXISTS idx_agent_config_snapshots_snapshot_at
  ON agent_config_snapshots(snapshot_at DESC);

ALTER TABLE agent_config_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Deny by default" ON agent_config_snapshots;
CREATE POLICY "Deny by default" ON agent_config_snapshots
  FOR ALL USING (false) WITH CHECK (false);

-- ── agent_health_alerts ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_health_alerts (
  id                  uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id         uuid        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  vapi_assistant_id   text        NOT NULL,
  alert_type          text        NOT NULL,     -- 'config_issue' | 'transcript_violation' | 'webhook_gap'
  severity            text        NOT NULL DEFAULT 'warning',
  title               text        NOT NULL,
  detail              text        NOT NULL,
  issue_code          text,                     -- e.g. WRONG_VOICE_MODEL, dollar_sign — for dedupe
  call_id             uuid        REFERENCES calls(id) ON DELETE SET NULL,
  resolved_at         timestamptz,
  resolved_by         text,
  telegram_sent       boolean     NOT NULL DEFAULT false,
  telegram_sent_at    timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_health_alerts_business_id
  ON agent_health_alerts(business_id);
CREATE INDEX IF NOT EXISTS idx_agent_health_alerts_created_at
  ON agent_health_alerts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_health_alerts_resolved_at
  ON agent_health_alerts(resolved_at);
CREATE INDEX IF NOT EXISTS idx_agent_health_alerts_dedupe
  ON agent_health_alerts(business_id, issue_code, created_at DESC);

ALTER TABLE agent_health_alerts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Deny by default" ON agent_health_alerts;
CREATE POLICY "Deny by default" ON agent_health_alerts
  FOR ALL USING (false) WITH CHECK (false);

-- ── transcript_violations ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transcript_violations (
  id                  uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  call_id             uuid        NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  business_id         uuid        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  pattern_code        text        NOT NULL,
  severity            text        NOT NULL DEFAULT 'warning',
  pattern_match       text        NOT NULL,
  context_snippet     text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transcript_violations_call_id
  ON transcript_violations(call_id);
CREATE INDEX IF NOT EXISTS idx_transcript_violations_business_id
  ON transcript_violations(business_id);
CREATE INDEX IF NOT EXISTS idx_transcript_violations_created_at
  ON transcript_violations(created_at DESC);

ALTER TABLE transcript_violations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Deny by default" ON transcript_violations;
CREATE POLICY "Deny by default" ON transcript_violations
  FOR ALL USING (false) WITH CHECK (false);

-- ── businesses additions ───────────────────────────────────────────
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS last_health_check_at  timestamptz,
  ADD COLUMN IF NOT EXISTS health_status         text    NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS health_issues_count   integer NOT NULL DEFAULT 0;

-- ── calls additions ────────────────────────────────────────────────
ALTER TABLE calls
  ADD COLUMN IF NOT EXISTS scanned_for_patterns     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pattern_violations_count integer NOT NULL DEFAULT 0;

-- Backfill `scanned_for_patterns` on historical calls so the cron's
-- "last 60 minutes" sweep doesn't pick them all up on first run.
UPDATE calls
   SET scanned_for_patterns = true
 WHERE scanned_for_patterns = false
   AND created_at < now() - interval '60 minutes';

-- ── client_golive_checklist additions ──────────────────────────────
-- Two new automated checks for Session 24. Both require a live
-- network call to Vapi to fetch the assistant config, so the auto
-- check returns false when no vapi_agent_id is set rather than
-- silently passing. The go-live route blocks promotion when a
-- critical check fails.
ALTER TABLE client_golive_checklist
  ADD COLUMN IF NOT EXISTS check_agent_config_valid       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS check_no_placeholder_in_prompt boolean NOT NULL DEFAULT false;
