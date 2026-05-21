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

// Session 22B — admin quality alert.
//
// Fires a Telegram message to the operator chat when a call is scored
// low or with a critical flag. Trigger logic lives in the caller
// (score-call-async). This function is purely the delivery shim and is
// fire-and-forget: it must never throw. Telegram delivery failures are
// not retried — the next flagged call gets its own attempt and the
// daily digest cron picks up anything missed.
//
// Markdown notes for the message body:
// - Legacy Markdown mode is used so [text](url) works for the portal
//   link. Underscores in fields like the caller phone or business name
//   need escaping; everything else is safe.

const PORTAL_BASE = 'https://app.talkmate.com.au'

// Escape characters that Telegram's legacy Markdown parser treats as
// formatting markers. Underscore is the only one that commonly bites
// (phone numbers don't have any, but business names sometimes do).
function escapeMarkdown(s: string | null | undefined): string {
  if (!s) return ''
  return s.replace(/([_*`\[\]])/g, '\\$1')
}

export async function notifyAdminOfQualityIssue(params: {
  businessName: string
  businessId: string
  callerPhone: string
  score: number
  flags: string[]
  summary: string
  vapiCallId: string
  callId: string
}): Promise<void> {
  try {
    const {
      businessName, businessId, callerPhone,
      score, flags, summary,
    } = params

    const botToken = process.env.TELEGRAM_BOT_TOKEN
    const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID
    if (!botToken || !chatId) return // silent no-op when not configured

    const flagLabels: Record<string, string> = {
      agent_error: 'Agent error',
      sms_mismatch: 'SMS mismatch',
      missed_lead: 'Missed lead',
      dropped_call: 'Dropped call',
      wrong_info: 'Wrong information given',
      short_call: 'Short call',
      no_resolution: 'No resolution',
      caller_frustrated: 'Caller frustrated',
      agent_promise: 'Agent promise',
      warm_lead: 'Warm lead',
      vip_not_transferred: 'VIP not transferred',
    }

    // Drop noisy flags from the visible chip list (the trigger logic
    // upstream already decided this call is worth alerting on; the
    // chips below are the headline reasons).
    const flagText = flags
      .filter(f => f !== 'short_call' && f !== 'no_resolution')
      .map(f => flagLabels[f] ?? f)
      .join(', ')

    const scoreEmoji = score < 3 ? '🔴' : score < 5 ? '🟠' : '🟡'

    // Real admin calls view lives under
    // /admin/clients/[clientId]/portal/calls (see app router tree).
    const portalLink = `${PORTAL_BASE}/admin/clients/${businessId}/portal/calls`

    const message = [
      `${scoreEmoji} *TalkMate Quality Alert*`,
      ``,
      `*Client:* ${escapeMarkdown(businessName)}`,
      `*Caller:* ${escapeMarkdown(callerPhone)}`,
      `*Score:* ${score}/10`,
      `*Flags:* ${escapeMarkdown(flagText || 'Low score')}`,
      ``,
      `*Summary:* ${escapeMarkdown(summary || 'No summary available')}`,
      ``,
      `[Review transcript](${portalLink})`,
    ].join('\n')

    await fetch(`${TG_BASE}${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
      }),
    })
  } catch (e) {
    // Never throw — quality alerts must never break the scoring flow.
    console.error('[notifyAdminOfQualityIssue]', (e as Error).message)
  }
}

// Session 24 — agent health alerts.
//
// Fires when the agent-health-check cron finds a critical config issue,
// when the transcript scanner finds a critical speech pattern, or when
// a webhook gap is detected. Goes to the same admin Telegram chat as
// quality issues but with a distinct emoji + format so Irfan can triage
// at a glance. Like the others, fire-and-forget.

export type AgentHealthAlertKind = 'config_issue' | 'transcript_violation' | 'webhook_gap'

export async function sendAgentHealthAlert(params: {
  kind: AgentHealthAlertKind
  businessName: string
  businessId: string
  vapiAssistantId: string | null
  title: string
  detail: string
  // Optional structured fields rendered when present.
  field?: string
  expected?: unknown
  actual?: unknown
  callTimestamp?: string
  contextSnippet?: string
}): Promise<void> {
  try {
    const botToken = process.env.TELEGRAM_BOT_TOKEN
    const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID
    if (!botToken || !chatId) return

    const emoji =
      params.kind === 'config_issue' ? '🔴' :
      params.kind === 'transcript_violation' ? '⚠️' :
      '📵'

    const headline =
      params.kind === 'config_issue' ? 'AGENT CONFIG ALERT' :
      params.kind === 'transcript_violation' ? 'SPEECH PATTERN' :
      'NO CALLS RECEIVED'

    const lines: string[] = []
    lines.push(`${emoji} ${headline} — ${params.businessName}`)
    lines.push(`Issue: ${params.title}`)
    if (params.detail) lines.push(params.detail)

    if (params.field) lines.push(`Field: ${params.field}`)
    if (params.expected !== undefined) {
      lines.push(`Expected: ${formatJsonish(params.expected)}`)
    }
    if (params.actual !== undefined) {
      lines.push(`Actual: ${formatJsonish(params.actual)}`)
    }
    if (params.contextSnippet) {
      lines.push(`Context: "${params.contextSnippet}"`)
    }
    if (params.callTimestamp) {
      lines.push(`Call: ${params.callTimestamp}`)
    }
    if (params.vapiAssistantId) {
      lines.push(``)
      lines.push(`Assistant ID: ${params.vapiAssistantId}`)
    }

    if (params.kind === 'config_issue' && params.vapiAssistantId && params.field) {
      lines.push(``)
      lines.push(`Donna fix: PATCH assistant ${params.vapiAssistantId}`)
      lines.push(`Set ${params.field} to ${formatJsonish(params.expected)}`)
      lines.push(`GET full assistant first. Send complete model object in PATCH. Never partial.`)
    }

    await fetch(`${TG_BASE}${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: lines.join('\n'),
        disable_web_page_preview: true,
      }),
    })
  } catch (e) {
    console.error('[sendAgentHealthAlert]', (e as Error).message)
  }
}

function formatJsonish(value: unknown): string {
  if (value === null || value === undefined) return String(value)
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}
