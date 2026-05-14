// TalkMate Command — bot provisioning.
//
// Why this file is a "pending row + manual finaliser" rather than a
// full BotFather automation:
//   * BotFather is itself a Telegram bot. Telegram's Bot API doesn't
//     let one bot create another. The only way to drive BotFather is
//     via a *userbot* (a regular user account with TDLib/MTProto),
//     which needs phone-number OTP login and is not appropriate as a
//     background job in a SaaS.
//   * The Session 12 brief explicitly anticipates this and says: fall
//     back to a `pending` row, document the manual flow, do not block
//     the feature on automation reliability.
//
// So the flow is:
//   1. createTelegramBotForClient — called on client activation. Inserts
//      a pending command_bots row, reserves a candidate username, and
//      assigns a WhatsApp number from the Twilio pool if available.
//   2. (Manual)   Donna creates the bot via @BotFather and copies the
//      token into the admin Command tab.
//   3. finaliseTelegramBot — called by the admin Command-tab action.
//      Reads the bot username back from Telegram's getMe, saves the
//      token, sets the webhook, and flips command_bots.status to
//      'active'.
//
// Donna's existing OpenClaw bot (TELEGRAM_BOT_TOKEN) is never touched
// here. Per-client bots use their own tokens stored in command_bots.

import { createAdminClient } from './supabase/server'
import { setTelegramWebhook } from './telegram-messenger'

const TG_BASE = 'https://api.telegram.org/bot'

export interface CreateBotResult {
  status: 'pending' | 'active' | 'failed' | 'disabled'
  botToken?: string
  botUsername?: string
  botName?: string
  whatsappNumber?: string
  manualSetupRequired: boolean
  error?: string
}

export async function createTelegramBotForClient(params: {
  clientId: string
  businessName: string
}): Promise<CreateBotResult> {
  const admin = createAdminClient()

  // Don't double-provision: if a bot already exists for this client,
  // return its current state. Reactivation flows shouldn't reset state.
  const { data: existing } = await admin
    .from('command_bots')
    .select('*')
    .eq('client_id', params.clientId)
    .maybeSingle()
  if (existing) {
    return {
      status: existing.status,
      botToken: existing.telegram_bot_token ?? undefined,
      botUsername: existing.telegram_bot_username ?? undefined,
      botName: existing.telegram_bot_name ?? undefined,
      whatsappNumber: existing.whatsapp_number ?? undefined,
      manualSetupRequired: !existing.telegram_bot_token,
    }
  }

  // Pre-compute candidate identifiers. The actual bot name/username are
  // confirmed (or replaced) by the admin during the manual creation step.
  const candidateName = buildBotName(params.businessName)
  const candidateUsername = buildBotUsername(params.businessName)
  // WhatsApp is hidden from the client UI for now, but the backend
  // webhook is still wired up. Until Donna has a real Twilio pool
  // number assigned per client, the env var holds a placeholder like
  // 'pending' — we coerce any non-E.164-looking value to NULL so the
  // UNIQUE index on command_bots.whatsapp_number doesn't collide
  // across clients sharing the same placeholder.
  const whatsappNumber = sanitiseWhatsappNumber(process.env.TWILIO_WHATSAPP_POOL_NUMBER)

  const { error } = await admin.from('command_bots').insert({
    client_id: params.clientId,
    telegram_bot_name: candidateName,
    telegram_bot_username: candidateUsername,
    whatsapp_number: whatsappNumber,
    status: 'pending',
  })
  if (error) {
    return {
      status: 'failed',
      manualSetupRequired: true,
      error: error.message,
    }
  }

  // Mark the business as command-enabled even before manual setup so the
  // /settings/command page renders and the onboarding step appears. Bot
  // remains pending until Donna pastes the BotFather token.
  await admin
    .from('businesses')
    .update({ command_enabled: true })
    .eq('id', params.clientId)

  return {
    status: 'pending',
    botName: candidateName,
    botUsername: candidateUsername,
    whatsappNumber: whatsappNumber ?? undefined,
    manualSetupRequired: true,
  }
}

