// Vapi webhook receiver — POST /api/webhooks/vapi
//
// Receives end-of-call-report (and a few sibling events) from Vapi and
// writes the result to the `calls`, `contacts`, and industry-specific
// tables. Migration 028 added `calls.vapi_call_id` so we can key
// upserts on Vapi's identifier without trying to cram its `call_xxx`
// string into the UUID primary key.
//
// Auth (any one of the below — Vapi exposes different conventions on
// different account tiers, so we accept all three):
//   1. `x-vapi-secret: <VAPI_WEBHOOK_SECRET>`   — plain shared secret
//   2. `authorization: Bearer <VAPI_WEBHOOK_SECRET>`
//   3. HMAC-SHA256 in `x-vapi-signature` (raw hex or `sha256=<hex>`)
//
// When VAPI_WEBHOOK_SECRET is unset the route accepts requests
// unauthenticated so Donna's first probe doesn't 401, but DEPLOYMENT.md
// flags this as a required env var before going live.
//
// Always responds 200 with `{ received: true }` on any non-auth failure
// so Vapi doesn't retry storms — internal failures are logged via
// console.error.

import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createAdminClient } from '@/lib/supabase/server'
import { scoreCallAsync } from '@/lib/score-call-async'
import { sendSMS } from '@/lib/sms'

interface VapiCall {
  id?: string
  assistantId?: string
  phoneNumberId?: string
  customer?: { number?: string; name?: string }
  startedAt?: string
  endedAt?: string
  endedReason?: string
  transcript?: string
  summary?: string
  recordingUrl?: string
  stereoRecordingUrl?: string
}

interface VapiAnalysis {
  summary?: string
  structuredData?: Record<string, unknown>
  successEvaluation?: string
}

interface VapiToolCall {
  function?: { name?: string; arguments?: string | Record<string, unknown> }
}

interface VapiMessage {
  type?: string
  call?: VapiCall
  analysis?: VapiAnalysis
  transcript?: string
  summary?: string
  recordingUrl?: string
  stereoRecordingUrl?: string
  endedReason?: string
  toolCallList?: VapiToolCall[]
  transferred?: boolean
}

interface VapiPayload {
  message?: VapiMessage
  type?: string
  call?: VapiCall
  analysis?: VapiAnalysis
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text()

