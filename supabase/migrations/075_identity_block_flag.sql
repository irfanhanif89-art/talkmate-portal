-- Session 4A v2 (Round 2) — identity-block gating flag.
-- Controls whether the IDENTITY / TRANSFER / CALL FLOW block is injected into a
-- business's Vapi system prompt on KB sync. Defaults FALSE for EVERY existing
-- business, including GM Towing (25443e10) and Spectrum Towing, so no live
-- agent prompt changes. New agents are flipped to true only after the feature
-- is proven on a test agent (staged rollout — see DEPLOYMENT.md).

BEGIN;

ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS identity_block_enabled BOOLEAN DEFAULT false;

COMMIT;
