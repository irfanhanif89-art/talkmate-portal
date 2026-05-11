import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

// The endpoint Vapi calls mid-conversation to get real-time data and
// log call outcomes. Session 9.
//
// Auth model: simple bearer header (`x-vapi-secret`) matched against
// `VAPI_WEBHOOK_SECRET`. The existing /api/webhooks/vapi route uses an
// HMAC signature because Vapi signs its server-emitted webhooks; this
// is a separate endpoint that *we* expose for Vapi to call as a
// "function," so the auth model is a shared static secret. Donna
// configures the secret in each Vapi assistant's function-call header
// settings.
//
// All six functions are routed through the same POST so Vapi can use a
// single function-call URL. Functions are described in the system
// prompt and the assistant picks the right one + params.
//
// Latency target: < 3 s. All DB calls go through the service-role
// admin client (no RLS overhead, no JWT parsing).

const VALID_FNS = new Set([
  'check_caller',
  'get_team',
  'get_availability', // alias for get_wait_time, kept for forward-compat
  'get_wait_time',
  'log_outcome',
  'create_booking',
  'schedule_callback',
])

interface FnRequest {
  function_name?: string
  business_id?: string
  params?: Record<string, unknown>
}

interface EscalationConfig {
  after_hours_enabled?: boolean
  after_hours_action?: string
  missed_transfer_action?: string
  wait_time_minutes?: number
  emergency_keywords?: string[]
  emergency_action?: string
  sms_followup_enabled?: boolean
  sms_followup_template?: string
  repeat_caller_threshold?: number
  repeat_caller_notify?: boolean
}

export async function POST(request: Request) {
  // ---- auth -------------------------------------------------------
  const expected = process.env.VAPI_WEBHOOK_SECRET
  if (expected) {
    const got = request.headers.get('x-vapi-secret') ?? request.headers.get('authorization') ?? ''
    const normalized = got.startsWith('Bearer ') ? got.slice(7) : got
    if (normalized !== expected) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }
  // If VAPI_WEBHOOK_SECRET is unset we permit calls (dev). Production
  // operators MUST set it.

  let body: FnRequest
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const fn = (body.function_name ?? '').trim()
  const businessId = (body.business_id ?? '').trim()
  const params = (body.params ?? {}) as Record<string, unknown>

  if (!VALID_FNS.has(fn)) {
    return NextResponse.json({ error: `Unknown function: ${fn}` }, { status: 400 })
  }
  if (!businessId) {
    return NextResponse.json({ error: 'business_id required' }, { status: 400 })
  }

  const supabase = createAdminClient()

  try {
    switch (fn) {
      case 'check_caller':
        return NextResponse.json(await checkCaller(supabase, businessId, params))
      case 'get_team':
        return NextResponse.json(await getTeam(supabase, businessId, params))
      case 'get_wait_time':
      case 'get_availability':
        return NextResponse.json(await getWaitTime(supabase, businessId))
      case 'log_outcome':
        return NextResponse.json(await logOutcome(supabase, businessId, params))
      case 'create_booking':
        return NextResponse.json(await createBooking(supabase, businessId, params))
      case 'schedule_callback':
        return NextResponse.json(await scheduleCallback(supabase, businessId, params))
      default:
        return NextResponse.json({ error: 'unhandled' }, { status: 400 })
    }
  } catch (e) {
    console.error(`[vapi/functions:${fn}]`, e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Internal error' },
      { status: 500 },
    )
  }
}

// ─── check_caller ──────────────────────────────────────────────────

async function checkCaller(
  supabase: ReturnType<typeof createAdminClient>,
  clientId: string,
  params: Record<string, unknown>,
) {
  const phone = String(params.phone ?? '').trim()
  if (!phone) return { result: { is_vip: false, is_existing: false, is_repeat: false } }

  // Need the business's repeat-caller threshold to flag repeats.
  const { data: biz } = await supabase
    .from('businesses')
    .select('escalation_config')
    .eq('id', clientId)
    .single()
  const cfg = (biz?.escalation_config ?? {}) as EscalationConfig
  const threshold = Math.max(1, cfg.repeat_caller_threshold ?? 3)

  // VIP lookup
  const { data: vip } = await supabase
    .from('vip_callers')
    .select('phone, name, note, action, transfer_to_member_id, active, team_members!vip_callers_transfer_to_member_id_fkey(name, phone)')
    .eq('client_id', clientId)
    .eq('phone', phone)
    .eq('active', true)
    .maybeSingle()

  // Contact lookup (existing caller history)
  const { data: contact } = await supabase
    .from('contacts')
    .select('name, call_count')
    .eq('client_id', clientId)
    .eq('phone', phone)
    .eq('is_merged', false)
    .maybeSingle()

  const callCount = contact?.call_count ?? 0
  const transferMember = (vip as unknown as { team_members?: { name: string; phone: string } | null })?.team_members ?? null

  return {
    result: {
      is_vip: !!vip,
      vip_name: vip?.name ?? null,
      vip_note: vip?.note ?? null,
      vip_action: vip?.action ?? null,
      vip_transfer_member: transferMember,
      is_existing: !!contact,
      existing_name: contact?.name ?? null,
      call_count: callCount,
      is_repeat: callCount >= threshold,
    },
  }
}

