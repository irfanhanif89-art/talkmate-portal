// Session 19 — internal-only operator alerts.
//
// notifyAdminOfSmsFailure(): fires a Telegram message to Irfan's admin
// chat when an SMS send fails. Keeps client-facing surfaces clean —
// clients never see "Failed" status anywhere in the portal.
//
// Uses the dispatch/master TELEGRAM_BOT_TOKEN (same bot Donna's
// OpenClaw integration uses) and a single TELEGRAM_ADMIN_CHAT_ID that
// Donna populates after deploy. If either env var is unset, the helper
// silently no-ops — never throws into the caller.

const TG_BASE = 'https://api.telegram.org/bot'

interface FailedSms {
  to_phone: string | null
  message: string | null
  sms_type: string | null
  error_message?: string | null
}

export async function notifyAdminOfSmsFailure(opts: {
  businessName: string | null
  vapiCallId: string | null
  failedSms: FailedSms[]
}): Promise<void> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID
  if (!botToken || !chatId) return
  if (opts.failedSms.length === 0) return

  const lines: string[] = []
  lines.push(`⚠️ SMS delivery failure: ${opts.businessName ?? 'unknown business'}`)
  lines.push(`Call: ${opts.vapiCallId ?? 'n/a'}`)
  lines.push(`${opts.failedSms.length} message(s) failed:`)
  for (const s of opts.failedSms.slice(0, 5)) {
    const body = (s.message ?? '').replace(/\s+/g, ' ').slice(0, 120)
    lines.push(`• [${s.sms_type ?? 'unknown'}] -> ${s.to_phone ?? 'unknown'}: ${body}`)
    if (s.error_message) lines.push(`  reason: ${s.error_message.slice(0, 200)}`)
  }
  const text = lines.join('\n')

  try {
    await fetch(`${TG_BASE}${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
      }),
    })
  } catch {
    // Swallow — alerting is best-effort.
  }
}
