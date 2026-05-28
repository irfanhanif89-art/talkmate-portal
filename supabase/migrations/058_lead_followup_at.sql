-- Migration 058 — add per-lead followup reminder timestamp.
-- Used by the mobile Sales Rep app's Followup picker on LeadDetailScreen.
-- No automatic notification triggered by this column; push notifications
-- are Phase 2 sub-project 2.

BEGIN;

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS next_followup_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_leads_next_followup_at_active
  ON leads(next_followup_at)
  WHERE status NOT IN ('won', 'lost', 'bad_lead')
    AND next_followup_at IS NOT NULL;

COMMENT ON COLUMN leads.next_followup_at IS
  'When the rep wants to be reminded about this lead. Set via mobile Followup picker. Display-only in Phase 2 sub-project 1; push reminder is sub-project 2.';

COMMIT;
