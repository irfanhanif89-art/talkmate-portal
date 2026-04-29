-- Migration 008: CRM foundation
-- Session 1 brief: legal acceptance tracking, contacts CRM, smart lists,
-- pipeline stages, industry selection, recording-disclosure config.
--
-- DECISION (documented in DEPLOYMENT.md): the brief refers to a `clients`
-- table; the existing schema uses `businesses`. Same domain concept, different
-- name. To avoid a destructive rename across the entire codebase, every
-- `clients(id)` reference in the brief is mapped to `businesses(id)` here.
-- The helper `get_current_client_id()` returns the current user's business id
-- so RLS policies match the brief's intent.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── helper: who is the current "client"? ─────────────────────────────────────
-- Returns the businesses.id row owned by the JWT user. Used by RLS policies
-- that need to scope rows to the requesting user's business.
CREATE OR REPLACE FUNCTION get_current_client_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT id FROM businesses WHERE owner_user_id = auth.uid() LIMIT 1
$$;

REVOKE ALL ON FUNCTION get_current_client_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_current_client_id() TO authenticated, service_role;

-- ── businesses additions ─────────────────────────────────────────────────────
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS industry text
  CHECK (industry IS NULL OR industry IN (
    'restaurants', 'towing', 'real_estate', 'trades',
    'healthcare', 'ndis', 'retail', 'professional_services', 'other'
  ));
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS industry_configured_at timestamptz;

-- T&C acceptance metadata (denormalized onto businesses for fast reads;
-- legal_acceptances is the immutable audit log)
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS tos_accepted_at timestamptz;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS tos_accepted_version text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS tos_signature text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS tos_ip_address text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS privacy_accepted_version text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS dpa_accepted_version text;

-- Recording disclosure (Part 5 amendment to existing greeting step)
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS call_recording_disclosure_enabled boolean DEFAULT true;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS call_recording_disclosure_text text
  DEFAULT 'Thank you for calling. This call may be recorded for quality and business purposes.';

-- ── legal_acceptances ────────────────────────────────────────────────────────
-- Immutable audit log: one row per (user, document_type, version) acceptance.
CREATE TABLE IF NOT EXISTS legal_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  document_type text NOT NULL CHECK (document_type IN (
    'terms_of_service', 'privacy_policy', 'data_processing_agreement'
  )),
  document_version text NOT NULL,
  signature text,
  accepted_at timestamptz DEFAULT now() NOT NULL,
  ip_address text,
  user_agent text
);

CREATE INDEX IF NOT EXISTS legal_acceptances_client_idx ON legal_acceptances(client_id);
CREATE INDEX IF NOT EXISTS legal_acceptances_user_idx ON legal_acceptances(user_id);

ALTER TABLE legal_acceptances ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "clients can view own acceptances" ON legal_acceptances;
CREATE POLICY "clients can view own acceptances" ON legal_acceptances
  FOR SELECT USING (client_id = get_current_client_id());
DROP POLICY IF EXISTS "legal_acceptances_service" ON legal_acceptances;
CREATE POLICY "legal_acceptances_service" ON legal_acceptances
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── contacts ─────────────────────────────────────────────────────────────────
-- Note: an older v1 `contacts` table exists from migration 004 (email-scan
-- imports). It uses `business_id` and a different shape. Migration 004's
-- table has been used minimally. We rename the legacy table out of the way
-- so the new v2 contacts schema (matching the Session 1 brief) takes the
-- `contacts` name. Legacy data, if any, is preserved in `contacts_v1_legacy`
-- and can be backfilled later.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'contacts')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_name = 'contacts' AND column_name = 'client_id') THEN
    ALTER TABLE contacts RENAME TO contacts_v1_legacy;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
  name text,
  phone text NOT NULL,
  email text,
  first_seen timestamptz DEFAULT now(),
  last_seen timestamptz DEFAULT now(),
  call_count integer DEFAULT 0,
  notes text,
  tags text[] DEFAULT '{}',
  industry_data jsonb DEFAULT '{}'::jsonb,
  is_merged boolean DEFAULT false,
  merged_into uuid REFERENCES contacts(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS contacts_client_phone_idx
  ON contacts(client_id, phone) WHERE is_merged = false;
CREATE INDEX IF NOT EXISTS contacts_client_last_seen_idx ON contacts(client_id, last_seen DESC);

ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "clients see own contacts only" ON contacts;
CREATE POLICY "clients see own contacts only" ON contacts
  FOR ALL USING (client_id = get_current_client_id());
DROP POLICY IF EXISTS "contacts_service" ON contacts;
CREATE POLICY "contacts_service" ON contacts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── contact_calls ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contact_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid REFERENCES contacts(id) ON DELETE CASCADE NOT NULL,
  call_id text NOT NULL,
  client_id uuid REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
  call_at timestamptz NOT NULL,
  duration_seconds integer,
  outcome text,
  summary text,
  transcript text,
  tags_applied text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS contact_calls_contact_idx ON contact_calls(contact_id, call_at DESC);
CREATE INDEX IF NOT EXISTS contact_calls_client_idx ON contact_calls(client_id, call_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS contact_calls_call_id_idx ON contact_calls(call_id);

ALTER TABLE contact_calls ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "clients see own contact calls" ON contact_calls;
CREATE POLICY "clients see own contact calls" ON contact_calls
  FOR ALL USING (client_id = get_current_client_id());
DROP POLICY IF EXISTS "contact_calls_service" ON contact_calls;
CREATE POLICY "contact_calls_service" ON contact_calls
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── smart_lists ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS smart_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  description text,
  filter_rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_system boolean DEFAULT false,
  industry text,
  icon text,
  color text,
  contact_count integer DEFAULT 0,
  last_refreshed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS smart_lists_client_idx ON smart_lists(client_id);

ALTER TABLE smart_lists ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "clients see own smart lists" ON smart_lists;
CREATE POLICY "clients see own smart lists" ON smart_lists
  FOR ALL USING (client_id = get_current_client_id());
DROP POLICY IF EXISTS "smart_lists_service" ON smart_lists;
CREATE POLICY "smart_lists_service" ON smart_lists
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── pipeline_stages ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pipeline_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
  industry text NOT NULL,
  stage_name text NOT NULL,
  stage_order integer NOT NULL,
  color text DEFAULT '#1565C0',
  is_terminal boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pipeline_stages_client_idx ON pipeline_stages(client_id, stage_order);

ALTER TABLE pipeline_stages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "clients see own pipeline stages" ON pipeline_stages;
CREATE POLICY "clients see own pipeline stages" ON pipeline_stages
  FOR ALL USING (client_id = get_current_client_id());
DROP POLICY IF EXISTS "pipeline_stages_service" ON pipeline_stages;
CREATE POLICY "pipeline_stages_service" ON pipeline_stages
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── contact_pipeline ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contact_pipeline (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid REFERENCES contacts(id) ON DELETE CASCADE NOT NULL,
  client_id uuid REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
  stage_id uuid REFERENCES pipeline_stages(id) NOT NULL,
  entered_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS contact_pipeline_contact_idx ON contact_pipeline(contact_id);

ALTER TABLE contact_pipeline ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "clients see own pipeline" ON contact_pipeline;
CREATE POLICY "clients see own pipeline" ON contact_pipeline
  FOR ALL USING (client_id = get_current_client_id());
DROP POLICY IF EXISTS "contact_pipeline_service" ON contact_pipeline;
CREATE POLICY "contact_pipeline_service" ON contact_pipeline
  FOR ALL TO service_role USING (true) WITH CHECK (true);
