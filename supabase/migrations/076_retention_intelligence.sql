-- Migration 076: Retention Intelligence (Session 4B, Phase A)
-- Additive only. All IF NOT EXISTS. No locking rewrites of calls/businesses.
-- Verified facts: get_current_client_id() returns businesses.id; reuse
-- businesses.referred_by (no referred_by_business_id); no activated_at (derive
-- from payment_confirmed_at/golive_verified_at/trial_converted_at); frustration
-- signals live in calls.intelligence_flags (jsonb) — only needs_review state is new.

BEGIN;

-- Transcript gaps: questions the agent could not answer.
-- industry denormalised on insert for future cross-industry aggregation.
CREATE TABLE IF NOT EXISTS transcript_gaps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  call_id UUID REFERENCES calls(id) ON DELETE SET NULL,
  industry TEXT,
  question TEXT NOT NULL,
  context TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','accepted','dismissed','added_to_kb')),
  kb_entry_id UUID REFERENCES knowledge_base_entries(id) ON DELETE SET NULL,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  actioned_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Review-queue state for calls flagged by the existing intelligence pass.
-- Signals themselves are merged into the existing calls.intelligence_flags jsonb.
ALTER TABLE calls
  ADD COLUMN IF NOT EXISTS needs_review BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS needs_review_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

-- Billing contact + monthly summary.
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS billing_contact_name TEXT,
  ADD COLUMN IF NOT EXISTS billing_contact_email TEXT,
  ADD COLUMN IF NOT EXISTS monthly_summary_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_monthly_summary_sent_at TIMESTAMPTZ;

-- Referral codes (the referrer link reuses existing businesses.referred_by).
CREATE TABLE IF NOT EXISTS referral_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  used_by_business_id UUID REFERENCES businesses(id) ON DELETE SET NULL,
  credit_applied BOOLEAN NOT NULL DEFAULT false,
  credit_applied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (business_id)
);

-- Cancellation data.
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
  ADD COLUMN IF NOT EXISTS cancellation_reason_detail TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancellation_save_sent BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cancellation_save_sent_at TIMESTAMPTZ;

-- Upgrade-prompt tracking.
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS upgrade_prompt_last_shown_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS upgrade_prompt_dismissed_count INT NOT NULL DEFAULT 0;

-- Referral-prompt tracking + chatbot attribution.
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS referral_prompt_sent BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS referral_prompt_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS chatbot_show_powered_by BOOLEAN NOT NULL DEFAULT false;

-- Owner marketing-SMS consent (Spam Act). Referral SMS only sends when true.
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS owner_marketing_sms_consent BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS owner_marketing_sms_consent_at TIMESTAMPTZ;

-- Feature-discovery banner dismissals.
CREATE TABLE IF NOT EXISTS banner_dismissals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  banner_key TEXT NOT NULL,
  dismissed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (business_id, banner_key)
);

-- RLS (get_current_client_id() returns businesses.id — verified).
ALTER TABLE transcript_gaps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS client_transcript_gaps ON transcript_gaps;
CREATE POLICY client_transcript_gaps ON transcript_gaps
  FOR ALL TO authenticated
  USING (business_id = private.get_current_client_id())
  WITH CHECK (business_id = private.get_current_client_id());

ALTER TABLE referral_codes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS client_referral_codes ON referral_codes;
CREATE POLICY client_referral_codes ON referral_codes
  FOR ALL TO authenticated
  USING (business_id = private.get_current_client_id())
  WITH CHECK (business_id = private.get_current_client_id());

ALTER TABLE banner_dismissals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS client_banner_dismissals ON banner_dismissals;
CREATE POLICY client_banner_dismissals ON banner_dismissals
  FOR ALL TO authenticated
  USING (business_id = private.get_current_client_id())
  WITH CHECK (business_id = private.get_current_client_id());

-- Indexes.
CREATE INDEX IF NOT EXISTS idx_transcript_gaps_business ON transcript_gaps(business_id, status, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_transcript_gaps_call ON transcript_gaps(call_id) WHERE call_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transcript_gaps_industry ON transcript_gaps(industry, status);
CREATE INDEX IF NOT EXISTS idx_referral_codes_code ON referral_codes(code);
CREATE INDEX IF NOT EXISTS idx_banner_dismissals_business ON banner_dismissals(business_id, banner_key);
CREATE INDEX IF NOT EXISTS idx_calls_needs_review ON calls(business_id, needs_review) WHERE needs_review = true;

COMMIT;