  if (!verifySecret(request, rawBody)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let payload: VapiPayload
  try { payload = JSON.parse(rawBody) as VapiPayload }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  // Vapi wraps event data in either { message: {...} } (newer) or at
  // the top level (older). Normalise both shapes.
  const msg: VapiMessage = payload.message ?? {
    type: payload.type,
    call: payload.call,
    analysis: payload.analysis,
  }
  const eventType = msg.type ?? 'unknown'
  const call: VapiCall = msg.call ?? {}
  const vapiCallId = call.id?.trim()

  // No call ID = nothing we can usefully persist. Common for status
  // pings and warmup probes; return 200 quietly.
  if (!vapiCallId) {
    return NextResponse.json({ received: true })
  }

  const supabase = createAdminClient()

  // Resolve which business owns this assistant. Try the dedicated
  // column first (set by the agent-builder), then fall back to a
  // notifications_config blob in case a client was wired up via a
  // legacy path. If neither matches, log and 200 — the alternative is
  // a retry storm from Vapi for an unrecoverable mismatch.
  const assistantId = call.assistantId?.trim() ?? ''
  const business = assistantId ? await findBusinessByAssistant(supabase, assistantId) : null
  if (!business) {
    console.warn('[vapi-webhook] no business matched assistantId', {
      vapiCallId, assistantId, eventType,
    })
    return NextResponse.json({ received: true })
  }

  try {
    if (eventType === 'end-of-call-report' || eventType === 'call.ended' || eventType === 'call-end') {
      await handleEndOfCall(supabase, business, msg, call, vapiCallId, new URL(request.url).origin)
      // Session 6A — clear the live-call indicator now the call has ended.
      await clearActiveCall(supabase, business.id, vapiCallId)
    } else if (eventType === 'call.started' || eventType === 'call-start') {
      await handleCallStart(supabase, business.id, call, vapiCallId)
    } else if (eventType === 'transfer-initiated' || eventType === 'call.transferred') {
      await supabase
        .from('calls')
        .update({ transferred: true, outcome: 'Transferred' })
        .eq('vapi_call_id', vapiCallId)
    }
    // Other event types (status-update, hang, etc.) are intentionally
    // ignored — they're noise for our use case.
  } catch (e) {
    console.error('[vapi-webhook] handler failed', {
      vapiCallId, eventType, error: (e as Error).message,
    })
    // Still return 200 — handler errors shouldn't trigger Vapi retries.
  }

  return NextResponse.json({ received: true })
}

// ── auth ────────────────────────────────────────────────────────────────

function verifySecret(request: NextRequest, body: string): boolean {
  const secret = process.env.VAPI_WEBHOOK_SECRET
  if (!secret) return true   // no secret set: open mode (flagged in DEPLOYMENT.md)

  // Plain shared-secret headers — Vapi sends one of these depending on
  // how the server URL was configured.
  const plain = request.headers.get('x-vapi-secret')
    ?? request.headers.get('x-webhook-secret')
    ?? ''
  if (plain && safeEq(plain, secret)) return true

  const authz = request.headers.get('authorization') ?? ''
  if (authz.startsWith('Bearer ') && safeEq(authz.slice(7), secret)) return true

  // HMAC fallback (legacy convention from the original receiver).
  const sig = request.headers.get('x-vapi-signature') ?? ''
  if (sig) {
    const expected = crypto.createHmac('sha256', secret).update(body).digest('hex')
    if (safeEq(sig, expected) || safeEq(sig, `sha256=${expected}`)) return true
  }

  return false
}

function safeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// ── business lookup ─────────────────────────────────────────────────────

interface BusinessRow {
  id: string
  business_type: string | null
  escalation_number: string | null
  talkmate_number: string | null
  name: string | null
  // Session 3B — present so the call.ended handler can decide whether to
  // fire the ServiceM8 push without an extra round-trip. Optional so the
  // fallback path and older callers compile unchanged.
  servicem8_enabled?: boolean | null
}

async function findBusinessByAssistant(
  supabase: ReturnType<typeof createAdminClient>,
  assistantId: string,
): Promise<BusinessRow | null> {
  // Primary lookup: vapi_agent_id column (set during onboarding).
  const { data: primary } = await supabase
    .from('businesses')
    .select('id, business_type, escalation_number, talkmate_number, name, servicem8_enabled')
    .eq('vapi_agent_id', assistantId)
    .maybeSingle()
  if (primary) return primary as BusinessRow

  // Fallback: notifications_config->>'vapi_assistant_id' for clients
  // wired up via the legacy path. Costs one extra round-trip but only
  // when the primary missed.
  const { data: fallback } = await supabase
    .from('businesses')
    .select('id, business_type, escalation_number, talkmate_number, name, servicem8_enabled, notifications_config')
    .filter('notifications_config->>vapi_assistant_id', 'eq', assistantId)
    .maybeSingle()
  if (fallback) return {
    id: fallback.id as string,
    business_type: (fallback.business_type as string | null) ?? null,
    escalation_number: (fallback.escalation_number as string | null) ?? null,
    talkmate_number: (fallback.talkmate_number as string | null) ?? null,
    name: (fallback.name as string | null) ?? null,
    servicem8_enabled: (fallback.servicem8_enabled as boolean | null) ?? null,
  }

  return null
}

// ── call.started — minimal upsert so the row exists for log_outcome ─────

async function handleCallStart(
  supabase: ReturnType<typeof createAdminClient>,
  businessId: string,
  call: VapiCall,
  vapiCallId: string,
) {
  const { error } = await supabase.from('calls').upsert({
    vapi_call_id: vapiCallId,
    business_id: businessId,
    started_at: call.startedAt ?? new Date().toISOString(),
    caller_number: call.customer?.number ?? null,
  }, { onConflict: 'vapi_call_id' })
  if (error) console.error('[vapi-webhook] call.started upsert failed', error.message)

  // Session 6A — live-call indicator. Upsert a row so the portal shows a
  // "live call" pill in realtime. One row per business (onConflict).
  const { error: acErr } = await supabase.from('active_calls').upsert({
    business_id: businessId,
    vapi_call_id: vapiCallId,
    from_number: call.customer?.number ?? null,
    started_at: call.startedAt ?? new Date().toISOString(),
  }, { onConflict: 'business_id' })
  if (acErr) console.error('[vapi-webhook] active_calls upsert failed', acErr.message)
}

// ── live-call indicator cleanup ─────────────────────────────────────────
// Remove the active_calls row for a finished call, and sweep any stale row
// older than 15 min so a missed call.ended event never pins the pill on.
async function clearActiveCall(
  supabase: ReturnType<typeof createAdminClient>,
  businessId: string,
  vapiCallId: string,
) {
  await supabase
    .from('active_calls')
    .delete()
    .eq('business_id', businessId)
    .eq('vapi_call_id', vapiCallId)
  const staleCutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString()
  await supabase
    .from('active_calls')
    .delete()
    .lt('started_at', staleCutoff)
}

// ── end-of-call-report — the main path ──────────────────────────────────

async function handleEndOfCall(
  supabase: ReturnType<typeof createAdminClient>,
  business: BusinessRow,
  msg: VapiMessage,
  call: VapiCall,
  vapiCallId: string,
  requestOrigin: string,
) {
  const phone = call.customer?.number ?? null
  const callerName = call.customer?.name ?? null
  const startedAt = call.startedAt ?? null
  const endedAt = call.endedAt ?? new Date().toISOString()
  let durationSeconds = computeDuration(startedAt, endedAt)

  // Vapi does not send startedAt in end-of-call-report. If duration is 0
  // and we have a vapiCallId, fetch started_at from the call.started row.
  if (durationSeconds === 0 && vapiCallId) {
    const { data: existing } = await supabase
      .from('calls')
      .select('started_at')
      .eq('vapi_call_id', vapiCallId)
      .maybeSingle()
    if (existing?.started_at) {
      durationSeconds = computeDuration(existing.started_at, endedAt)
    }
  }
  const endedReason = call.endedReason ?? msg.endedReason ?? null
  const transcript = call.transcript ?? msg.transcript ?? ''
  const recordingUrl = call.recordingUrl ?? msg.recordingUrl
    ?? call.stereoRecordingUrl ?? msg.stereoRecordingUrl ?? ''
  const summary = msg.analysis?.summary ?? call.summary ?? msg.summary ?? null

  // Pull data from tool calls (mid-call functions). This is in addition
  // to analysis.structuredData — Vapi puts data in one or both spots
  // depending on assistant version.
  const extracted: Record<string, unknown> = {}
  const tools = Array.isArray(msg.toolCallList) ? msg.toolCallList : []
  for (const tc of tools) {
    const raw = tc.function?.arguments
    if (!raw) continue
    try {
      const args = typeof raw === 'string' ? JSON.parse(raw) : raw
      if (args && typeof args === 'object') {
        Object.assign(extracted, args as Record<string, unknown>)
      }
    } catch { /* ignore malformed args */ }
  }
  if (msg.analysis?.structuredData && typeof msg.analysis.structuredData === 'object') {
    Object.assign(extracted, msg.analysis.structuredData)
  }

  const outcome = (typeof extracted.outcome === 'string' && extracted.outcome)
    ? (extracted.outcome as string)
    : deriveOutcomeFromEndedReason(endedReason)
    ?? deriveOutcomeFromTranscript(transcript)
    ?? 'completed'

  const transferred = outcome === 'Transferred'
    || outcome === 'transferred'
    || msg.transferred === true
    || endedReason === 'assistant-forwarded-call'

  // Upsert keyed on vapi_call_id. The .select() returns the row id so
  // we can FK from the secondary tables (jobs/appointments/orders).

  // Build the upsert payload. Only include started_at if we actually have it —
  // Vapi does not send startedAt in end-of-call-report webhooks, and omitting it
  // here preserves the value set by the earlier call.started event.
  const upsertPayload: Record<string, unknown> = {
    vapi_call_id: vapiCallId,
    business_id: business.id,
    ended_at: endedAt,
    duration_seconds: durationSeconds,
    ended_reason: endedReason,
    transcript,
    summary,
    recording_url: recordingUrl || null,
    outcome,
    transferred,
    caller_number: phone,
    caller_name: callerName,
  }
  if (startedAt) {
    upsertPayload.started_at = startedAt
  }

  const { data: callRow, error: callErr } = await supabase
    .from('calls')
    .upsert(upsertPayload, { onConflict: 'vapi_call_id' })
    .select('id, started_at')
    .single()

  if (callErr || !callRow) {
    console.error('[vapi-webhook] calls upsert failed', callErr?.message)
    return
  }
  const callRowId = callRow.id as string

  // If Vapi didn't send startedAt in the webhook, read back the DB's started_at
  // (set by the earlier call.started event) and compute the real duration.
  if (!startedAt && callRow.started_at) {
    const realDuration = computeDuration(callRow.started_at as string, endedAt)
    if (realDuration > 0) {
      await supabase
        .from('calls')
        .update({ duration_seconds: realDuration })
        .eq('id', callRowId)
    }
  }

  // Contacts — upsert on (client_id, phone). Increment call_count and
  // refresh last_seen. The contacts table uses `client_id` (migration
  // 008) not the older `business_id` shape.
  let contactId: string | null = null
  if (phone) {
    contactId = await upsertContact(supabase, business.id, phone, callerName, endedAt)
  }

  // Link the call into the CRM's contact_calls join table (migration 008).
  // The contact detail page reads exclusively from contact_calls — without
  // this insert it shows "No calls logged yet" even though calls and
  // contacts both have rows. `contact_calls.call_id` is TEXT and UNIQUE,
  // so we use vapi_call_id directly and upsert to stay idempotent across
  // webhook retries.
  if (contactId) {
    await supabase.from('contact_calls').upsert({
      contact_id: contactId,
      call_id: vapiCallId,
      client_id: business.id,
      call_at: startedAt ?? endedAt,
      duration_seconds: durationSeconds,
      outcome,
      summary,
      transcript: transcript || null,
    }, { onConflict: 'call_id' })
      .then(({ error }) => {
        if (error) console.error('[vapi-webhook] contact_calls upsert failed', error.message)
      })
  }

  // Industry side-effects — only run when we have meaningful data.
  await maybeInsertJob(supabase, business, callRowId, phone, extracted)
  await maybeInsertAppointment(supabase, business, callRowId, phone, extracted)
  await maybeInsertOrder(supabase, business, callRowId, extracted)

  // In-portal notification feed.
  await supabase.from('notifications').insert({
    business_id: business.id,
    type: transferred ? 'call_transferred' : 'call_ended',
    message: `${transferred ? '📞 Call transferred' : '✅ Call ended'}: ${outcome} — ${phone ?? 'Unknown caller'}`,
  }).then(({ error }) => {
    if (error) console.error('[vapi-webhook] notifications insert failed', error.message)
  })

  // SMS notification to business owner/escalation number on call end.
  await maybeSendOwnerSms(business, call, msg.analysis?.summary ?? call.summary ?? msg.summary ?? null, phone)

  // Sprint Session 1 — missed-call win-back. Fire when the call was a
  // short customer-hangup / did-not-answer / voicemail and the business
  // opted in. Doesn't await: the SMS send is fire-and-forget so the
  // webhook doesn't pay the latency.
  void maybeSendWinback(supabase, business.id, callRowId, vapiCallId, phone, durationSeconds, endedReason, transcript)
    .catch(err => console.error('[vapi-webhook] winback failed', (err as Error).message))

  // Session 18 — fire-and-forget Call Intelligence scoring. Must not
  // await; the webhook must return quickly so Vapi doesn't retry.
  // scoreCallAsync swallows its own errors and never throws, but we
  // still attach a .catch as a defensive belt-and-braces.
  scoreCallAsync(vapiCallId, business.id).catch(err => {
    console.error('[vapi-webhook] async scoring failed:', (err as Error).message)
  })

  // Optional Make.com fan-out (kept from the original receiver).
  const makeUrl = process.env.MAKE_WEBHOOK_URL
  if (makeUrl) {
    fetch(makeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        businessId: business.id,
        callId: callRowId,
        vapiCallId,
        outcome,
        transferred,
        transcript,
        callerNumber: phone,
        extractedData: extracted,
      }),
    }).catch(() => { /* fire-and-forget */ })
  }

  // ── Session 3B — ServiceM8 job push (built dark, fully isolated) ─────────
  // Fire-and-forget to our own internal route, which enforces the global kill
  // switch + per-business enable + idempotency (calls.servicem8_pushed) before
  // creating anything. Wrapped so a failure here can NEVER affect the live
  // call.ended handler. Uses the request origin (not a hardcoded prod URL) so
  // preview deploys call their own route.
  try {
    if (business.servicem8_enabled) {
      void fetch(`${requestOrigin}/api/servicem8/push-job`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.CRON_SECRET ?? ''}`,
        },
        body: JSON.stringify({ callId: callRowId, businessId: business.id, contactId }),
      }).catch(err => console.error('[servicem8-push] fire-and-forget failed:', (err as Error).message))
    }
  } catch (err) {
    console.error('[servicem8-push] non-fatal trigger error, webhook continues:', (err as Error).message)
  }
}

// ── contacts upsert ─────────────────────────────────────────────────────

// Returns the contact UUID so the caller can link the call into
// contact_calls. Returns null on failure — the call still lands in
// `calls`, but the CRM join won't be made.
async function upsertContact(
  supabase: ReturnType<typeof createAdminClient>,
  clientId: string,
  phone: string,
  callerName: string | null,
  whenIso: string,
): Promise<string | null> {
  const { data: existing } = await supabase
    .from('contacts')
    .select('id, call_count, name')
    .eq('client_id', clientId)
    .eq('phone', phone)
    .eq('is_merged', false)
    .maybeSingle()

  if (existing) {
    await supabase.from('contacts')
      .update({
        call_count: (existing.call_count ?? 0) + 1,
        last_seen: whenIso,
        // Backfill name if we didn't have it before and Vapi gave us one.
        ...(callerName && !existing.name ? { name: callerName } : {}),
      })
      .eq('id', existing.id)
    return existing.id as string
  }

  const { data: created, error } = await supabase.from('contacts').insert({
    client_id: clientId,
    phone,
    name: callerName,
    first_seen: whenIso,
    last_seen: whenIso,
    call_count: 1,
  }).select('id').single()
  if (error || !created) {
    console.error('[vapi-webhook] contacts insert failed', error?.message)
    return null
  }
  return created.id as string
}

// ── industry side-effects (preserved from original receiver) ────────────

async function maybeInsertJob(
  supabase: ReturnType<typeof createAdminClient>,
  business: BusinessRow,
  callRowId: string,
  phone: string | null,
  extracted: Record<string, unknown>,
) {
  const btype = business.business_type ?? ''
  if (!['automotive', 'trades'].includes(btype)) return
  const address = (extracted.pickupAddress as string | undefined)
    ?? (extracted.address as string | undefined)
  if (!address) return
  await supabase.from('jobs').insert({
    business_id: business.id,
    call_id: callRowId,
    customer_name: (extracted.callerName as string | undefined) ?? '',
    customer_phone: phone ?? '',
    job_type: (extracted.jobType as string | undefined) ?? (extracted.equipment as string | undefined) ?? '',
    address,
    urgency: (extracted.urgency as string | undefined) ?? 'scheduled',
    status: 'new',
  }).then(({ error }) => {
    if (error) console.error('[vapi-webhook] jobs insert failed', error.message)
  })
}

async function maybeInsertAppointment(
  supabase: ReturnType<typeof createAdminClient>,
  business: BusinessRow,
  callRowId: string,
  phone: string | null,
  extracted: Record<string, unknown>,
) {
  const btype = business.business_type ?? ''
  if (!['medical', 'beauty', 'fitness', 'professional', 'real_estate'].includes(btype)) return
  // Only fire when the agent actually captured booking details.
  if (!extracted.serviceType && !extracted.preferredDate) return
  await supabase.from('appointments').insert({
    business_id: business.id,
    call_id: callRowId,
    customer_name: (extracted.callerName as string | undefined) ?? '',
    customer_phone: phone ?? '',
    service_type: (extracted.serviceType as string | undefined) ?? '',
    scheduled_at: (extracted.preferredDate as string | undefined) ?? null,
    status: 'enquired',
  }).then(({ error }) => {
    if (error) console.error('[vapi-webhook] appointments insert failed', error.message)
  })
}

async function maybeInsertOrder(
  supabase: ReturnType<typeof createAdminClient>,
  business: BusinessRow,
  callRowId: string,
  extracted: Record<string, unknown>,
) {
  const btype = business.business_type ?? ''
  if (!['hospitality', 'retail'].includes(btype)) return
  if (!extracted.items) return
  await supabase.from('orders').insert({
    business_id: business.id,
    call_id: callRowId,
    items: extracted.items,
    total_amount: (extracted.totalAmount as number | undefined) ?? null,
    status: 'received',
  }).then(({ error }) => {
    if (error) console.error('[vapi-webhook] orders insert failed', error.message)
  })
}

// ── owner SMS notification ─────────────────────────────────────────────

async function maybeSendOwnerSms(
  business: BusinessRow,
  call: VapiCall,
  summary: string | null,
  callerPhone: string | null,
): Promise<void> {
  const toNumber = business.escalation_number
  const fromNumber = business.talkmate_number ?? process.env.TWILIO_PHONE_NUMBER
  if (!toNumber || !fromNumber) return

  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  if (!accountSid || !authToken) return

  // Format the SMS — concise, all key info for the owner
  const caller = callerPhone ?? 'Unknown'
  const bizName = business.name ?? 'Your business'
  const summaryText = summary
    ? summary.replace(/\n+/g, ' ').substring(0, 400)
    : 'No summary available.'

  const body = `📞 ${bizName} — New call\nFrom: ${caller}\n\n${summaryText}\n\nReply to this number to call back.`

  try {
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`
    const params = new URLSearchParams({ To: toNumber, From: fromNumber, Body: body })
    const resp = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    })
    if (!resp.ok) {
      const err = await resp.text()
      console.error('[vapi-webhook] owner SMS failed', { status: resp.status, err: err.substring(0, 200) })
    } else {
      console.log('[vapi-webhook] owner SMS sent to', toNumber)
    }
  } catch (e) {
    console.error('[vapi-webhook] owner SMS exception', (e as Error).message)
  }
}

