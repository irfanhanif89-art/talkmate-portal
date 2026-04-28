-- Migration 007: Master Brief additions
-- New tables: nps_responses, system_alerts, usage_alerts, menu_import_jobs,
-- command_logs, changelog, scheduled_commands.
-- Also adds new columns to businesses for plan_call_limit, signup_at signal,
-- vapi_health and call-forward state, and extends existing tables that the
-- brief expects (calls.flagged_wrong_response, calls.revenue_attributed).

-- ── nps_responses ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS nps_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  score int NOT NULL CHECK (score BETWEEN 1 AND 10),
  trigger text NOT NULL CHECK (trigger IN ('day30', 'day90')),
  responded_at timestamptz DEFAULT now(),
  UNIQUE(user_id, trigger)
);
CREATE INDEX IF NOT EXISTS idx_nps_user ON nps_responses(user_id);

ALTER TABLE nps_responses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "nps_self" ON nps_responses;
CREATE POLICY "nps_self" ON nps_responses FOR ALL USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "nps_service" ON nps_responses;
CREATE POLICY "nps_service" ON nps_responses FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── system_alerts ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS system_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  type text NOT NULL,        -- vapi_down | call_forward_broken | usage_80pct | usage_95pct | onboarding_incomplete | nps_low | other
  severity text DEFAULT 'info', -- info | warning | critical
  message text NOT NULL,
  resolved boolean DEFAULT false,
  sent_at timestamptz DEFAULT now(),
  resolved_at timestamptz,
  metadata jsonb DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_system_alerts_user ON system_alerts(user_id) WHERE resolved = false;
CREATE INDEX IF NOT EXISTS idx_system_alerts_business ON system_alerts(business_id) WHERE resolved = false;
CREATE INDEX IF NOT EXISTS idx_system_alerts_type ON system_alerts(type) WHERE resolved = false;

ALTER TABLE system_alerts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "system_alerts_owner" ON system_alerts;
CREATE POLICY "system_alerts_owner" ON system_alerts FOR ALL USING (
  user_id = auth.uid() OR business_id IN (SELECT id FROM businesses WHERE owner_user_id = auth.uid())
);
DROP POLICY IF EXISTS "system_alerts_service" ON system_alerts;
CREATE POLICY "system_alerts_service" ON system_alerts FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── usage_alerts ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS usage_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
  call_count int DEFAULT 0,
  plan_limit int NOT NULL,
  alert_sent_80 boolean DEFAULT false,
  alert_sent_95 boolean DEFAULT false,
  month_year text NOT NULL,        -- YYYY-MM
  updated_at timestamptz DEFAULT now(),
  UNIQUE(business_id, month_year)
);
CREATE INDEX IF NOT EXISTS idx_usage_alerts_business ON usage_alerts(business_id);

ALTER TABLE usage_alerts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "usage_alerts_owner" ON usage_alerts;
CREATE POLICY "usage_alerts_owner" ON usage_alerts FOR ALL USING (
  business_id IN (SELECT id FROM businesses WHERE owner_user_id = auth.uid())
);
DROP POLICY IF EXISTS "usage_alerts_service" ON usage_alerts;
CREATE POLICY "usage_alerts_service" ON usage_alerts FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── menu_import_jobs ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS menu_import_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  source_type text NOT NULL DEFAULT 'url',  -- url (MVP) | photo | pdf (future)
  source_url text,
  raw_result jsonb,
  status text DEFAULT 'pending',   -- pending | processing | done | failed
  items_found int DEFAULT 0,
  error text,
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_menu_import_business ON menu_import_jobs(business_id);

