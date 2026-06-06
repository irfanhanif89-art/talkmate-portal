-- 080_google_integration.sql
-- Google account connection for clients (Gmail send + Google Calendar).
--
-- One OAuth connection per business. The refresh token is stored encrypted at
-- rest via src/lib/crypto.ts (tm1: AES-256-GCM). The two *_enabled flags record
-- which downstream features the client has switched on; `google_scopes` records
-- what Google actually granted so a route can verify a scope before using it.
--
-- All columns are nullable/defaulted and additive — safe, inert until the
-- Google OAuth app + GOOGLE_OAUTH_CLIENT_ID/SECRET env vars exist.

ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS google_account_email     TEXT,
  ADD COLUMN IF NOT EXISTS google_refresh_token     TEXT,        -- encrypted (tm1:)
  ADD COLUMN IF NOT EXISTS google_scopes            TEXT,        -- space-delimited granted scopes
  ADD COLUMN IF NOT EXISTS google_connected_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS gmail_enabled            BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS google_calendar_enabled  BOOLEAN NOT NULL DEFAULT false;