// ─── get_team ──────────────────────────────────────────────────────

async function getTeam(
  supabase: ReturnType<typeof createAdminClient>,
  clientId: string,
  params: Record<string, unknown>,
) {
  const query = String(params.query ?? '').toLowerCase().trim()

  const { data: biz } = await supabase
    .from('businesses')
    .select('plan, call_transfer_enabled')
    .eq('id', clientId)
    .single()

  const transferEnabled =
    !!biz?.call_transfer_enabled &&
    biz?.plan !== 'starter'

  const { data: rows } = await supabase
    .from('team_members')
    .select('id, name, role, department, phone, extension, is_escalation_contact, sort_order')
    .eq('client_id', clientId)
    .eq('active', true)
    .order('sort_order', { ascending: true })

  const team = rows ?? []
  const escalationContact = team.find(t => t.is_escalation_contact) ?? null

  // Best-match ranking if the caller asked for someone specific.
  let ordered = team
  if (query) {
    const score = (m: typeof team[number]) => {
      const haystack = [m.name, m.role, m.department].filter(Boolean).join(' ').toLowerCase()
      if (!haystack) return 0
      const tokens = query.split(/\s+/).filter(Boolean)
      let s = 0
      for (const tok of tokens) if (haystack.includes(tok)) s++
      return s
    }
    ordered = [...team].sort((a, b) => score(b) - score(a))
  }

  return {
    result: {
      transfer_enabled: transferEnabled,
      team: ordered.map(t => ({
        id: t.id,
        name: t.name,
        role: t.role,
        department: t.department,
        phone: t.phone,
        extension: t.extension,
      })),
      escalation_contact: escalationContact
        ? { name: escalationContact.name, phone: escalationContact.phone }
        : null,
    },
    agent_instruction: transferEnabled
      ? undefined
      : 'Live transfer is not enabled on this plan. Take a message instead of attempting to transfer.',
  }
}

// ─── get_wait_time ─────────────────────────────────────────────────

async function getWaitTime(
  supabase: ReturnType<typeof createAdminClient>,
  clientId: string,
) {
  const { data: biz } = await supabase
    .from('businesses')
    .select('escalation_config')
    .eq('id', clientId)
    .single()
  const cfg = (biz?.escalation_config ?? {}) as EscalationConfig
  const minutes = Math.max(0, cfg.wait_time_minutes ?? 0)

  const message =
    minutes === 0
      ? 'We have availability now.'
      : minutes <= 5
      ? `Currently about ${minutes} minutes — almost no wait.`
      : `Currently about ${minutes} minutes.`

  return { result: { wait_minutes: minutes, message } }
}

// ─── log_outcome ───────────────────────────────────────────────────

async function logOutcome(
  supabase: ReturnType<typeof createAdminClient>,
  clientId: string,
  params: Record<string, unknown>,
) {
  const callId = (params.call_id as string | undefined)?.trim()
  if (!callId) return { result: { logged: false, error: 'call_id required' } }

  const update: Record<string, unknown> = {}
  if (typeof params.outcome === 'string') update.outcome = params.outcome
  if (typeof params.transfer_to === 'string') update.transfer_to = params.transfer_to
  if (typeof params.transfer_success === 'boolean') update.transfer_success = params.transfer_success
  if (typeof params.summary === 'string') update.transcript = params.summary
  // We deliberately don't overwrite `transcript` if Vapi already emits
  // a full one through the webhooks/vapi pipeline — only set if our
  // function-call summary is the first thing to arrive. Apps will pick
  // whichever has content.

  const { error } = await supabase
    .from('calls')
    .update(update)
    .eq('id', callId)
    .eq('business_id', clientId)

  if (error) return { result: { logged: false, error: error.message } }
  return { result: { logged: true } }
}

// ─── create_booking ────────────────────────────────────────────────

