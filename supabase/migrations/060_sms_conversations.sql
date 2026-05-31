-- Migration 060: Sprint Session 1 — Two-way SMS Inbox
-- Adds sms_conversations + sms_messages with realtime + RLS
-- Adds businesses.twilio_phone_number / twilio_phone_sid
-- Adds contacts.sms_opted_out + sms_opted_out_at
-- Uses private.get_current_client_id() helper (the canonical RLS predicate)

BEGIN;

-- 1. Businesses: Twilio phone number columns (the inbound SMS webhook looks up the
--    receiving business by the "To" number that hit Twilio).
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS twilio_phone_number text,
  ADD COLUMN IF NOT EXISTS twilio_phone_sid text;

CREATE INDEX IF NOT EXISTS idx_businesses_twilio_phone_number
  ON businesses (twilio_phone_number)
  WHERE twilio_phone_number IS NOT NULL;

-- 2. Contacts: SMS opt-out (STOP keyword handling)
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS sms_opted_out boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS sms_opted_out_at timestamptz;

-- 3. SMS conversations (one per business + phone_number pair)
CREATE TABLE IF NOT EXISTS sms_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  phone_number text NOT NULL,
  last_message_at timestamptz DEFAULT now(),
  last_message_preview text,
  unread_count int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, phone_number)
);

-- 4. SMS messages
CREATE TABLE IF NOT EXISTS sms_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES sms_conversations(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('inbound','outbound')),
  body text NOT NULL,
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('queued','sent','delivered','failed','received','undelivered')),
  twilio_message_sid text,
  sent_by text NOT NULL DEFAULT 'system' CHECK (sent_by IN ('system','ai','human','vapi','winback','review_request','dispatch','callback')),
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 5. RLS
ALTER TABLE sms_conversations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS client_sms_conversations ON sms_conversations;
CREATE POLICY client_sms_conversations ON sms_conversations
  FOR ALL TO authenticated
  USING (business_id = private.get_current_client_id())
  WITH CHECK (business_id = private.get_current_client_id());

ALTER TABLE sms_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS client_sms_messages ON sms_messages;
CREATE POLICY client_sms_messages ON sms_messages
  FOR ALL TO authenticated
  USING (business_id = private.get_current_client_id())
  WITH CHECK (business_id = private.get_current_client_id());

-- 6. Realtime publication for the live inbox
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'sms_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE sms_messages;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'sms_conversations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE sms_conversations;
  END IF;
END $$;

-- 7. Indexes
CREATE INDEX IF NOT EXISTS idx_sms_conversations_business_id ON sms_conversations(business_id);
CREATE INDEX IF NOT EXISTS idx_sms_conversations_business_last_msg ON sms_conversations(business_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_sms_conversations_contact_id ON sms_conversations(contact_id);
CREATE INDEX IF NOT EXISTS idx_sms_messages_conversation_id ON sms_messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_sms_messages_business_id ON sms_messages(business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sms_messages_twilio_sid ON sms_messages(twilio_message_sid) WHERE twilio_message_sid IS NOT NULL;

-- 8. Trigger to keep updated_at fresh on sms_conversations
CREATE OR REPLACE FUNCTION sms_conversations_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sms_conversations_set_updated_at ON sms_conversations;
CREATE TRIGGER trg_sms_conversations_set_updated_at
  BEFORE UPDATE ON sms_conversations
  FOR EACH ROW EXECUTE FUNCTION sms_conversations_set_updated_at();

COMMIT;
