-- Migration 065: Sprint Session 2 follow-up — chatbot hardening
-- Adds the per-business widget domain allowlist (origin lock against
-- lead-spam / Grok-cost abuse) and a fallback flag on chat_messages so the
-- portal can show a deflection rate (how often the bot could not answer).
--
-- businesses.owner_phone (added in 063) is now deprecated: the chat lead
-- notification reuses the existing notifications_config.owner_number from
-- Session 30 instead. The column is left in place to avoid a destructive drop
-- on a table this size; nothing reads it.

BEGIN;

-- 1. Widget domain allowlist. NULL or empty array = allow any origin (the
--    default, so existing embeds keep working until a client configures it).
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS chatbot_allowed_domains text[];

-- 2. Fallback flag: true on an assistant message when the bot used its canned
--    "I will have someone follow up" reply (spam, Grok error, or no answer).
ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS is_fallback boolean NOT NULL DEFAULT false;

-- Partial index for the deflection-rate query (assistant fallbacks per business).
CREATE INDEX IF NOT EXISTS idx_chat_messages_fallback
  ON chat_messages(business_id, created_at)
  WHERE is_fallback = true;

COMMIT;
