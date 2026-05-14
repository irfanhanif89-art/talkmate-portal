// TalkMate Command — Telegram helpers.
//
// Two small wrappers around the Telegram Bot API:
//   1. sendTelegramMessage — outbound reply, fire-and-forget.
//   2. setTelegramWebhook  — point a newly-created bot at our webhook.
//
// These are deliberately thin so they can be unit-tested by mocking
// global fetch. No SDK dependency.
//
// Donna's external OpenClaw bot uses a separate token (the env var
// TELEGRAM_BOT_TOKEN); these helpers always accept the per-client token
// as a parameter so we never accidentally use Donna's credentials here.

const TG_BASE = 'https://api.telegram.org/bot'

export interface SendMessageParams {
  chatId: string
  botToken: string
  message: string
}

export async function sendTelegramMessage(params: SendMessageParams): Promise<void> {
  if (!params.botToken || params.botToken === '?' || !params.chatId) return
  try {
    await fetch(`${TG_BASE}${params.botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: params.chatId,
        text: params.message,
        disable_web_page_preview: true,
      }),
    })
  } catch {
    // fire and forget — webhook stays 200 even if the reply fails
  }
}

export interface SetWebhookParams {
  botToken: string
  webhookUrl: string
  secretToken: string
}

export async function setTelegramWebhook(params: SetWebhookParams): Promise<boolean> {
  if (!params.botToken) return false
  try {
    const res = await fetch(`${TG_BASE}${params.botToken}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: params.webhookUrl,
        secret_token: params.secretToken,
        allowed_updates: ['message'],
      }),
    })
    if (!res.ok) return false
    const data = await res.json().catch(() => ({})) as { ok?: boolean }
    return data.ok === true
  } catch {
    return false
  }
}

export interface DeleteWebhookParams {
  botToken: string
}

export async function deleteTelegramWebhook(params: DeleteWebhookParams): Promise<boolean> {
  if (!params.botToken) return false
  try {
    const res = await fetch(`${TG_BASE}${params.botToken}/deleteWebhook`, { method: 'POST' })
    if (!res.ok) return false
    const data = await res.json().catch(() => ({})) as { ok?: boolean }
    return data.ok === true
  } catch {
    return false
  }
}
