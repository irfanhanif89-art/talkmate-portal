-- Migration 005: Partner / Refer & Earn Program
-- Run in Supabase SQL editor

-- partners table
CREATE TABLE IF NOT EXISTS partners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  referral_slug VARCHAR UNIQUE NOT NULL,
  referral_link VARCHAR NOT NULL,
  stripe_account_id VARCHAR,
  stripe_onboarding_complete BOOLEAN DEFAULT false,
  bank_verified BOOLEAN DEFAULT false,
  tier VARCHAR DEFAULT 'starter' CHECK (tier IN ('starter', 'silver', 'gold')),
  tier_rate DECIMAL DEFAULT 0.15,
  total_referrals INTEGER DEFAULT 0,
  active_referrals INTEGER DEFAULT 0,
  pending_payout DECIMAL DEFAULT 0.00,
  total_earned DECIMAL DEFAULT 0.00,
  last_paid_at TIMESTAMP WITH TIME ZONE,
  last_paid_amount DECIMAL,
  payout_status VARCHAR DEFAULT 'pending' CHECK (payout_status IN ('pending', 'processing', 'paid', 'failed')),
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id)
);

-- referrals table
CREATE TABLE IF NOT EXISTS referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID REFERENCES partners(id) ON DELETE CASCADE,
  referred_user_id UUID REFERENCES auth.users(id),
  referred_business_name VARCHAR,
  plan_name VARCHAR,
  subscription_amount DECIMAL,
  status VARCHAR DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'churned')),
  monthly_earning DECIMAL,
  signup_bonus_paid BOOLEAN DEFAULT false,
  signup_bonus_paid_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  activated_at TIMESTAMP WITH TIME ZONE,
  churned_at TIMESTAMP WITH TIME ZONE
);

-- partner_payouts table
CREATE TABLE IF NOT EXISTS partner_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID REFERENCES partners(id) ON DELETE CASCADE,
  amount DECIMAL NOT NULL,
  stripe_transfer_id VARCHAR,
  status VARCHAR DEFAULT 'processing' CHECK (status IN ('processing', 'paid', 'failed')),
  payout_month VARCHAR,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  paid_at TIMESTAMP WITH TIME ZONE,
  failure_reason VARCHAR,
  receipt_url VARCHAR
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_partners_user_id ON partners(user_id);
CREATE INDEX IF NOT EXISTS idx_partners_slug ON partners(referral_slug);
CREATE INDEX IF NOT EXISTS idx_partners_stripe ON partners(stripe_account_id);
CREATE INDEX IF NOT EXISTS idx_referrals_partner ON referrals(partner_id);
CREATE INDEX IF NOT EXISTS idx_referrals_status ON referrals(status);
CREATE INDEX IF NOT EXISTS idx_payouts_partner ON partner_payouts(partner_id);
CREATE INDEX IF NOT EXISTS idx_payouts_stripe ON partner_payouts(stripe_transfer_id);

-- RLS policies
ALTER TABLE partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_payouts ENABLE ROW LEVEL SECURITY;

-- Partners: users can only see their own record
CREATE POLICY "partners_own" ON partners
  FOR ALL USING (auth.uid() = user_id);

-- Referrals: partners can see their own referrals
CREATE POLICY "referrals_own" ON referrals
  FOR ALL USING (
    partner_id IN (SELECT id FROM partners WHERE user_id = auth.uid())
  );

-- Payouts: partners can see their own payouts
CREATE POLICY "payouts_own" ON partner_payouts
  FOR ALL USING (
    partner_id IN (SELECT id FROM partners WHERE user_id = auth.uid())
  );

-- Service role bypass (for API routes and Make.com)
CREATE POLICY "partners_service" ON partners FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "referrals_service" ON referrals FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "payouts_service" ON partner_payouts FOR ALL TO service_role USING (true) WITH CHECK (true);
