-- Session 4A v2 (Round 1) — Onboarding Intelligence + Agent Identity + Go-Live Gate
-- Safe round: new tables + additive businesses columns only. Touches no live agent.
-- NOTE: This `go_live_checklist` (client onboarding gate, 5 step-completions) is a
-- DIFFERENT concern from the existing admin `client_golive_checklist` (Session 20,
-- 28 operational checks). They intentionally coexist.
-- NO owner_name backfill (v1 SPLIT_PART bug removed): owner_name stays NULL until set.

BEGIN;

-- Agent identity + onboarding fields on businesses.
-- agent_name already exists (migration 007); IF NOT EXISTS keeps this safe and
-- does NOT overwrite existing values or defaults.
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS agent_name TEXT DEFAULT 'TalkMate',
  ADD COLUMN IF NOT EXISTS agent_voice_id TEXT,
  ADD COLUMN IF NOT EXISTS integration_mode TEXT
    CHECK (integration_mode IN ('overflow', 'after_hours', 'full_time')),
  ADD COLUMN IF NOT EXISTS integration_ring_delay INT,
  ADD COLUMN IF NOT EXISTS carrier TEXT,
  ADD COLUMN IF NOT EXISTS owner_name TEXT,
  ADD COLUMN IF NOT EXISTS industry_mode_set BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS announcement_sent BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS announcement_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS onboarding_auto_populated BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS onboarding_source_url TEXT,
  ADD COLUMN IF NOT EXISTS go_live_gate_passed BOOLEAN DEFAULT false;

-- Client onboarding readiness gate (one row per business).
CREATE TABLE IF NOT EXISTS go_live_checklist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  agent_named BOOLEAN DEFAULT false,
  mode_selected BOOLEAN DEFAULT false,
  kb_entries_added BOOLEAN DEFAULT false,
  vip_callers_reviewed BOOLEAN DEFAULT false,
  announcement_sent BOOLEAN DEFAULT false,
  passed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (business_id)
);

-- Industry-aware opening questions (draft store; NOT auto-synced to the prompt
-- in Round 1 — injection into the agent prompt is Round 2).
CREATE TABLE IF NOT EXISTS call_flow_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  sort_order INT DEFAULT 0,
  question TEXT NOT NULL,
  purpose TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE go_live_checklist ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS client_go_live_checklist ON go_live_checklist;
CREATE POLICY client_go_live_checklist ON go_live_checklist
  FOR ALL TO authenticated
  USING (business_id = private.get_current_client_id())
  WITH CHECK (business_id = private.get_current_client_id());

ALTER TABLE call_flow_questions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS client_call_flow_questions ON call_flow_questions;
CREATE POLICY client_call_flow_questions ON call_flow_questions
  FOR ALL TO authenticated
  USING (business_id = private.get_current_client_id())
  WITH CHECK (business_id = private.get_current_client_id());

-- Indexes
CREATE INDEX IF NOT EXISTS idx_go_live_checklist_business ON go_live_checklist(business_id);
CREATE INDEX IF NOT EXISTS idx_call_flow_questions_business ON call_flow_questions(business_id, sort_order);

-- Backfill: existing active/trial clients pass the gate so onboarding changes
-- never affect them. NO owner_name backfill.
INSERT INTO go_live_checklist
  (business_id, agent_named, mode_selected, kb_entries_added, vip_callers_reviewed, announcement_sent, passed_at)
SELECT id, true, true, true, true, true, now()
FROM businesses
WHERE account_status IN ('active', 'trial')
ON CONFLICT (business_id) DO NOTHING;

COMMIT;
