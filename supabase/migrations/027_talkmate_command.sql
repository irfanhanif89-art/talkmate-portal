-- Migration 027: TalkMate Command — per-client Telegram and WhatsApp bots.
--
-- Each towing Growth+ client gets their own dedicated Telegram bot with
-- its own token and webhook URL, plus a WhatsApp number from the Twilio
-- pool. Inbound messages are parsed by Grok and dispatched to a small
-- set of intents (set wait time, toggle availability, view jobs, view
-- bookings, assign job, complete job).
--
-- Numbering note: the brief specifies migration 027 even though 025 is
-- the latest committed migration in main; honored to match the build brief.
--
-- Isolation requirements:
--   * One row per client_id (UNIQUE) — no shared bots.
--   * RLS read policies scope to the caller's own business via
--     get_current_client_id() defined in migration 008.
--   * Writes go through the service-role admin client from API routes;
--     no client_write policy is published.
--
-- Donna's separate OpenClaw Telegram bot is not represented here — it
-- runs entirely outside this schema and is unaffected by this migration.

----------------------------------------------------------------------
-- 1. command_bots — one row per client, holds Telegram + WhatsApp creds.
----------------------------------------------------------------------

create table if not exists command_bots (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references businesses(id) on delete cascade,
  -- Telegram per-client bot, created via BotFather automation (or manually).
  telegram_bot_token text,
  telegram_bot_username text,
  telegram_bot_name text,
  telegram_chat_id text,
  telegram_enabled boolean default false,
  telegram_activated_at timestamptz,
  -- WhatsApp routes via the shared Twilio pool number; per-client routing
  -- works by matching the inbound 'To' number to whatsapp_number.
  whatsapp_number text,
  whatsapp_enabled boolean default false,
  whatsapp_activated_at timestamptz,
  status text default 'pending'
    check (status in ('pending', 'active', 'failed', 'disabled')),
  last_command_at timestamptz,
  total_commands int default 0,
  created_at timestamptz default now(),
  unique (client_id)
);

create unique index if not exists idx_command_bots_telegram_username
  on command_bots(telegram_bot_username)
  where telegram_bot_username is not null;

create unique index if not exists idx_command_bots_whatsapp_number
  on command_bots(whatsapp_number)
  where whatsapp_number is not null;

alter table command_bots enable row level security;

create policy "command_bots_client_read" on command_bots
  for select using (client_id = get_current_client_id());

----------------------------------------------------------------------
-- 2. command_history — audit log of every parsed/executed message.
----------------------------------------------------------------------

create table if not exists command_history (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references businesses(id) on delete cascade,
  platform text not null
    check (platform in ('telegram', 'whatsapp')),
  raw_message text not null,
  parsed_intent text,
  action_taken text,
  success boolean default true,
  error_message text,
  response_sent text,
  created_at timestamptz default now()
);

create index if not exists idx_command_history_client_recent
  on command_history(client_id, created_at desc);

alter table command_history enable row level security;

create policy "command_history_client_read" on command_history
  for select using (client_id = get_current_client_id());

----------------------------------------------------------------------
-- 3. businesses.command_enabled — feature gate.
--    Defaults to false; flipped to true by the bot auto-creator on
--    successful activation.
----------------------------------------------------------------------

alter table businesses
  add column if not exists command_enabled boolean default false;

create index if not exists idx_businesses_command_enabled
  on businesses(command_enabled) where command_enabled = true;
