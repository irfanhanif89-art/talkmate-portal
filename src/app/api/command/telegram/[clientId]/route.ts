// TalkMate Command — Telegram inbound webhook.
//
// Per-client endpoint. Each client has their own Telegram bot pointed at
// /api/command/telegram/<their clientId>. Telegram sends each update
// with the shared TELEGRAM_WEBHOOK_SECRET in the
// `X-Telegram-Bot-Api-Secret-Token` header (set when we call
// setWebhook in telegram-bot-creator.ts).
//
// Security model:
//   * Reject any request without the matching secret header (403).
//   * On first message: pin the chat_id to the bot record. From then on,
//     reject messages from any other chat_id so a leaked username can't
//     impersonate the owner.
//   * Use service-role Supabase client only — webhooks have no user
//     session, and RLS would block all the dispatch queries we need.

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { parseCommand } from '@/lib/command-parser'
import { executeCommand } from '@/lib/command-executor'
import { sendTelegramMessage } from '@/lib/telegram-messenger'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ clientId: string }> },
) {
  // 1. Verify the per-call secret. Telegram only sends this header on
  //    webhooks we configured with secret_token. Always return 200 from
  //    here on so Telegram doesn't retry — log issues by responding to
  //    the user where possible.
  const secret = request.headers.get('x-telegram-bot-api-secret-token')
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const { clientId } = await params
  if (!clientId) return NextResponse.json({ ok: true })

  // 2. Parse the Telegram update. Non-message updates (edits, channel
  //    posts, etc.) are ignored gracefully.
  const update = await request.json().catch(() => null) as TelegramUpdate | null
  const message = update?.message
  if (!message?.text || !message.chat?.id) {
    return NextResponse.json({ ok: true })
  }
  const chatId = String(message.chat.id)
  const text = message.text.trim()
  if (!text) return NextResponse.json({ ok: true })

  // 3. Look up the client's bot record. No bot record = the webhook is
  //    pointing at the wrong endpoint or the client was deleted.
  const supabase = createAdminClient()
  const { data: bot } = await supabase
    .from('command_bots')
    .select('*')
    .eq('client_id', clientId)
    .maybeSingle()
  if (!bot) {
    return NextResponse.json({ ok: true })
  }

  // 4. First message from this client — pin the chat_id, send welcome.
  if (!bot.telegram_chat_id) {
    await supabase
      .from('command_bots')
      .update({
        telegram_chat_id: chatId,
        telegram_enabled: true,
        telegram_activated_at: new Date().toISOString(),
        status: 'active',
      })
      .eq('client_id', clientId)

    if (bot.telegram_bot_token) {
      await sendTelegramMessage({
        chatId,
        botToken: bot.telegram_bot_token,
        message: welcomeMessage(),
      })
    }
    return NextResponse.json({ ok: true })
  }

  // 5. Strict chat_id check — leaked usernames can't impersonate.
  if (bot.telegram_chat_id !== chatId) {
    if (bot.telegram_bot_token) {
      await sendTelegramMessage({
        chatId,
        botToken: bot.telegram_bot_token,
        message: 'This bot is not linked to your account. Contact TalkMate support.',
      })
    }
    return NextResponse.json({ ok: true })
  }

  // 6. Parse → execute → reply → log. Failures still log to history so
  //    Donna can see them in the admin Command tab.
  let response: string
  let success = true
  let errorMessage: string | null = null
  let parsedIntent: string = 'unknown'
  let actionTaken: string | null = null

  try {
    const parsed = await parseCommand(text)
    parsedIntent = parsed.intent
    response = await executeCommand(clientId, parsed, supabase)
    actionTaken = parsed.intent !== 'unknown' ? parsed.intent : null
  } catch (e) {
    success = false
    errorMessage = (e as Error).message
    response = `❌ Something went wrong handling that. Try again in a moment.`
  }

  await supabase.from('command_history').insert({
    client_id: clientId,
    platform: 'telegram',
    raw_message: text,
    parsed_intent: parsedIntent,
    action_taken: actionTaken,
    success,
    error_message: errorMessage,
    response_sent: response,
  })

  await supabase
    .from('command_bots')
    .update({
      last_command_at: new Date().toISOString(),
      total_commands: (bot.total_commands ?? 0) + 1,
    })
    .eq('client_id', clientId)

  if (bot.telegram_bot_token) {
    await sendTelegramMessage({
      chatId,
      botToken: bot.telegram_bot_token,
      message: response,
    })
  }

  return NextResponse.json({ ok: true })
}

// ── helpers ─────────────────────────────────────────────────────────────

function welcomeMessage(): string {
  return (
    `👋 Welcome to TalkMate Command!\n\n` +
    `I can help you manage your jobs and dispatcher straight from Telegram.\n\n` +
    `Here's what you can ask me:\n` +
    `• "We're busy for 2 hours"\n` +
    `• "Stop taking jobs" / "Back online"\n` +
    `• "Show today's jobs"\n` +
    `• "Assign JOB-0042 to Dave"\n` +
    `• "JOB-0042 is done"\n` +
    `• "Any bookings?"\n\n` +
    `Just send a message in plain English — I'll work out the rest.`
  )
}

interface TelegramUpdate {
  message?: {
    text?: string
    chat?: { id?: number | string }
  }
}