export interface FinaliseBotResult {
  ok: boolean
  botUsername?: string
  botName?: string
  webhookSet: boolean
  error?: string
}

export async function finaliseTelegramBot(params: {
  clientId: string
  botToken: string
  publicBaseUrl: string  // e.g. https://app.talkmate.com.au
}): Promise<FinaliseBotResult> {
  const admin = createAdminClient()
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET
  if (!secret) {
    return { ok: false, webhookSet: false, error: 'TELEGRAM_WEBHOOK_SECRET is not set' }
  }

  // 1. Verify the token by calling getMe — Telegram returns 401 on a bad
  //    token, so this is the cheapest way to validate before we save it.
  const me = await tgGetMe(params.botToken)
  if (!me.ok || !me.username) {
    return { ok: false, webhookSet: false, error: me.error ?? 'getMe failed' }
  }

  // 2. Save token + canonical username/name from Telegram.
  const { error: upErr } = await admin
    .from('command_bots')
    .update({
      telegram_bot_token: params.botToken,
      telegram_bot_username: me.username,
      telegram_bot_name: me.firstName ?? me.username,
      status: 'active',
    })
    .eq('client_id', params.clientId)
  if (upErr) {
    return { ok: false, webhookSet: false, error: upErr.message }
  }

  // 3. Point the bot at our per-client webhook.
  const webhookUrl = `${stripTrailingSlash(params.publicBaseUrl)}/api/command/telegram/${params.clientId}`
  const webhookSet = await setTelegramWebhook({
    botToken: params.botToken,
    webhookUrl,
    secretToken: secret,
  })

  return {
    ok: true,
    botUsername: me.username,
    botName: me.firstName ?? me.username,
    webhookSet,
  }
}

// ── helpers ─────────────────────────────────────────────────────────────

function buildBotName(businessName: string): string {
  // Telegram bot names are capped at 64 chars.
  const base = `${businessName.trim()} TalkMate`
  return base.slice(0, 64)
}

function buildBotUsername(businessName: string): string {
  // Telegram username rules: 5-32 chars, must end with "bot",
  // [a-zA-Z0-9_], case-insensitive uniqueness. The actual creation
  // happens in BotFather so we only suggest a candidate.
  const sanitised = businessName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 16) || 'client'
  const suffix = Math.floor(1000 + Math.random() * 9000)
  let candidate = `talkmate_${sanitised}_${suffix}_bot`
  // Ensure final length <= 32 chars by trimming the sanitised slug.
  if (candidate.length > 32) {
    const overflow = candidate.length - 32
    const trimmed = sanitised.slice(0, Math.max(2, sanitised.length - overflow))
    candidate = `talkmate_${trimmed}_${suffix}_bot`
  }
  return candidate
}

function stripTrailingSlash(s: string): string {
  return s.endsWith('/') ? s.slice(0, -1) : s
}

// Accept E.164-shaped numbers (e.g. "+61412345678"); coerce anything
// else (empty, "pending", "tbc", etc.) to null so the unique index on
// command_bots.whatsapp_number doesn't collide when many clients share
// a placeholder env value.
function sanitiseWhatsappNumber(raw: string | undefined | null): string | null {
  const v = (raw ?? '').trim()
  if (!v) return null
  if (!/^\+\d{8,15}$/.test(v)) return null
  return v
}

interface TgMeResult { ok: boolean; username?: string; firstName?: string; error?: string }

async function tgGetMe(botToken: string): Promise<TgMeResult> {
  try {
    const res = await fetch(`${TG_BASE}${botToken}/getMe`)
    const data = await res.json().catch(() => ({})) as {
      ok?: boolean
      result?: { username?: string; first_name?: string }
      description?: string
    }
    if (!res.ok || !data.ok || !data.result?.username) {
      return { ok: false, error: data.description ?? `getMe HTTP ${res.status}` }
    }
    return { ok: true, username: data.result.username, firstName: data.result.first_name }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