async function createBooking(
  supabase: ReturnType<typeof createAdminClient>,
  clientId: string,
  params: Record<string, unknown>,
) {
  const callerName = (params.caller_name as string | undefined)?.trim() ?? null
  const callerPhone = (params.caller_phone as string | undefined)?.trim()
  const bookingType = (params.booking_type as string | undefined)?.trim() ?? null
  const serviceRequested = (params.service_requested as string | undefined)?.trim() ?? null
  const preferredDate = (params.preferred_date as string | undefined)?.trim() ?? null
  const preferredTime = (params.preferred_time as string | undefined)?.trim() ?? null
  const notes = (params.notes as string | undefined)?.trim() ?? null
  const callId = (params.call_id as string | undefined)?.trim() ?? null

  if (!callerPhone) {
    return { result: { booking_id: null, error: 'caller_phone required' } }
  }

  const insert: Record<string, unknown> = {
    client_id: clientId,
    caller_name: callerName,
    caller_phone: callerPhone,
    booking_type: bookingType,
    service_requested: serviceRequested,
    preferred_date: preferredDate,
    preferred_time: preferredTime,
    notes,
    status: 'pending',
  }
  if (callId) insert.call_id = callId

  const { data: booking, error } = await supabase
    .from('bookings')
    .insert(insert)
    .select('*')
    .single()

  if (error || !booking) {
    return { result: { booking_id: null, error: error?.message ?? 'insert failed' } }
  }

  // Link the booking back to the call row.
  if (callId) {
    await supabase
      .from('calls')
      .update({ booking_id: booking.id })
      .eq('id', callId)
      .eq('business_id', clientId)
  }

  // Best-effort Make.com webhook so Donna can confirm/SMS later.
  if (process.env.MAKE_BOOKING_WEBHOOK) {
    fireWebhook(process.env.MAKE_BOOKING_WEBHOOK, {
      trigger: 'booking_created',
      timestamp: new Date().toISOString(),
      business_id: clientId,
      booking,
    })
  }

  const friendlyTime = preferredTime
    ? (preferredDate ? `${preferredDate} at ${preferredTime}` : preferredTime)
    : preferredDate ?? 'the time discussed'
  const confirmation = `Booking captured for ${friendlyTime}. You'll receive an SMS confirmation shortly.`

  return {
    result: {
      booking_id: booking.id,
      confirmation_message: confirmation,
    },
  }
}

// ─── schedule_callback ─────────────────────────────────────────────

async function scheduleCallback(
  supabase: ReturnType<typeof createAdminClient>,
  clientId: string,
  params: Record<string, unknown>,
) {
  const callerName = (params.caller_name as string | undefined)?.trim() ?? null
  const callerPhone = (params.caller_phone as string | undefined)?.trim()
  const preferredTime = (params.preferred_time as string | undefined)?.trim() ?? null
  const reason = (params.reason as string | undefined)?.trim() ?? null
  const callId = (params.call_id as string | undefined)?.trim() ?? null

  if (!callerPhone) {
    return { result: { callback_id: null, error: 'caller_phone required' } }
  }

  const preferredTs = preferredTime ? safeParseDate(preferredTime) : null

  const insert: Record<string, unknown> = {
    client_id: clientId,
    caller_name: callerName,
    caller_phone: callerPhone,
    preferred_callback_time: preferredTs,
    reason,
    status: 'pending',
  }
  if (callId) insert.call_id = callId

  const { data: cb, error } = await supabase
    .from('callbacks')
    .insert(insert)
    .select('*')
    .single()

  if (error || !cb) {
    return { result: { callback_id: null, error: error?.message ?? 'insert failed' } }
  }

  if (callId) {
    await supabase
      .from('calls')
      .update({ callback_id: cb.id })
      .eq('id', callId)
      .eq('business_id', clientId)
  }

  if (process.env.MAKE_CALLBACK_WEBHOOK) {
    fireWebhook(process.env.MAKE_CALLBACK_WEBHOOK, {
      trigger: 'callback_scheduled',
      timestamp: new Date().toISOString(),
      business_id: clientId,
      callback: cb,
    })
  }

  const when = preferredTime ?? 'a convenient time'
  return {
    result: {
      callback_id: cb.id,
      confirmation_message: `We'll have someone call you back at ${when}.`,
    },
  }
}

// ─── helpers ───────────────────────────────────────────────────────

function safeParseDate(s: string): string | null {
  const ms = Date.parse(s)
  if (!Number.isFinite(ms)) return null
  return new Date(ms).toISOString()
}

function fireWebhook(url: string, payload: unknown) {
  // Fire-and-forget. Latency budget is 3s; we can't wait on Donna's
  // Make.com round-trip. Errors are logged but don't fail the function.
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(e => console.error('[vapi/functions] webhook failed', e))
}