// ── Sprint Session 1: missed-call win-back ─────────────────────────────
// Triggered from handleEndOfCall when a call ended quickly without the
// agent engaging the caller. Auto-texts the caller back via /lib/sms.ts
// so the message lands in the in-portal Inbox AND in their phone.

const WINBACK_ABANDON_REASONS = new Set([
  'customer-hangup',
  'customer-did-not-answer',
  'voicemail',
  'silence-timed-out',
])
const WINBACK_DURATION_THRESHOLD_SECONDS = 15
// Sprint 1 hardening — a <15s call that nonetheless produced a real
// transcript means the AI engaged (e.g. "what time do you close?" "5pm"
// "thanks"), so it is NOT a missed call. Only treat it as abandoned when
// the transcript is shorter than this (caller hung up before pickup).
const WINBACK_MAX_TRANSCRIPT_CHARS = 25

async function maybeSendWinback(
  supabase: ReturnType<typeof createAdminClient>,
  businessId: string,
  callRowId: string,
  vapiCallId: string,
  callerPhone: string | null,
  durationSeconds: number,
  endedReason: string | null,
  transcript: string,
): Promise<void> {
  if (!callerPhone) return
  if (durationSeconds >= WINBACK_DURATION_THRESHOLD_SECONDS) return
  if (!endedReason || !WINBACK_ABANDON_REASONS.has(endedReason)) return
  // False-positive guard: skip quick *successful* calls (the AI engaged).
  if (transcript && transcript.trim().length >= WINBACK_MAX_TRANSCRIPT_CHARS) return

  // Stamp the abandoned flag regardless of whether we end up sending —
  // the cron review-follow-up route uses it to skip these calls.
  await supabase.from('calls').update({
    was_abandoned: true,
    abandoned_at: new Date().toISOString(),
  }).eq('id', callRowId)

  // Need winback settings + business name for the message + from-number
  const { data: businessRow } = await supabase
    .from('businesses')
    .select('id, name, winback_enabled, winback_custom_message, twilio_phone_number, talkmate_number')
    .eq('id', businessId)
    .limit(1)
    .maybeSingle()
  if (!businessRow) return
  if (businessRow.winback_enabled === false) return

  // Idempotency: if a previous webhook attempt already fired the SMS
  // (Vapi retries the end-of-call payload on transient errors), don't
  // double-text.
  const { data: existing } = await supabase
    .from('calls')
    .select('winback_sent')
    .eq('id', callRowId)
    .limit(1)
    .maybeSingle()
  if (existing?.winback_sent === true) return

  // Opt-out check against the contact row. The contacts table uses
  // client_id, not business_id.
  const { data: contact } = await supabase
    .from('contacts')
    .select('id, sms_opted_out')
    .eq('client_id', businessId)
    .eq('phone', callerPhone)
    .eq('is_merged', false)
    .limit(1)
    .maybeSingle()
  if (contact?.sms_opted_out === true) return

  const bizName = (businessRow.name as string | null) ?? 'us'
  const custom = (businessRow.winback_custom_message as string | null)?.trim() ?? ''
  let message = custom
    ? custom.replace(/\{business_name\}/gi, bizName)
    : `Hey, we missed your call at ${bizName}. We are here to help, how can we assist?`
  // Compliance (Australian Spam Act): commercial SMS needs a functional
  // unsubscribe. STOP is handled at the Twilio inbound webhook; append the
  // instruction unless the operator's custom copy already includes it.
  if (!/\bstop\b/i.test(message)) message += ' Reply STOP to opt out.'

  const fromNumber = (businessRow.twilio_phone_number as string | null)
    ?? (businessRow.talkmate_number as string | null)
    ?? undefined

  const result = await sendSMS({
    to: callerPhone,
    message,
    clientId: businessId,
    smsType: 'missed_call_winback',
    from: fromNumber,
    sentBy: 'winback',
  })

  if (result.success) {
    await supabase.from('calls').update({
      winback_sent: true,
      winback_sent_at: new Date().toISOString(),
    }).eq('id', callRowId)
    // Sprint Session 2 — ROI audit trail. The ROI dashboard calculates from
    // source tables directly, so this insert is supplementary (not relied on
    // for the headline number); failures must never break win-back sending.
    await supabase.from('roi_events').insert({
      business_id: businessId,
      event_type: 'winback_sent',
      source_id: callRowId,
      source_table: 'calls',
    }).then(() => {}, () => {})
  } else {
    console.warn('[vapi-webhook] winback send failed', { vapiCallId, reason: result.reason, error: result.error })
  }
}

