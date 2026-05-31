-- Migration 063: Sprint Session 2 — AI Website Chatbot
-- Adds chat_sessions + chat_messages (the embeddable widget's data), the
-- per-business chatbot config columns, businesses.slug (public widget lookup),
-- businesses.owner_phone (lead-capture SMS notification target) and the
-- rate_limit_log table that guards the public /api/chat/* surface.
--
-- Brief called these 041 in the original doc, but 041/042 are long taken on
-- this repo (contractor signature + session-27 fixes). Renumbered to 063 to
-- sit after the Session 1 migrations 060-062.
--
-- RLS predicate is private.get_current_client_id() — the canonical helper used
-- by every Session 1 table. The public widget routes use the service role key
-- (createAdminClient) and bypass RLS deliberately; client-portal reads go
-- through the authenticated policies below.

BEGIN;

-- 1. Chatbot config + public-lookup columns on businesses
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS chatbot_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS chatbot_greeting text DEFAULT 'Hi! How can I help you today?',
  ADD COLUMN IF NOT EXISTS chatbot_agent_name text DEFAULT 'TalkMate',
  ADD COLUMN IF NOT EXISTS chatbot_primary_color text DEFAULT '#E8622A',
  ADD COLUMN IF NOT EXISTS chatbot_collect_leads_after int DEFAULT 2,
  ADD COLUMN IF NOT EXISTS owner_phone text,
  ADD COLUMN IF NOT EXISTS slug text;

-- 2. Backfill slug from business name (lowercase, hyphenated, de-duplicated by
--    appending a short id fragment so the UNIQUE constraint below never trips).
UPDATE businesses
   SET slug = trim(both '-' from regexp_replace(lower(coalesce(name, 'business')), '[^a-z0-9]+', '-', 'g'))
              || '-' || substr(id::text, 1, 6)
 WHERE slug IS NULL;

-- 3. Now that every row has a value, enforce uniqueness.
CREATE UNIQUE INDEX IF NOT EXISTS idx_businesses_slug ON businesses(slug) WHERE slug IS NOT NULL;

-- 4. Chat sessions (one per visitor conversation)
CREATE TABLE IF NOT EXISTS chat_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  visitor_id text NOT NULL,
  source_url text,
  lead_captured boolean NOT NULL DEFAULT false,
  lead_name text,
  lead_phone text,
  lead_email text,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  message_count int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','ended','converted'))
);

-- 5. Chat messages
CREATE TABLE IF NOT EXISTS chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user','assistant','system')),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 6. Rate-limit log for the public widget endpoints. ip_hash is a SHA-256 of
--    the caller IP — we never store the raw address.
CREATE TABLE IF NOT EXISTS rate_limit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_hash text NOT NULL,
  endpoint text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 7. RLS — client-portal reads only see their own rows. The widget API uses the
--    service role and is not subject to these.
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS client_chat_sessions ON chat_sessions;
CREATE POLICY client_chat_sessions ON chat_sessions
  FOR ALL TO authenticated
  USING (business_id = private.get_current_client_id())
  WITH CHECK (business_id = private.get_current_client_id());

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS client_chat_messages ON chat_messages;
CREATE POLICY client_chat_messages ON chat_messages
  FOR ALL TO authenticated
  USING (business_id = private.get_current_client_id())
  WITH CHECK (business_id = private.get_current_client_id());

-- rate_limit_log is service-role only (no authenticated policy). Enable RLS so
-- it is locked down by default; the admin/service key bypasses it.
ALTER TABLE rate_limit_log ENABLE ROW LEVEL SECURITY;

-- 8. Indexes
CREATE INDEX IF NOT EXISTS idx_chat_sessions_business_id ON chat_sessions(business_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_visitor_id ON chat_sessions(visitor_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_lead ON chat_sessions(business_id, lead_captured) WHERE lead_captured = true;
CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id ON chat_messages(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_messages_business_id ON chat_messages(business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rate_limit_ip ON rate_limit_log(ip_hash, endpoint, created_at);

COMMIT;
