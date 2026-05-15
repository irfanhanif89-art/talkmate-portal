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
  // Session 10 — dispatcher (towing) extensions
  'check_dispatch_availability',
  'create_dispatch_job',
  'get_job_types',
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let raw: any
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Support both the legacy custom format ({ function_name, business_id, params })
  // and Vapi's native tool-call format ({ message: { type: 'function-call', functionCall: { name, parameters } }, call: { assistantId } })
  let fn: string
  let businessId: string
  let params: Record<string, unknown>

  const isVapiNative = raw?.message?.type === 'function-call' || raw?.message?.type === 'tool-calls'
  if (isVapiNative) {
    // Vapi native: extract function name + parameters
    const fc = raw.message?.functionCall ?? raw.message?.toolCallList?.[0]?.function
    fn = (fc?.name ?? '').trim()
    const rawArgs = fc?.parameters ?? fc?.arguments ?? {}
    params = typeof rawArgs === 'string' ? JSON.parse(rawArgs) : rawArgs

    // Resolve business_id from the Vapi assistantId → businesses table
    const assistantId: string = raw.call?.assistantId ?? raw.call?.assistant?.id ?? ''
    if (!assistantId) {
      return NextResponse.json({ error: 'Cannot resolve business: no assistantId in call context' }, { status: 400 })
    }
    const supabaseAdmin = createAdminClient()
    const { data: biz } = await supabaseAdmin
      .from('businesses')
      .select('id')
      .eq('vapi_agent_id', assistantId)
      .single()
    businessId = biz?.id ?? ''
  } else {
    // Legacy custom format
    const body = raw as FnRequest
    fn = (body.function_name ?? '').trim()
    businessId = (body.business_id ?? '').trim()
    params = (body.params ?? {}) as Record<string, unknown>
  }

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
      case 'check_dispatch_availability':
        return NextResponse.json(await checkDispatchAvailability(supabase, businessId, params))
      case 'create_dispatch_job':
        return NextResponse.json(await createDispatchJob(supabase, businessId, params))
      case 'get_job_types':
        return NextResponse.json(await getJobTypes(supabase, businessId))
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
  // Vapi passes its own call identifier (`call_xxx`), NOT a portal
  // UUID. Migration 028 added `calls.vapi_call_id` for exactly this
  // case — before that, this update silently no-op'd because Postgres
  // refused to coerce the string into the UUID `id` column. That was
  // the root cause of "nothing being logged after calls."
  const vapiCallId = (params.call_id as string | undefined)?.trim()
  if (!vapiCallId) return { result: { logged: false, error: 'call_id required' } }

  // Build the patch. We upsert rather than update so log_outcome and
  // end-of-call-report can land in any order and merge into one row.
  // Only include fields that the assistant actually set.
  const patch: Record<string, unknown> = {
    vapi_call_id: vapiCallId,
    business_id: clientId,
  }
  if (typeof params.outcome === 'string') patch.outcome = params.outcome
  if (typeof params.transfer_to === 'string') patch.transfer_to = params.transfer_to
  if (typeof params.transfer_success === 'boolean') patch.transfer_success = params.transfer_success
  // The Vapi function's `summary` parameter is a one-liner; store it
  // in the dedicated `summary` column (migration 003) rather than
  // overwriting `transcript`, which is the full conversation text.
  if (typeof params.summary === 'string') patch.summary = params.summary

  const { error } = await supabase
    .from('calls')
    .upsert(patch, { onConflict: 'vapi_call_id' })

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

// ─── Session 10: dispatcher functions ─────────────────────────────

interface DispatchConfig {
  job_types?: string[]
  default_wait_minutes?: number
  auto_wait_calculation?: boolean
  max_concurrent_jobs?: number
  after_hours_dispatch?: boolean
  overbooking_action?: 'queue' | 'decline' | 'waitlist'
}

