-- ============================================================
-- Migration 084: call side-effects idempotency stamp
--
-- The push webhook /api/webhooks/vapi (which used to fire the post-call
-- side-effects: owner call-alert SMS + missed-call win-back SMS) has been
-- returning 401 on every live inbound call since ~early June 2026 (Vapi-side
-- secret problem, unfixable from our end). Live calls are now ingested by the
-- pull cron /api/cron/vapi-call-sync, which was deliberately side-effect-free,
-- so those two texts silently stopped firing for live clients.
--
-- This stamp lets BOTH paths run the side-effects exactly once: whichever path
-- processes a call first atomically claims `side_effects_at`; the other path
-- (and repeated cron cycles) sees it set and skips, so no caller or owner is
-- ever double-texted.
--
-- Additive, IF NOT EXISTS, safe to re-run.
-- ============================================================

ALTER TABLE calls
  ADD COLUMN IF NOT EXISTS side_effects_at timestamptz;
