-- Talkmate Portal — Initial Schema
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── businesses ────────────────────────────────────────────────────────────────
CREATE TABLE businesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone_number text,
  address text,
  business_type text NOT NULL DEFAULT 'other',
  plan text NOT NULL DEFAULT 'starter',
  vapi_agent_id text,
  owner_user_id uuid REFERENCES auth.users NOT NULL,
  abn text,
  website text,
  timezone text DEFAULT 'Australia/Brisbane',
  onboarding_completed boolean DEFAULT false,
  opening_hours jsonb DEFAULT '{}',
  notifications_config jsonb DEFAULT '{}',
  api_key text DEFAULT gen_random_uuid()::text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_all" ON businesses FOR ALL USING (auth.uid() = owner_user_id);

-- ── calls ─────────────────────────────────────────────────────────────────────
CREATE TABLE calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses NOT NULL,
  started_at timestamptz,
  ended_at timestamptz,
  duration_seconds int,
  transcript text,
  recording_url text,
  outcome text,
  transferred boolean DEFAULT false,
  caller_number text,
  flagged boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE calls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_all" ON calls FOR ALL USING (
  business_id IN (SELECT id FROM businesses WHERE owner_user_id = auth.uid())
);

-- ── catalog_items ─────────────────────────────────────────────────────────────
CREATE TABLE catalog_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses NOT NULL,
  name text NOT NULL,
  description text,
  price numeric,
  category text,
  active boolean DEFAULT true,
  upsell_prompt text,
  duration_minutes int,
  is_featured boolean DEFAULT false,
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE catalog_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_all" ON catalog_items FOR ALL USING (
  business_id IN (SELECT id FROM businesses WHERE owner_user_id = auth.uid())
);

-- ── appointments ──────────────────────────────────────────────────────────────
CREATE TABLE appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses NOT NULL,
  call_id uuid REFERENCES calls,
  customer_name text,
  customer_phone text,
  service_type text,
  scheduled_at timestamptz,
  status text DEFAULT 'enquired',
  notes text,
  is_new_customer boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_all" ON appointments FOR ALL USING (
  business_id IN (SELECT id FROM businesses WHERE owner_user_id = auth.uid())
);

-- ── orders ────────────────────────────────────────────────────────────────────
CREATE TABLE orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses NOT NULL,
  call_id uuid REFERENCES calls,
  items jsonb DEFAULT '[]',
  total_amount numeric,
  status text DEFAULT 'received',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_all" ON orders FOR ALL USING (
  business_id IN (SELECT id FROM businesses WHERE owner_user_id = auth.uid())
);

-- ── jobs ──────────────────────────────────────────────────────────────────────
CREATE TABLE jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses NOT NULL,
  call_id uuid REFERENCES calls,
  customer_name text,
  customer_phone text,
  job_type text,
  address text,
  urgency text DEFAULT 'scheduled',
  status text DEFAULT 'new',
  notes text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_all" ON jobs FOR ALL USING (
  business_id IN (SELECT id FROM businesses WHERE owner_user_id = auth.uid())
);

-- ── users (portal users) ──────────────────────────────────────────────────────
CREATE TABLE users (
  id uuid PRIMARY KEY REFERENCES auth.users NOT NULL,
  business_id uuid REFERENCES businesses,
  email text,
  role text DEFAULT 'owner',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "self_read" ON users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "owner_read_team" ON users FOR SELECT USING (
  business_id IN (SELECT id FROM businesses WHERE owner_user_id = auth.uid())
);
CREATE POLICY "self_insert" ON users FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "self_update" ON users FOR UPDATE USING (auth.uid() = id);

-- ── subscriptions ─────────────────────────────────────────────────────────────
CREATE TABLE subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses NOT NULL,
  stripe_subscription_id text UNIQUE,
  stripe_customer_id text,
  plan text,
  status text DEFAULT 'active',
  current_period_end timestamptz
);
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_all" ON subscriptions FOR ALL USING (
  business_id IN (SELECT id FROM businesses WHERE owner_user_id = auth.uid())
);

-- ── notifications ─────────────────────────────────────────────────────────────
CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses NOT NULL,
  type text,
  message text,
  read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_all" ON notifications FOR ALL USING (
  business_id IN (SELECT id FROM businesses WHERE owner_user_id = auth.uid())
);

-- ── onboarding_responses ──────────────────────────────────────────────────────
CREATE TABLE onboarding_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses NOT NULL UNIQUE,
  current_step int DEFAULT 1,
  responses jsonb DEFAULT '{}',
  completed_at timestamptz
);
ALTER TABLE onboarding_responses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_all" ON onboarding_responses FOR ALL USING (
  business_id IN (SELECT id FROM businesses WHERE owner_user_id = auth.uid())
);

-- ── Realtime: enable for calls and notifications ───────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE calls;
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
