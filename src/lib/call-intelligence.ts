// Session 18 — Call Intelligence
// Claude AI scoring service. Reads a call transcript, asks Claude to
// score it as a quality supervisor, and returns a structured result the
// webhook layer uses to update the calls table and decide whether to
// fire an owner alert or a caller-recovery SMS.
//
// Scoring is always async and isolated: callers must catch their own
// errors. A scoring failure must never block call save.

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = '2023-06-01'

export const INTELLIGENCE_MODEL = 'claude-sonnet-4-6'

export type IntelligenceStatus = 'resolved' | 'review' | 'critical'

export type CallFlagType =
  | 'short_call'
  | 'vip_not_transferred'
  | 'agent_promise'
  | 'caller_frustrated'
  | 'missed_lead'
  | 'warm_lead'
  | 'agent_error'
  | 'no_resolution'

export type CallActionType = 'callback_suggested' | 'review_transcript'

export interface CallFlag {
  type: CallFlagType
  detail: string
}

export interface CallAction {
  type: CallActionType
  phone?: string | null
  reason?: string | null
  context?: string | null
}

export interface CallIntelligenceInput {
  transcript: string
  summary: string | null
  duration_seconds: number | null
  caller_phone: string | null
  outcome: string | null
  business_name: string
  industry: string | null
  vip_callers: Array<{ phone: string; name: string; vip_bypass: boolean }>
}

export interface CallIntelligenceResult {
  score: number
  status: IntelligenceStatus
  summary: string
  flags: CallFlag[]
  actions: CallAction[]
  should_alert_owner: boolean
  alert_message: string | null
  prompt_tokens?: number
  completion_tokens?: number
}

const SYSTEM_PROMPT = `You are a call quality supervisor for an AI voice receptionist at an Australian small business.
Your job is to read call transcripts and identify issues that need the business owner's attention.
You must return ONLY valid JSON. No other text. No markdown. No explanation.
Be concise. Be accurate. Do not flag normal successful calls.`

function last9(phone: string | null | undefined): string | null {
  if (!phone) return null
  const digits = phone.replace(/[^0-9]/g, '')
  return digits.length >= 9 ? digits.slice(-9) : null
}

function detectVip(
  callerPhone: string | null,
  vips: CallIntelligenceInput['vip_callers'],
): { isVip: boolean; name: string | null; bypass: boolean } {
  const target = last9(callerPhone)
  if (!target) return { isVip: false, name: null, bypass: false }
  for (const v of vips) {
    if (last9(v.phone) === target) {
      return { isVip: true, name: v.name ?? null, bypass: !!v.vip_bypass }
    }
  }
  return { isVip: false, name: null, bypass: false }
}

function buildUserPrompt(input: CallIntelligenceInput): string {
  const vip = detectVip(input.caller_phone, input.vip_callers)
  const vipLabel = vip.isVip
    ? `Yes (${vip.name ?? 'unknown name'})`
    : 'No'
  const expected = vip.isVip
    ? (vip.bypass ? 'bypass (do not transfer, take a message)' : 'transfer to owner immediately')
    : 'n/a'

  const transcript = (input.transcript ?? '').slice(0, 14000) || '(no transcript captured)'
  const outcome = input.outcome ?? 'unknown'
  const duration = input.duration_seconds ?? 0

  return [
    `Business: ${input.business_name}`,
    `Industry: ${input.industry ?? 'unspecified'}`,
    `Call duration: ${duration} seconds`,
    `Caller phone: ${input.caller_phone ?? 'unknown'}`,
    `Outcome logged: ${outcome}`,
    `Is VIP caller: ${vipLabel}`,
    `Expected VIP action: ${expected}`,
    '',
    'Transcript:',
    transcript,
    '',
    'Score this call and return this exact JSON structure:',
    '{',
    '  "score": <integer 1-10>,',
    '  "status": <"resolved"|"review"|"critical">,',
    '  "summary": <one sentence, plain English, no jargon>,',
    '  "flags": [',
    '    { "type": <flag_type>, "detail": <specific detail from the transcript> }',
    '  ],',
    '  "actions": [',
    '    { "type": <action_type>, "phone": <phone if callback>, "context": <why> }',
    '  ],',
    '  "should_alert_owner": <true|false>,',
    '  "alert_message": <SMS text under 160 chars, or null>',
    '}',
    '',
    'Flag types to use (only include if genuinely present):',
    '- short_call: under 30 seconds with no clear resolution and not a wrong number',
    '- vip_not_transferred: caller is a VIP but was handled by agent instead of transferred',
    '- agent_promise: agent promised a callback, quote, or follow-up that needs owner action',
    '- caller_frustrated: caller expressed frustration, confusion, or dissatisfaction',
    '- missed_lead: caller enquired about pricing or availability but did not book',
    '- warm_lead: caller expressed interest and is worth calling back',
    '- agent_error: agent gave wrong information, broke character, or failed to handle the call correctly',
    '- no_resolution: call ended without any outcome (no booking, no message, no transfer)',
    '',
    'Action types:',
    '- callback_suggested: owner should call this number back',
    '- review_transcript: owner should read this transcript',
    '',
    'Alert rules — set should_alert_owner to true ONLY if:',
    '- status is critical, OR',
    '- any flag is: vip_not_transferred, agent_promise, warm_lead, or missed_lead with caller interaction > 20 seconds',
    '',
    'For alert_message: write a plain SMS under 160 characters.',
    'Example: "TalkMate: Missed lead. Caller enquired about towing price and hung up. Worth calling back: +61412345678"',
    'Example: "TalkMate: VIP caller (John) was not transferred correctly. Check portal."',
    'Example: "TalkMate: Agent promised a callback to +61412345678. Not yet booked."',
    '',
    'Do not alert for: resolved calls, short wrong-number calls, silent callers, or calls under 10 seconds.',
  ].join('\n')
}

