-- Contacts table for email-scraped customer recognition
CREATE TABLE IF NOT EXISTS contacts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
  name text,
  email text,
  phone text, -- E.164 format: +61412345678
  company text,
  first_seen timestamptz DEFAULT now(),
  last_interaction timestamptz,
  service_history jsonb DEFAULT '[]'::jsonb,
  ai_context text,
  confidence numeric DEFAULT 0.5,
  is_verified boolean DEFAULT false,
  source text DEFAULT 'email_scan', -- email_scan | manual | call
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Fast lookup by phone (this is the hot path — called on every inbound call)
CREATE INDEX IF NOT EXISTS contacts_phone_idx ON contacts (business_id, phone);
CREATE INDEX IF NOT EXISTS contacts_email_idx ON contacts (business_id, email);

-- RLS
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contacts_owner" ON contacts
  USING (business_id IN (
    SELECT id FROM businesses WHERE owner_user_id = auth.uid()
  ));

-- Email scan jobs table (tracks progress)
CREATE TABLE IF NOT EXISTS email_scan_jobs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
  status text DEFAULT 'pending', -- pending | running | complete | failed
  emails_scanned integer DEFAULT 0,
  contacts_found integer DEFAULT 0,
  error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE email_scan_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "scan_jobs_owner" ON email_scan_jobs
  USING (business_id IN (
    SELECT id FROM businesses WHERE owner_user_id = auth.uid()
  ));