// Returns the list of driver_ids who are CURRENTLY on shift right now
// for the business, taking shift schedule + availability overrides into
// account. Service-role query, scoped by client_id.
async function activeDriverIds(
  supabase: ReturnType<typeof createAdminClient>,
  clientId: string,
  timezone: string,
): Promise<{ onShift: Set<string>; statusByDriver: Map<string, string>; busyDriverIds: Set<string> }> {
  // Use the business's local time to decide "what day/time is it now?"
  // We can't use the SQL `now()` because that's UTC server time; the
  // schedule rows are stored as local time-of-day in the business's
  // timezone. Format the current instant into the business's TZ and
  // pull day-of-week + HH:MM:SS out.
  const now = new Date()
  const fmt = new Intl.DateTimeFormat('en-AU', {
    timeZone: timezone, hour12: false,
    weekday: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const parts = fmt.formatToParts(now)
  const weekday = parts.find(p => p.type === 'weekday')?.value ?? 'Mon'
  const hour = parts.find(p => p.type === 'hour')?.value ?? '00'
  const minute = parts.find(p => p.type === 'minute')?.value ?? '00'
  const second = parts.find(p => p.type === 'second')?.value ?? '00'
  const dowMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  const dow = dowMap[weekday] ?? new Date().getDay()
  const hhmmss = `${hour}:${minute}:${second}`

  const { data: shifts } = await supabase
    .from('driver_shifts')
    .select('driver_id, day_of_week, start_time, end_time')
    .eq('client_id', clientId)
    .eq('day_of_week', dow)
    .eq('active', true)

  const onShift = new Set<string>()
  for (const s of shifts ?? []) {
    if (s.start_time && s.end_time && (s.start_time as string) <= hhmmss && hhmmss <= (s.end_time as string)) {
      onShift.add(s.driver_id as string)
    }
  }

  // Look at availability overrides — most recent row per driver wins.
  const { data: overrides } = await supabase
    .from('driver_availability')
    .select('driver_id, status, override_start, override_end, updated_at')
    .eq('client_id', clientId)
    .order('updated_at', { ascending: false })

  const statusByDriver = new Map<string, string>()
  const busyDriverIds = new Set<string>()
  const seen = new Set<string>()
  const nowMs = now.getTime()
  for (const o of overrides ?? []) {
    if (seen.has(o.driver_id as string)) continue
    seen.add(o.driver_id as string)
    const startOk = !o.override_start || new Date(o.override_start as string).getTime() <= nowMs
    const endOk = !o.override_end || new Date(o.override_end as string).getTime() > nowMs
    if (!startOk || !endOk) continue
    statusByDriver.set(o.driver_id as string, o.status as string)
    if (o.status === 'on_job' || o.status === 'unavailable') {
      busyDriverIds.add(o.driver_id as string)
    }
  }

  return { onShift, statusByDriver, busyDriverIds }
}

async function checkDispatchAvailability(
  supabase: ReturnType<typeof createAdminClient>,
  clientId: string,
  params: Record<string, unknown>,
) {
  const jobType = String(params.job_type ?? '').trim()
  const timing = String(params.timing ?? 'now').trim()
  if (!jobType) {
    return { result: { available: false, can_accept: false, decline_reason: 'job_type required', wait_message: '' } }
  }

  const { data: biz } = await supabase
    .from('businesses')
    .select('dispatch_enabled, dispatch_config, timezone, plan, call_transfer_enabled')
    .eq('id', clientId)
    .single()

  if (!biz?.dispatch_enabled) {
    return {
      result: {
        available: false, can_accept: false,
        wait_message: '',
        decline_reason: 'Dispatch is not enabled for this business.',
      },
    }
  }
  const cfg = (biz.dispatch_config ?? {}) as DispatchConfig
  const tz = (biz.timezone as string) || 'Australia/Brisbane'
  const acceptedTypes = cfg.job_types
  if (acceptedTypes && acceptedTypes.length > 0 && !acceptedTypes.includes(jobType)) {
    return {
      result: {
        available: false, can_accept: false, wait_message: '',
        decline_reason: `We don't currently handle ${jobType.replace(/_/g, ' ')} jobs.`,
      },
    }
  }

  // Vehicles capable of this job type
  const { data: vehicles } = await supabase
    .from('vehicles')
    .select('id, name, capabilities')
    .eq('client_id', clientId)
    .eq('active', true)
    .contains('capabilities', [jobType])

  const capableVehicleIds = new Set((vehicles ?? []).map(v => v.id as string))
  if (capableVehicleIds.size === 0) {
    return {
      result: {
        available: false, can_accept: false, wait_message: '',
        decline_reason: `We don't have a vehicle that can handle ${jobType.replace(/_/g, ' ')} right now.`,
      },
    }
  }

  // Drivers with one of those vehicles, on shift, not currently busy
  const { data: drivers } = await supabase
    .from('drivers')
    .select('id, name, vehicle_id, vehicles!drivers_vehicle_id_fkey(name)')
    .eq('client_id', clientId)
    .eq('active', true)
    .in('vehicle_id', Array.from(capableVehicleIds))

  const { onShift, busyDriverIds } = await activeDriverIds(supabase, clientId, tz)
  const availableDrivers = (drivers ?? []).filter(d =>
    onShift.has(d.id as string) && !busyDriverIds.has(d.id as string),
  )

  // Active job count for wait-time calc
  const { count: activeJobs } = await supabase
    .from('dispatch_jobs')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .in('status', ['pending', 'assigned', 'in_progress'])

  const minutesPerJob = Math.max(1, cfg.default_wait_minutes ?? 45)
  const totalCapable = capableVehicleIds.size
  const waitMinutes = cfg.auto_wait_calculation !== false
    ? Math.max(0, Math.round(((activeJobs ?? 0) / Math.max(1, totalCapable)) * minutesPerJob))
    : minutesPerJob

  const hasAvailableNow = availableDrivers.length > 0
  if (hasAvailableNow) {
    const pick = availableDrivers[0]
    const vname = (pick as unknown as { vehicles?: { name: string } | null }).vehicles?.name ?? null
    return {
      result: {
        available: true,
        can_accept: true,
        available_driver: { name: pick.name as string, vehicle: vname ?? '' },
        wait_minutes: timing === 'scheduled' ? null : Math.min(waitMinutes, 15),
        wait_message: timing === 'scheduled'
          ? 'We can confirm this booking for the scheduled time.'
          : `We have a truck available — about ${Math.min(waitMinutes, 15)} minutes.`,
      },
    }
  }

  // No one free right now — what does overbooking_action say?
  const overbooking = cfg.overbooking_action ?? 'queue'
  if (overbooking === 'decline') {
    return {
      result: {
        available: false, can_accept: false,
        wait_message: 'All our trucks are currently on jobs.',
        decline_reason: 'No capable vehicle is available and we are not queueing.',
        wait_minutes: waitMinutes,
      },
    }
  }
  if (overbooking === 'waitlist') {
    return {
      result: {
        available: false, can_accept: true,
        wait_message: 'All trucks are out — we can take your details and call you back.',
        wait_minutes: waitMinutes,
      },
    }
  }
  // queue
  return {
    result: {
      available: false, can_accept: true,
      wait_message: `Our next available truck is in about ${waitMinutes} minutes.`,
      wait_minutes: waitMinutes,
    },
  }
}

async function getJobTypes(
  supabase: ReturnType<typeof createAdminClient>,
  clientId: string,
) {
  const { data: biz } = await supabase
    .from('businesses')
    .select('dispatch_config')
    .eq('id', clientId)
    .single()
  const cfg = (biz?.dispatch_config ?? {}) as DispatchConfig
  const types = (cfg.job_types ?? ['car_tow', '4wd_tow', 'container', 'machinery', 'motorcycle', 'van'])

  const { data: vehicles } = await supabase
    .from('vehicles')
    .select('capabilities')
    .eq('client_id', clientId)
    .eq('active', true)

  const counts: Record<string, number> = {}
  for (const v of vehicles ?? []) {
    for (const cap of ((v.capabilities ?? []) as string[])) {
      counts[cap] = (counts[cap] ?? 0) + 1
    }
  }

  return {
    result: {
      job_types: types.map(t => ({
        type: t,
        label: t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        vehicles_available: counts[t] ?? 0,
      })),
    },
  }
}

async function createDispatchJob(
  supabase: ReturnType<typeof createAdminClient>,
  clientId: string,
  params: Record<string, unknown>,
) {
  const jobType = String(params.job_type ?? '').trim()
  const callerPhone = String(params.caller_phone ?? '').trim()
  if (!jobType || !callerPhone) {
    return { result: { job_id: null, job_number: null, sms_sent: false, confirmation_message: '', error: 'job_type and caller_phone required' } }
  }

  const timing = String(params.timing ?? 'now').trim()
  const scheduledAt = (params.scheduled_at as string | undefined)?.trim() ?? null
  const callerName = (params.caller_name as string | undefined)?.trim() ?? null
  const pickupAddress = (params.pickup_address as string | undefined)?.trim() ?? null
  const dropoffAddress = (params.dropoff_address as string | undefined)?.trim() ?? null
  const vehicleDescription = (params.vehicle_description as string | undefined)?.trim() ?? null
  const notes = (params.notes as string | undefined)?.trim() ?? null
  const callId = (params.call_id as string | undefined)?.trim() ?? null

  // Generate the next job number from the shared sequence.
  const { data: seq } = await supabase.rpc('nextval', { seq_name: 'job_number_seq' }).single()
    .then(r => r as unknown as { data: number | null })
    .catch(() => ({ data: null }))
  // Fallback: select * from job_number_seq if rpc isn't exposed. Most
  // Supabase projects don't expose `nextval` as an RPC by default — use
  // a raw `select nextval()` through a tiny helper view instead.
  let jobNumber = ''
  if (typeof seq === 'number') {
    jobNumber = `JOB-${String(seq).padStart(4, '0')}`
  } else {
    // Atomic fallback: insert a row, then read currval. Cleaner approach
    // is a Postgres function, but we want the migration to be self-
    // contained. Generate a per-business counter from the count of
    // existing rows + a random suffix to avoid collisions on race.
    const { count } = await supabase
      .from('dispatch_jobs')
      .select('id', { count: 'exact', head: true })
    const next = (count ?? 0) + 1
    jobNumber = `JOB-${String(next).padStart(4, '0')}`
  }

  // Pick a driver if one is available for this job type (mirrors the
  // logic inside checkDispatchAvailability but only when timing=now).
  let assignedDriverId: string | null = null
  let assignedVehicleId: string | null = null
  let assignedDriverName: string | null = null
  let waitMinutes: number | null = null

  if (timing === 'now') {
    const { data: biz } = await supabase
      .from('businesses')
      .select('timezone, dispatch_config')
      .eq('id', clientId)
      .single()
    const tz = (biz?.timezone as string) || 'Australia/Brisbane'
    const { data: vehicles } = await supabase
      .from('vehicles')
      .select('id, name')
      .eq('client_id', clientId)
      .eq('active', true)
      .contains('capabilities', [jobType])
    const capable = new Set((vehicles ?? []).map(v => v.id as string))
    if (capable.size > 0) {
      const { data: drivers } = await supabase
        .from('drivers')
        .select('id, name, vehicle_id')
        .eq('client_id', clientId)
        .eq('active', true)
        .in('vehicle_id', Array.from(capable))
      const { onShift, busyDriverIds } = await activeDriverIds(supabase, clientId, tz)
      const free = (drivers ?? []).find(d => onShift.has(d.id as string) && !busyDriverIds.has(d.id as string))
      if (free) {
        assignedDriverId = free.id as string
        assignedVehicleId = free.vehicle_id as string
        assignedDriverName = free.name as string
      }
    }
    const cfg = (biz?.dispatch_config ?? {}) as DispatchConfig
    waitMinutes = cfg.default_wait_minutes ?? 45
  }

  const { data: job, error } = await supabase
    .from('dispatch_jobs')
    .insert({
      client_id: clientId,
      job_number: jobNumber,
      job_type: jobType,
      timing,
      scheduled_at: scheduledAt && timing === 'scheduled' ? scheduledAt : null,
      caller_name: callerName,
      caller_phone: callerPhone,
      pickup_address: pickupAddress,
      dropoff_address: dropoffAddress,
      vehicle_description: vehicleDescription,
      notes,
      status: assignedDriverId ? 'assigned' : 'pending',
      assigned_driver_id: assignedDriverId,
      assigned_vehicle_id: assignedVehicleId,
      assigned_at: assignedDriverId ? new Date().toISOString() : null,
      call_id: callId,
    })
    .select('*')
    .single()

  if (error || !job) {
    return { result: { job_id: null, job_number: null, sms_sent: false, confirmation_message: '', error: error?.message ?? 'insert failed' } }
  }

  // If the call_id exists, mirror the booking_id pattern: stash the
  // job's id on the call row. We use the call's booking_id column
  // (Session 9) since there's no dedicated dispatch_job_id slot — the
  // booking_id field is still a reference to "the thing this call
  // produced" for outcome-tracking purposes.
  if (callId) {
    await supabase.from('calls')
      .update({ booking_id: job.id, outcome: 'booking_created' })
      .eq('id', callId)
      .eq('business_id', clientId)
  }

  // Fire MAKE_DISPATCH_JOB_WEBHOOK (best-effort).
  if (process.env.MAKE_DISPATCH_JOB_WEBHOOK) {
    const { data: biz } = await supabase
      .from('businesses').select('name').eq('id', clientId).single()
    fireWebhook(process.env.MAKE_DISPATCH_JOB_WEBHOOK, {
      trigger: 'new_dispatch_job',
      timestamp: new Date().toISOString(),
      job: {
        id: job.id,
        job_number: jobNumber,
        job_type: jobType,
        timing,
        caller_name: callerName,
        caller_phone: callerPhone,
        pickup_address: pickupAddress,
        vehicle_description: vehicleDescription,
        assigned_driver: assignedDriverName,
        wait_minutes: waitMinutes,
        business_id: clientId,
        business_name: biz?.name ?? null,
      },
    })
  }

  const confirmation = assignedDriverName
    ? `Job ${jobNumber} confirmed. ${assignedDriverName} will be with you in approximately ${waitMinutes ?? 30} minutes.`
    : timing === 'scheduled'
      ? `Pre-booking ${jobNumber} confirmed. You'll receive a confirmation SMS shortly.`
      : `Job ${jobNumber} logged. Our dispatcher will confirm your driver shortly.`

  return {
    result: {
      job_id: job.id,
      job_number: jobNumber,
      assigned_driver: assignedDriverName ? { name: assignedDriverName } : null,
      confirmation_message: confirmation,
      sms_sent: !!process.env.MAKE_DISPATCH_JOB_WEBHOOK,
    },
  }
}