// ── derivation helpers ──────────────────────────────────────────────────

function computeDuration(start: string | null, end: string): number {
  if (!start) return 0
  const s = Date.parse(start)
  const e = Date.parse(end)
  if (!Number.isFinite(s) || !Number.isFinite(e)) return 0
  return Math.max(0, Math.round((e - s) / 1000))
}

function deriveOutcomeFromEndedReason(reason: string | null): string | null {
  if (!reason) return null
  switch (reason) {
    case 'customer-ended-call':
    case 'assistant-ended-call':
    case 'phone-call-provider-closed-websocket':
      return 'completed'
    case 'assistant-forwarded-call':
      return 'transferred'
    case 'customer-did-not-answer':
    case 'silence-timed-out':
    case 'voicemail':
    case 'twilio-failed-to-connect':
      return 'missed'
    case 'pipeline-error':
    case 'assistant-error':
    case 'assistant-not-found':
      return 'failed'
    default:
      // Unknown reasons surface as the raw value so we can refine the
      // map later without losing information.
      return reason
  }
}

function deriveOutcomeFromTranscript(transcript: string): string | null {
  if (!transcript) return null
  const t = transcript.toLowerCase()
  if (t.includes('transfer')) return 'transferred'
  if (t.includes('appointment') || t.includes('book')) return 'Appointment Booked'
  if (t.includes('job') || t.includes('dispatch')) return 'Job Dispatched'
  if (t.includes('order') || t.includes('placed')) return 'Order Taken'
  return null
}
