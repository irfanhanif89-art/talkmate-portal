-- Migration 061: Sprint Session 1 — Self-service knowledge base (Train TalkMate)
-- Structured KB entries that sync to the Vapi assistant. Keeps the existing
-- businesses.knowledge_base free-text field intact (it stores the legacy blob);
-- the new entries table is the source of truth going forward.

BEGIN;

-- 1. knowledge_base_entries
CREATE TABLE IF NOT EXISTS knowledge_base_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('faq','service','hours','pricing','team','custom')),
  question text NOT NULL,
  answer text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. knowledge_base_sync_log
CREATE TABLE IF NOT EXISTS knowledge_base_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  synced_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'success' CHECK (status IN ('success','failed','pending')),
  entries_synced int NOT NULL DEFAULT 0,
  error_message text
);

-- 3. businesses sync state
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS kb_last_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS kb_sync_status text DEFAULT 'synced'
    CHECK (kb_sync_status IN ('synced','pending','syncing','error'));

-- 4. RLS
ALTER TABLE knowledge_base_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS client_kb_entries ON knowledge_base_entries;
CREATE POLICY client_kb_entries ON knowledge_base_entries
  FOR ALL TO authenticated
  USING (business_id = private.get_current_client_id())
  WITH CHECK (business_id = private.get_current_client_id());

ALTER TABLE knowledge_base_sync_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS client_kb_sync_log ON knowledge_base_sync_log;
CREATE POLICY client_kb_sync_log ON knowledge_base_sync_log
  FOR ALL TO authenticated
  USING (business_id = private.get_current_client_id())
  WITH CHECK (business_id = private.get_current_client_id());

-- 5. Indexes
CREATE INDEX IF NOT EXISTS idx_kb_entries_business_id ON knowledge_base_entries(business_id);
CREATE INDEX IF NOT EXISTS idx_kb_entries_category ON knowledge_base_entries(business_id, category, sort_order);
CREATE INDEX IF NOT EXISTS idx_kb_entries_active ON knowledge_base_entries(business_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_kb_sync_log_business ON knowledge_base_sync_log(business_id, synced_at DESC);
CREATE INDEX IF NOT EXISTS idx_businesses_kb_pending ON businesses(kb_sync_status) WHERE kb_sync_status = 'pending';

-- 6. updated_at trigger
CREATE OR REPLACE FUNCTION kb_entries_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_kb_entries_set_updated_at ON knowledge_base_entries;
CREATE TRIGGER trg_kb_entries_set_updated_at
  BEFORE UPDATE ON knowledge_base_entries
  FOR EACH ROW EXECUTE FUNCTION kb_entries_set_updated_at();

-- 7. Mark sync as pending whenever an entry is inserted, updated or soft-deleted.
--    The cron route picks these up and pushes to Vapi.
CREATE OR REPLACE FUNCTION kb_entries_mark_pending()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE businesses
     SET kb_sync_status = 'pending'
   WHERE id = COALESCE(NEW.business_id, OLD.business_id);
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_kb_entries_mark_pending ON knowledge_base_entries;
CREATE TRIGGER trg_kb_entries_mark_pending
  AFTER INSERT OR UPDATE OR DELETE ON knowledge_base_entries
  FOR EACH ROW EXECUTE FUNCTION kb_entries_mark_pending();

COMMIT;
