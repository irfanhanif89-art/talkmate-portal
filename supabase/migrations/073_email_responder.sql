-- Migration 073: AI Email Responder (Session 3C) — built DARK + consent-gated.
-- Global kill switch + per-business enable default OFF; auto-send default OFF;
-- ai_email_consent default false (client must consent before we email on their behalf).

BEGIN;

CREATE TABLE IF NOT EXISTS email_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  subject text,
  from_email text NOT NULL,
  from_name text,
  root_key text NOT NULL,   -- conversation root (References[0] || In-Reply-To || this Message-ID)
  last_message_at timestamptz NOT NULL DEFAULT now(),
  last_message_preview text,
  unread_count int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived','spam')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, from_email, root_key)
);

CREATE TABLE IF NOT EXISTS email_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES email_threads(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('inbound','outbound')),
  from_email text NOT NULL,
  from_name text,
  to_email text NOT NULL,
  subject text,
  body_text text,
  body_html text,
  message_id text,
  in_reply_to text,
  resend_message_id text,
  status text NOT NULL DEFAULT 'received' CHECK (status IN ('queued','sent','delivered','failed','received','discarded')),
  sent_by text NOT NULL DEFAULT 'system' CHECK (sent_by IN ('system','ai','human')),
  ai_drafted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Idempotency (Vapi/Resend can re-deliver): a re-delivered inbound cannot create a duplicate.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_email_messages_message_id
  ON email_messages(business_id, message_id) WHERE message_id IS NOT NULL;

ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS inbound_email_address text,
  ADD COLUMN IF NOT EXISTS email_responder_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_responder_from_name text,
  ADD COLUMN IF NOT EXISTS email_auto_send boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_email_consent boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_inbound_email_address
  ON businesses(inbound_email_address) WHERE inbound_email_address IS NOT NULL;

ALTER TABLE email_threads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS client_email_threads ON email_threads;
CREATE POLICY client_email_threads ON email_threads
  FOR ALL TO authenticated
  USING (business_id = private.get_current_client_id())
  WITH CHECK (business_id = private.get_current_client_id());

ALTER TABLE email_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS client_email_messages ON email_messages;
CREATE POLICY client_email_messages ON email_messages
  FOR ALL TO authenticated
  USING (business_id = private.get_current_client_id())
  WITH CHECK (business_id = private.get_current_client_id());

-- Realtime for live inbox updates — IDEMPOTENT add.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='email_threads')
    THEN ALTER PUBLICATION supabase_realtime ADD TABLE email_threads; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='email_messages')
    THEN ALTER PUBLICATION supabase_realtime ADD TABLE email_messages; END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_email_threads_business_id ON email_threads(business_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_threads_contact_id ON email_threads(contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_email_messages_thread_id ON email_messages(thread_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_email_messages_business_id ON email_messages(business_id, created_at DESC);

-- Global kill switch (default OFF) + spend caps (N5).
INSERT INTO admin_settings (key, value) VALUES
  ('email_responder_globally_enabled','false'),
  ('email_drafts_daily_cap','100'),
  ('email_drafts_global_daily_cap','1000')
ON CONFLICT (key) DO NOTHING;

COMMIT;
