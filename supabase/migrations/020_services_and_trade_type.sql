-- Migration 020: Industry service fields.
-- Adds two new columns on businesses to power the per-industry "Services
-- and Pricing" template UI in the Agent Builder tab.
--
--   services    JSONB array of { id, name, price, unit, enabled, custom }
--   trade_type  TEXT  sub-type for the 'trades' industry
--                     (plumber | electrician | locksmith | builder | air_conditioning)
--
-- Existing RLS policies on businesses already cover both columns. No new
-- policies, no new tables.
--
-- These are intentionally separate from the existing
-- notifications_config.service_pricing object that Hume Towing uses for
-- their vehicle-class pricing matrix. That data is preserved as-is.

ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS services JSONB DEFAULT '[]'::jsonb;

ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS trade_type TEXT DEFAULT NULL;
