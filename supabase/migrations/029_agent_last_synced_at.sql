-- Migration 029: track when the portal last pushed agent config to Vapi.
-- Surfaced on the Settings → AI Voice Agent page under the Sync Agent button.

ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS agent_last_synced_at timestamptz;
