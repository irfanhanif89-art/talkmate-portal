// TalkMate Command — WhatsApp inbound webhook (Twilio).
//
// One shared endpoint for all clients. We disambiguate by matching the
// inbound `To` number (the Twilio number the customer messaged) to
// command_bots.whatsapp_number — that field is UNIQUE per client.
//
// Security model:
//   * Validate Twilio's X-Twilio-Signature on every POST. Twilio signs
//     the body with our auth token; mismatch = 403.
//   * No GET-only "challenge" — Twilio doesn't use one for WhatsApp.
//     We accept GET only as a liveness probe so misconfigured webhooks
//     don't 405.
//   * Use the service-role Supabase client (no user session over a
//     webhook).

import { NextResponse } from 'next/server'
import { createHmac } from 'crypto'
import { createAdminClient } from '@/lib/supabase/server'
import { parseCommand } from '@/lib/command-parser'
import { executeCommand } from '@/lib/command-executor'

export async function GET() {
  return new Response('OK', { status: 200 })
}

export async function POST(request: Request) {
  // Twilio sends form-encoded payloads. Read once, validate the
  // signature against the *raw* params, then dispatch.
  const rawBody = await request.text()
  const params = parseFormBody(rawBody)

  const authToken = process.env.TWILIO_AUTH_TOKEN
  const signature = request.headers.get('x-twilio-signature') ?? ''
  const fullUrl = buildFullUrl(request)

  if (!authToken) {
    return twimlError('TalkMate Command is not configured. Contact support.')
  }

  // In production we always validate. We allow a bypass only when
  // TWILIO_SKIP_SIGNATURE=1 (used by local integration tests). Never
  // ship with that env var set in Vercel.
  if (process.env.TWILIO_SKIP_SIGNATURE !== '1') {
    if (!validateTwilioSignature(fullUrl, params, authToken, signature)) {
      return new Response('Forbidden', { status: 403 })
    }
  }

  const from = params.From ?? ''            // "whatsapp:+61412345678"
  const to = params.To ?? ''                // the client's assigned number
  const text = (params.Body ?? '').trim()

  if (!text) return twimlEmpty()

  const supabase = createAdminClient()

  // Match the inbound 'To' number to a client's assigned WhatsApp pool
  // number. Strip the "whatsapp:" prefix that Twilio adds.
  const toNumber = to.replace(/^whatsapp:/i, '').trim()
  if (!toNumber) return twimlEmpty()

  const { data: bot } = await supabase
    .from('command_bots')
    .select('*')
    .eq('whatsapp_number', toNumber)
    .maybeSingle()

  if (!bot) {
    return twimlMessage('Bot not configured. Contact TalkMate support.')
  }

  const clientId = bot.client_id as string

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
    platform: 'whatsapp',
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
      whatsapp_enabled: true,
      whatsapp_activated_at: bot.whatsapp_activated_at ?? new Date().toISOString(),
      status: bot.status === 'active' ? bot.status : 'active',
    })
    .eq('client_id', clientId)

  // Reply via TwiML — Twilio sends the message back to `from`.
  return twimlMessage(response)
}

// ── helpers ─────────────────────────────────────────────────────────────

function parseFormBody(raw: string): Record<string, string> {
  const out: Record<string, string> = {}
  const usp = new URLSearchParams(raw)
  for (const [k, v] of usp.entries()) out[k] = v
  return out
}

// Replicates the algorithm in twilio.validateRequest() so we don't
// have to take the SDK as a dependency.
//   signature = base64(HMAC-SHA1(authToken, fullUrl + sortedKey + sortedValue + ...))
function validateTwilioSignature(
  fullUrl: string,
  params: Record<string, string>,
  authToken: string,
  signature: string,
): boolean {
  if (!signature) return false
  const sortedKeys = Object.keys(params).sort()
  let data = fullUrl
  for (const k of sortedKeys) data += k + params[k]
  const expected = createHmac('sha1', authToken).update(data, 'utf8').digest('base64')
  return safeEqual(expected, signature)
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

function buildFullUrl(request: Request): string {
  // Twilio signs the URL it called, including the protocol + host. If
  // we're behind a proxy (Vercel), respect x-forwarded-proto/host.
  const url = new URL(request.url)
  const xfProto = request.headers.get('x-forwarded-proto')
  const xfHost = request.headers.get('x-forwarded-host') ?? request.headers.get('host')
  if (xfProto && xfHost) {
    return `${xfProto}://${xfHost}${url.pathname}${url.search}`
  }
  return request.url
}

function twimlMessage(text: string): Response {
  return new Response(
    `<Response><Message>${escapeXml(text)}</Message></Response>`,
    { headers: { 'Content-Type': 'text/xml' } },
  )
}

function twimlEmpty(): Response {
  return new Response('<Response/>', { headers: { 'Content-Type': 'text/xml' } })
}

function twimlError(text: string): Response {
  return new Response(
    `<Response><Message>${escapeXml(text)}</Message></Response>`,
    { headers: { 'Content-Type': 'text/xml' } },
  )
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