interface AnthropicResponse {
  content?: Array<{ type?: string; text?: string }>
  usage?: { input_tokens?: number; output_tokens?: number }
}

// Extract the JSON object from the model output. The system prompt asks
// for raw JSON, but we still strip code fences as a defensive measure in
// case the model wraps the response.
function parseModelJson(raw: string): unknown {
  const stripped = raw
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim()
  // Find the outermost JSON object boundaries.
  const start = stripped.indexOf('{')
  const end = stripped.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('No JSON object found in model output')
  }
  return JSON.parse(stripped.slice(start, end + 1))
}

function coerceFlag(raw: unknown): CallFlag | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const type = typeof r.type === 'string' ? r.type : ''
  const allowed: CallFlagType[] = [
    'short_call', 'vip_not_transferred', 'agent_promise', 'caller_frustrated',
    'missed_lead', 'warm_lead', 'agent_error', 'no_resolution',
  ]
  if (!(allowed as string[]).includes(type)) return null
  const detail = typeof r.detail === 'string' ? r.detail.slice(0, 400) : ''
  return { type: type as CallFlagType, detail }
}

function coerceAction(raw: unknown): CallAction | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const type = typeof r.type === 'string' ? r.type : ''
  if (type !== 'callback_suggested' && type !== 'review_transcript') return null
  const action: CallAction = { type }
  if (typeof r.phone === 'string') action.phone = r.phone
  if (typeof r.context === 'string') action.context = r.context.slice(0, 240)
  if (typeof r.reason === 'string') action.reason = r.reason.slice(0, 240)
  return action
}

function coerceResult(parsed: unknown): CallIntelligenceResult {
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Model output is not an object')
  }
  const p = parsed as Record<string, unknown>

  const rawScore = Number(p.score)
  const score = Number.isFinite(rawScore) ? Math.min(10, Math.max(1, Math.round(rawScore))) : 5

  let status: IntelligenceStatus = 'review'
  if (p.status === 'resolved' || p.status === 'review' || p.status === 'critical') {
    status = p.status
  }

  const summary = typeof p.summary === 'string' ? p.summary.slice(0, 600).trim() : ''

  const flags: CallFlag[] = Array.isArray(p.flags)
    ? (p.flags.map(coerceFlag).filter(Boolean) as CallFlag[])
    : []

  const actions: CallAction[] = Array.isArray(p.actions)
    ? (p.actions.map(coerceAction).filter(Boolean) as CallAction[])
    : []

  const should_alert_owner = p.should_alert_owner === true
  const alert_message = typeof p.alert_message === 'string'
    ? p.alert_message.slice(0, 320).trim()
    : null

  return {
    score,
    status,
    summary,
    flags,
    actions,
    should_alert_owner,
    alert_message: alert_message || null,
  }
}

// Calls the Anthropic Messages API. Throws on any non-2xx or malformed
// response — the caller is responsible for catching and logging.
export async function scoreCall(input: CallIntelligenceInput): Promise<CallIntelligenceResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not configured')
  }

  const body = {
    model: INTELLIGENCE_MODEL,
    max_tokens: 800,
    temperature: 0,
    system: SYSTEM_PROMPT,
    messages: [
      { role: 'user', content: buildUserPrompt(input) },
    ],
  }

  const res = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`Anthropic HTTP ${res.status}: ${errText.slice(0, 240)}`)
  }

  const data = (await res.json()) as AnthropicResponse
  const text = (data.content ?? [])
    .filter(block => block?.type === 'text' && typeof block.text === 'string')
    .map(block => block.text as string)
    .join('')
    .trim()

  if (!text) {
    throw new Error('Anthropic response had no text content')
  }

  const parsed = parseModelJson(text)
  const result = coerceResult(parsed)
  return {
    ...result,
    prompt_tokens: data.usage?.input_tokens,
    completion_tokens: data.usage?.output_tokens,
  }
}
