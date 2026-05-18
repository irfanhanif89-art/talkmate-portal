// TalkMate Command — Grok intent parser.
//
// Takes a free-text message from a towing client (over Telegram or
// WhatsApp) and returns a structured ParsedCommand so the executor
// can dispatch to the right handler.
//
// Uses the existing Grok client (src/lib/grok.ts) so caching, error
// handling, and JSON-fence stripping are shared with menu import and
// command-centre parsing.

import { grokJson, GrokError } from './grok'

export type CommandIntent =
  | 'set_wait_time'
  | 'toggle_availability'
  | 'view_jobs'
  | 'view_bookings'
  | 'view_calls'
  | 'assign_job'
  | 'complete_job'
  | 'view_quotes'
  | 'view_drivers'
  | 'pause_agent'
  | 'close_day'
  | 'missed_summary'
  | 'vip_lookup'
  | 'unknown'

export interface ParsedCommand {
  intent: CommandIntent
  params: Record<string, unknown>
  confidence: number
}

const SYSTEM_PROMPT = `You are a command parser for TalkMate, an AI
dispatcher for towing businesses. Parse the user's message into
structured JSON only. Respond with strict JSON, no prose.

Intents and expected params:

set_wait_time { minutes: number }
  "busy for 3 hours" -> minutes: 180
  "wait time is 45 minutes" -> minutes: 45
  "flat out for the next 2 hours" -> minutes: 120
  "we're slammed for an hour and a half" -> minutes: 90

toggle_availability { available: boolean }
  "stop taking jobs" -> available: false
  "we're closed" -> available: false
  "back online" -> available: true
  "open for business" -> available: true
  "we're back" -> available: true

view_jobs { filter: "today" | "pending" | "all" }
  "show today's jobs" -> filter: "today"
  "list pending jobs" -> filter: "pending"
  "what jobs do we have" -> filter: "today"
  "all jobs" -> filter: "all"

view_bookings {}
  "any bookings?"
  "show pending bookings"
  "what's booked in"

view_calls { filter: "today" | "missed" | "all" }
  "how many calls today" -> filter: "today"
  "how many calls have come through" -> filter: "today"
  "any missed calls" -> filter: "missed"
  "show recent calls" -> filter: "all"
  "call summary" -> filter: "today"

assign_job { job_number: string, driver_name: string }
  "assign JOB-0042 to Dave" -> job_number: "JOB-0042", driver_name: "Dave"
  "give the container job to Mark" -> use the most recent matching job; if unclear, set job_number to "" so the system can ask.

complete_job { job_number: string }
  "JOB-0042 is done" -> job_number: "JOB-0042"
  "mark job 42 complete" -> job_number: "JOB-0042"

view_quotes { filter: "today" | "all" }
  "any quotes today" -> filter: "today"
  "show recent quotes" -> filter: "today"
  "what quotes came in" -> filter: "today"
  "all quotes" -> filter: "all"

view_drivers {}
  "who is available"
  "driver status"
  "which drivers are on"
  "who is working"

pause_agent { minutes: number }
  "pause agent for 2 hours" -> minutes: 120
  "stop agent for 30 minutes" -> minutes: 30
  "take agent offline for an hour" -> minutes: 60

close_day { day: string, closed: boolean }
  "close on sunday" -> day: "sunday", closed: true
  "we are closed saturday" -> day: "saturday", closed: true
  "open on sunday" -> day: "sunday", closed: false
  "re-open saturday" -> day: "saturday", closed: false
  Normalise day to full lowercase name (sunday, monday, tuesday, wednesday, thursday, friday, saturday).

missed_summary {}
  "what did i miss"
  "catch me up"
  "summary while i was out"
  "what happened today"

vip_lookup { phone: string }
  "is 0412345678 a vip" -> phone: "0412345678"
  "check 0412345678" -> phone: "0412345678"
  "who is 0412345678" -> phone: "0412345678"
  Extract the phone number from the message as-is.

unknown {}
  Anything that doesn't match the above. Do not guess.

Output JSON shape:
{ "intent": "<one of the above>",
  "params": { ... },
  "confidence": 0.0 to 1.0 }

Rules:
- Always include all three keys.
- "confidence" is your honest estimate of the parse quality, 0-1.
- For job_number, normalise to upper-case with a leading "JOB-" and
  4-digit zero pad if a numeric ID is given (e.g. "42" -> "JOB-0042").
- Never return an intent you weren't taught above. Use "unknown" instead.`

const VALID_INTENTS: CommandIntent[] = [
  'set_wait_time',
  'toggle_availability',
  'view_jobs',
  'view_bookings',
  'view_calls',
  'assign_job',
  'complete_job',
  'view_quotes',
  'view_drivers',
  'pause_agent',
  'close_day',
  'missed_summary',
  'vip_lookup',
  'unknown',
]

export async function parseCommand(message: string): Promise<ParsedCommand> {
  const trimmed = message.trim()
  if (!trimmed) {
    return { intent: 'unknown', params: {}, confidence: 0 }
  }

  let raw: unknown
  try {
    raw = await grokJson<unknown>(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: trimmed },
      ],
      { temperature: 0, maxTokens: 256 },
    )
  } catch (e) {
    // Never let a parser failure crash the webhook — surface as unknown
    // so the executor can respond with the help text.
    if (e instanceof GrokError) {
      return { intent: 'unknown', params: {}, confidence: 0 }
    }
    throw e
  }

  return normalise(raw)
}

function normalise(raw: unknown): ParsedCommand {
  if (!raw || typeof raw !== 'object') {
    return { intent: 'unknown', params: {}, confidence: 0 }
  }
  const obj = raw as Record<string, unknown>
  const intentRaw = String(obj.intent ?? '').toLowerCase().trim()
  const intent = (VALID_INTENTS as string[]).includes(intentRaw)
    ? (intentRaw as CommandIntent)
    : 'unknown'
  const params = (obj.params && typeof obj.params === 'object')
    ? obj.params as Record<string, unknown>
    : {}
  const confidence = clampNumber(obj.confidence, 0, 1, 0.5)

  return { intent, params, confidence }
}

function clampNumber(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, n))
}
