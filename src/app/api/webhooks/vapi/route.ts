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
      await handleEndOfCall(supabase, business, msg, call, vapiCallId)
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

interface BusinessRow { id: string; business_type: string | null }

async function findBusinessByAssistant(
  supabase: ReturnType<typeof createAdminClient>,
  assistantId: string,
): Promise<BusinessRow | null> {
  // Primary lookup: vapi_agent_id column (set during onboarding).
  const { data: primary } = await supabase
    .from('businesses')
    .select('id, business_type')
    .eq('vapi_agent_id', assistantId)
    .maybeSingle()
  if (primary) return primary as BusinessRow

  // Fallback: notifications_config->>'vapi_assistant_id' for clients
  // wired up via the legacy path. Costs one extra round-trip but only
  // when the primary missed.
  const { data: fallback } = await supabase
    .from('businesses')
    .select('id, business_type, notifications_config')
    .filter('notifications_config->>vapi_assistant_id', 'eq', assistantId)
    .maybeSingle()
  if (fallback) return { id: fallback.id as string, business_type: (fallback.business_type as string | null) ?? null }

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
}

// ── end-of-call-report — the main path ──────────────────────────────────

async function handleEndOfCall(
  supabase: ReturnType<typeof createAdminClient>,
  business: BusinessRow,
  msg: VapiMessage,
  call: VapiCall,
  vapiCallId: string,
) {
  const phone = call.customer?.number ?? null
  const callerName = call.customer?.name ?? null
  const startedAt = call.startedAt ?? null
  const endedAt = call.endedAt ?? new Date().toISOString()
  const durationSeconds = computeDuration(startedAt, endedAt)
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
  const { data: callRow, error: callErr } = await supabase
    .from('calls')
    .upsert({
      vapi_call_id: vapiCallId,
      business_id: business.id,
      started_at: startedAt,
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
    }, { onConflict: 'vapi_call_id' })
    .select('id')
    .single()

  if (callErr || !callRow) {
    console.error('[vapi-webhook] calls upsert failed', callErr?.message)
    return
  }
  const callRowId = callRow.id as string

  // Contacts — upsert on (client_id, phone). Increment call_count and
  // refresh last_seen. The contacts table uses `client_id` (migration
  // 008) not the older `business_id` shape.
  if (phone) {
    await upsertContact(supabase, business.id, phone, callerName, endedAt)
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
}

// ── contacts upsert ─────────────────────────────────────────────────────

async function upsertContact(
  supabase: ReturnType<typeof createAdminClient>,
  clientId: string,
  phone: string,
  callerName: string | null,
  whenIso: string,
) {
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
  } else {
    await supabase.from('contacts').insert({
      client_id: clientId,
      phone,
      name: callerName,
      first_seen: whenIso,
      last_seen: whenIso,
      call_count: 1,
    })
  }
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