ALTER TABLE menu_import_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "menu_import_owner" ON menu_import_jobs;
CREATE POLICY "menu_import_owner" ON menu_import_jobs FOR ALL USING (
  business_id IN (SELECT id FROM businesses WHERE owner_user_id = auth.uid())
);
DROP POLICY IF EXISTS "menu_import_service" ON menu_import_jobs;
CREATE POLICY "menu_import_service" ON menu_import_jobs FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── command_logs ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS command_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  platform text NOT NULL,                  -- whatsapp | telegram | portal
  raw_command text NOT NULL,
  parsed_intent text,
  action_taken text,
  outcome text DEFAULT 'pending_confirmation',  -- success | failed | pending_confirmation | cancelled
  confirmed boolean DEFAULT false,
  confirmation_token text,
  expires_at timestamptz,
  response_ms int,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_command_logs_business ON command_logs(business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_command_logs_pending ON command_logs(business_id) WHERE outcome = 'pending_confirmation';

ALTER TABLE command_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "command_logs_owner" ON command_logs;
CREATE POLICY "command_logs_owner" ON command_logs FOR ALL USING (
  business_id IN (SELECT id FROM businesses WHERE owner_user_id = auth.uid())
);
DROP POLICY IF EXISTS "command_logs_service" ON command_logs;
CREATE POLICY "command_logs_service" ON command_logs FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── scheduled_commands ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS scheduled_commands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  intent text NOT NULL,
  cron_expression text NOT NULL,
  payload jsonb DEFAULT '{}'::jsonb,
  active boolean DEFAULT true,
  last_run_at timestamptz,
  next_run_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE scheduled_commands ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "scheduled_commands_owner" ON scheduled_commands;
CREATE POLICY "scheduled_commands_owner" ON scheduled_commands FOR ALL USING (
  business_id IN (SELECT id FROM businesses WHERE owner_user_id = auth.uid())
);

-- ── changelog ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS changelog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL,
  type text NOT NULL DEFAULT 'new',         -- new | improved | fixed
  emoji text,
  plan_required text,                       -- null | growth | pro
  published_at timestamptz DEFAULT now(),
  seen_by uuid[] DEFAULT ARRAY[]::uuid[]
);
CREATE INDEX IF NOT EXISTS idx_changelog_published ON changelog(published_at DESC);

ALTER TABLE changelog ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "changelog_read_all" ON changelog;
CREATE POLICY "changelog_read_all" ON changelog FOR SELECT USING (true);
DROP POLICY IF EXISTS "changelog_update_seen" ON changelog;
CREATE POLICY "changelog_update_seen" ON changelog FOR UPDATE USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "changelog_service" ON changelog;
CREATE POLICY "changelog_service" ON changelog FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── vapi_health (single-row table for cron state) ─────────────────────────────
CREATE TABLE IF NOT EXISTS vapi_health (
  id int PRIMARY KEY DEFAULT 1,
  fail_count int DEFAULT 0,
  success_streak int DEFAULT 0,
  last_check timestamptz,
  last_status text DEFAULT 'unknown',     -- ok | degraded | down | unknown
  last_error text,
  CONSTRAINT vapi_health_singleton CHECK (id = 1)
);
INSERT INTO vapi_health (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE vapi_health ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "vapi_health_read" ON vapi_health;
CREATE POLICY "vapi_health_read" ON vapi_health FOR SELECT USING (true);
DROP POLICY IF EXISTS "vapi_health_service" ON vapi_health;
CREATE POLICY "vapi_health_service" ON vapi_health FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── businesses additions for the brief ────────────────────────────────────────
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS plan_call_limit int;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS signup_at timestamptz DEFAULT now();
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS escalation_number text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS escalation_trigger text DEFAULT 'always';
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS agent_name text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS talkmate_number text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS connect_method text;       -- forwarding | new_number
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS forwarding_carrier text;   -- telstra | optus | vodafone
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS last_call_forward_check timestamptz;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS call_forward_status text DEFAULT 'unknown';

-- Set default plan_call_limit by plan if not already set
UPDATE businesses SET plan_call_limit = CASE
  WHEN plan = 'starter' THEN 300
  WHEN plan = 'growth' THEN 800
  WHEN plan = 'pro' OR plan = 'professional' THEN 100000
  ELSE 300
END WHERE plan_call_limit IS NULL;

-- ── calls additions for the brief ─────────────────────────────────────────────
ALTER TABLE calls ADD COLUMN IF NOT EXISTS flagged_wrong_response boolean DEFAULT false;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS flagged_message_index int;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS revenue_attributed numeric DEFAULT 0;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS call_type text;   -- order | enquiry | faq | transfer | missed

-- ── businesses commands settings (Command Centre) ─────────────────────────────
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS command_centre_platform text;        -- whatsapp | telegram
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS command_centre_token text;            -- bot token / api key (encrypted in production)
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS command_authorised_numbers text[] DEFAULT ARRAY[]::text[];
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS command_daily_count int DEFAULT 0;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS command_daily_count_date date;

-- Seed initial changelog entries
INSERT INTO changelog (title, description, type, emoji, plan_required) VALUES
  ('AI Menu Import', 'Paste your menu URL and TalkMate auto-fills your services in seconds.', 'new', '✨', NULL),
  ('Command Centre', 'Run your business by texting WhatsApp or Telegram — Growth and Pro only.', 'new', '🚀', 'growth'),
  ('Onboarding refresh', 'Faster, friendlier 5-step setup that gets you live in under 5 minutes.', 'improved', '🎯', NULL),
  ('Refer & Earn payouts', 'Stripe Connect bank verification now finishes in one tap.', 'improved', '💸', NULL),
  ('System status page', 'Live status at /status — check service health any time.', 'new', '📡', NULL)
ON CONFLICT DO NOTHING;
