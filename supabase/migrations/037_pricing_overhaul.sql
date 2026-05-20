-- =============================================
-- PRICING OVERHAUL — MIGRATION 037
-- Adds billing cycle (monthly/annual) tracking and setup fee
-- columns to businesses, leads, and commissions. All changes
-- are additive and idempotent — safe to re-run.
--
-- Run on PREVIEW Supabase only during this session.
-- Production run handled by Donna after merge to main.
--
-- Companion env vars Donna must add in Vercel (one per new
-- Stripe price object created in the Stripe dashboard):
--   STRIPE_STARTER_ANNUAL_PRICE_ID
--   STRIPE_GROWTH_ANNUAL_PRICE_ID
--   STRIPE_PRO_ANNUAL_PRICE_ID
--   STRIPE_STARTER_SETUP_PRICE_ID
--   STRIPE_GROWTH_SETUP_PRICE_ID
--   STRIPE_PRO_SETUP_PRICE_ID
-- =============================================

-- =============================================
-- 1. businesses: billing cycle + setup fee
-- =============================================

ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS billing_cycle TEXT DEFAULT 'monthly';

-- Drop/recreate CHECK so re-running this migration doesn't error
-- when the constraint was added by a previous run.
ALTER TABLE businesses DROP CONSTRAINT IF EXISTS businesses_billing_cycle_check;
ALTER TABLE businesses ADD CONSTRAINT businesses_billing_cycle_check
  CHECK (billing_cycle IN ('monthly', 'annual'));

-- Admin-only flag: when true, no setup fee is charged at checkout.
-- Sales reps cannot set this (write path is admin-only at the API).
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS setup_fee_waived BOOLEAN DEFAULT FALSE;

-- Records what was actually charged at signup. NULL if no signup
-- has happened yet; 0 if waived; otherwise the plan setup fee.
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS setup_fee_amount NUMERIC(10,2);

CREATE INDEX IF NOT EXISTS idx_businesses_billing_cycle ON businesses(billing_cycle);

-- =============================================
-- 2. leads: capture billing cycle on close
-- =============================================

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS won_billing_cycle TEXT DEFAULT 'monthly';

ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_won_billing_cycle_check;
ALTER TABLE leads ADD CONSTRAINT leads_won_billing_cycle_check
  CHECK (won_billing_cycle IN ('monthly', 'annual'));

-- =============================================
-- 3. commissions: bonus column for annual uplift
-- =============================================

-- commission_amount remains the BASE commission. bonus_amount is
-- the additional payout for annual closes (annual_price * 2.5%).
-- Total commission per row = commission_amount + bonus_amount.
ALTER TABLE commissions
  ADD COLUMN IF NOT EXISTS bonus_amount NUMERIC(10,2) DEFAULT 0;
