-- ============================================================
-- Migration 085: Day 1 Integrations
-- Zapier + HubSpot + Google Business Profile + MYOB
-- All columns additive, IF NOT EXISTS, safe to re-run.
--
-- Per-call integration fires (Zapier/HubSpot/MYOB) ride the existing
-- runCallSideEffects() path and its `calls.side_effects_at` exactly-once claim
-- (migration 084) — no separate stamp needed here.
-- ============================================================

-- ZAPIER (the hook URL itself is the credential — per-business, revocable, plain text)
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS zapier_webhook_url text,
  ADD COLUMN IF NOT EXISTS zapier_connected_at timestamptz,
  ADD COLUMN IF NOT EXISTS zapier_last_triggered_at timestamptz;

-- HUBSPOT (tokens AES-256-GCM encrypted, tm1: prefix, INTEGRATION_ENCRYPTION_KEY)
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS hubspot_access_token text,
  ADD COLUMN IF NOT EXISTS hubspot_refresh_token text,
  ADD COLUMN IF NOT EXISTS hubspot_portal_id text,
  ADD COLUMN IF NOT EXISTS hubspot_connected_at timestamptz;

-- GOOGLE BUSINESS PROFILE
-- Reuses the existing google_refresh_token from migration 080 (no new OAuth).
-- Access tokens are minted on demand from the refresh token. This only adds the
-- selected GBP location identifier and pulled display name.
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS google_business_location_id text,   -- e.g. accounts/123/locations/456
  ADD COLUMN IF NOT EXISTS google_business_name text,          -- pulled from GBP
  ADD COLUMN IF NOT EXISTS google_business_connected_at timestamptz;

-- MYOB (tokens AES-256-GCM encrypted, tm1: prefix, INTEGRATION_ENCRYPTION_KEY)
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS myob_access_token text,
  ADD COLUMN IF NOT EXISTS myob_refresh_token text,
  ADD COLUMN IF NOT EXISTS myob_company_id text,
  ADD COLUMN IF NOT EXISTS myob_company_name text,
  ADD COLUMN IF NOT EXISTS myob_connected_at timestamptz;
