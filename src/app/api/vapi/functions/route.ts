import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import {
  sendSMS,
  templateBookingReceived,
  templateDispatcherNotification,
} from '@/lib/sms'

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

// Session 17B -- removed get_wait_time / get_availability and the three
// Session 10 dispatcher handlers (check_dispatch_availability,
// create_dispatch_job, get_job_types). None of them were ever synced
// to a Vapi agent and the Session 15 scheduler functions superseded them.
const VALID_FNS = new Set([
  'check_caller',
  'get_team',
  'log_outcome',
  'create_booking',
  'schedule_callback',
  // Session 14 — distance quoting (Growth/Pro only, gated inside handler)
  'calculate_job_quote',
  'log_quote_addon',
  // Session 15 — scheduler + waitlist
  'check_availability',
  'add_to_waitlist',
  'cancel_booking',
  'reschedule_booking',
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
  // Session 28 (H12): VAPI_WEBHOOK_SECRET is now mandatory. Previously
  // an unset secret silently disabled auth — an open endpoint that
  // could write bookings, callbacks, SMS for any business_id sent in
  // the body.
  const expected = process.env.VAPI_WEBHOOK_SECRET
  if (!expected) {
    console.error('[vapi/functions] VAPI_WEBHOOK_SECRET is not set — rejecting all requests')
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 })
  }
  const got = request.headers.get('x-vapi-secret') ?? request.headers.get('authorization') ?? ''
  const normalized = got.startsWith('Bearer ') ? got.slice(7) : got
  if (normalized !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

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
    // Session 28 (H12): do NOT trust body.business_id — it lets anyone
    // with the webhook secret call any business's tools. Resolve via
    // the Vapi assistantId on the request and gate suspended /
    // cancelled / expired accounts.
    const body = raw as FnRequest & { call?: { assistantId?: string }; assistant?: { id?: string }; assistantId?: string }
    fn = (body.function_name ?? '').trim()
    params = (body.params ?? {}) as Record<string, unknown>
    const assistantId = body.call?.assistantId ?? body.assistant?.id ?? body.assistantId
    if (!assistantId) {
      return NextResponse.json({ error: 'Missing assistantId' }, { status: 400 })
    }
    const supabaseAdmin = createAdminClient()
    const { data: business } = await supabaseAdmin
      .from('businesses')
      .select('id, plan, account_status')
      .eq('vapi_agent_id', assistantId)
      .maybeSingle()
    if (!business) {
      return NextResponse.json({ error: 'Unknown assistant' }, { status: 404 })
    }
    if (!['active', 'trial'].includes(business.account_status as string)) {
      return NextResponse.json({ error: 'Account not active' }, { status: 403 })
    }
    businessId = business.id
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
      case 'log_outcome':
        return NextResponse.json(await logOutcome(supabase, businessId, params))
      case 'create_booking':
        return NextResponse.json(await createBooking(supabase, businessId, params))
      case 'schedule_callback':
        return NextResponse.json(await scheduleCallback(supabase, businessId, params))
      case 'calculate_job_quote':
        return NextResponse.json(await calculateJobQuote(supabase, businessId, params))
      case 'log_quote_addon':
        return NextResponse.json(await logQuoteAddon(supabase, businessId, params))
      case 'check_availability':
        return NextResponse.json(await checkAvailability(supabase, businessId, params))
      case 'add_to_waitlist':
        return NextResponse.json(await addToWaitlist(supabase, businessId, params))
      case 'cancel_booking':
        return NextResponse.json(await cancelBooking(supabase, businessId, params))
      case 'reschedule_booking':
        return NextResponse.json(await rescheduleBooking(supabase, businessId, params))
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
  if (!phone) return { result: { is_vip: false, is_existing: false, is_repeat: false, caller_type: 'unknown' } }

  // Need the business's repeat-caller threshold + transfer number.
  const { data: biz } = await supabase
    .from('businesses')
    .select('escalation_config, notifications_config, name')
    .eq('id', clientId)
    .maybeSingle()
  const cfg = (biz?.escalation_config ?? {}) as EscalationConfig
  const threshold = Math.max(1, cfg.repeat_caller_threshold ?? 3)
  const notif = (biz?.notifications_config ?? {}) as Record<string, unknown>
  const transferNumber = (notif.live_transfer_number as string | undefined)?.trim() || null

  // Session 15 — match the inbound phone against:
  //  (a) vip_callers.phone (legacy primary number)
  //  (b) vip_callers.linked_numbers[*].phone (Accounts with multiple lines)
  // Both lookups use the LAST 9 DIGITS as the comparison key so we don't
  // fight with caller-ID format variations (+61, 0061, 04…). Account
  // matches trump VIP matches because trade clients usually call from
  // multiple shared lines; VIP bypass is for personal contacts.
  const last9 = phone.replace(/\D/g, '').slice(-9)

  const { data: vipRows } = await supabase
    .from('vip_callers')
    .select('id, phone, name, note, action, account_type, vip_bypass, transfer_to_member_id, active, company_name, billing_contact_name, billing_contact_email, linked_numbers, team_members!vip_callers_transfer_to_member_id_fkey(name, phone)')
    .eq('client_id', clientId)
    .eq('active', true)

  const candidates = vipRows ?? []
  function matchesRow(row: typeof candidates[number]): boolean {
    const primary = String(row.phone ?? '').replace(/\D/g, '')
    if (primary && primary.slice(-9) === last9) return true
    const numbers = Array.isArray(row.linked_numbers) ? (row.linked_numbers as Array<{ phone?: string }>) : []
    return numbers.some(n => {
      const p = String(n?.phone ?? '').replace(/\D/g, '')
      return p && p.slice(-9) === last9
    })
  }

  const account = candidates.find(r => r.account_type === 'account' && matchesRow(r)) ?? null
  const vipBypass = !account ? candidates.find(r => r.account_type === 'vip' && r.vip_bypass === true && matchesRow(r)) ?? null : null
  const regularVip = !account && !vipBypass ? candidates.find(r => r.account_type === 'vip' && r.vip_bypass !== true && matchesRow(r)) ?? null : null

  // Contact lookup (existing caller history)
  const { data: contact } = await supabase
    .from('contacts')
    .select('name, call_count')
    .eq('client_id', clientId)
    .eq('phone', phone)
    .eq('is_merged', false)
    .maybeSingle()

  const callCount = contact?.call_count ?? 0

  // Session 17B -- log every check_caller invocation so we can see in
  // Vercel function logs whether Vapi is sending the phone in a usable
  // format, what last-9-digit key we built, and which row (if any) was
  // matched. Helps diagnose VIPs being missed in production.
  const resultType: 'account' | 'vip_bypass' | 'vip' | 'existing' | 'unknown' =
    account ? 'account'
    : vipBypass ? 'vip_bypass'
    : regularVip ? 'vip'
    : contact ? 'existing'
    : 'unknown'
  console.log('[check_caller]', {
    raw_phone: params.phone ?? null,
    normalised_phone: phone,
    last9,
    vip_match: regularVip ? regularVip.id : null,
    bypass_match: vipBypass ? vipBypass.id : null,
    account_match: account ? account.id : null,
    contact_match: contact ? contact.name ?? 'matched' : null,
    candidates_total: candidates.length,
    result_type: resultType,
    client_id: clientId,
  })

  if (account) {
    return {
      result: {
        is_existing: true,
        is_vip: false,
        is_repeat: callCount >= threshold,
        caller_type: 'account' as const,
        account_id: account.id,
        company_name: account.company_name ?? account.name ?? null,
        billing_contact_name: account.billing_contact_name ?? null,
        billing_contact_email: account.billing_contact_email ?? null,
        rate_type: 'account' as const,
        call_count: callCount,
      },
    }
  }

  if (vipBypass) {
    return {
      result: {
        is_existing: true,
        is_vip: true,
        is_repeat: callCount >= threshold,
        caller_type: 'vip_bypass' as const,
        vip_id: vipBypass.id,
        vip_name: vipBypass.name ?? null,
        vip_note: vipBypass.note ?? null,
        transfer_number: transferNumber,
        business_name: biz?.name ?? null,
        call_count: callCount,
      },
    }
  }

  const transferMember = (regularVip as unknown as { team_members?: { name: string; phone: string } | null })?.team_members ?? null
  if (regularVip) {
    return {
      result: {
        is_vip: true,
        caller_type: 'vip' as const,
        vip_id: regularVip.id,
        vip_name: regularVip.name ?? null,
        vip_note: regularVip.note ?? null,
        vip_action: regularVip.action ?? null,
        vip_transfer_member: transferMember,
        is_existing: !!contact,
        existing_name: contact?.name ?? null,
        call_count: callCount,
        is_repeat: callCount >= threshold,
      },
    }
  }

  return {
    result: {
      is_vip: false,
      caller_type: contact ? 'existing' as const : 'unknown' as const,
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

// Session 17B -- get_wait_time / get_availability handlers removed.
// Neither tool was ever pushed to a Vapi agent via the sync routes, so
// the case statements above will never be reached. The dispatcher
// wait-time concept has been superseded by check_availability (Session 15).

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
//
// Session 17B -- rewritten against the Session 15 bookings schema and
// wired to the direct Twilio SMS path. Sets booking_source = 'agent' so
// analytics correctly attribute agent-driven bookings. Calls sendSMS()
// when scheduler_settings.booking_confirmation_sms is true. Make.com
// MAKE_BOOKING_WEBHOOK has been retired here -- /lib/sms.ts is the
// canonical SMS path.

async function createBooking(
  supabase: ReturnType<typeof createAdminClient>,
  clientId: string,
  params: Record<string, unknown>,
) {
  const callerName = (params.caller_name as string | undefined)?.trim() ?? null
  const callerPhone = (params.caller_phone as string | undefined)?.trim()
  const scheduledDate = (params.scheduled_date as string | undefined)?.trim() ?? null
  const scheduledTime = (params.scheduled_time as string | undefined)?.trim() ?? null
  const pickupAddress = (params.pickup_address as string | undefined)?.trim() ?? null
  const dropoffAddress = (params.dropoff_address as string | undefined)?.trim() ?? null
  const pickupContactName = (params.pickup_contact_name as string | undefined)?.trim() ?? null
  const pickupContactPhone = (params.pickup_contact_phone as string | undefined)?.trim() ?? null
  const dropoffContactName = (params.dropoff_contact_name as string | undefined)?.trim() ?? null
  const dropoffContactPhone = (params.dropoff_contact_phone as string | undefined)?.trim() ?? null
  const truckType = (params.truck_type as string | undefined)?.trim() ?? null
  const rateType = (params.rate_type as string | undefined)?.trim() ?? null
  const description = (params.description as string | undefined)?.trim()
    ?? (params.notes as string | undefined)?.trim()
    ?? null
  const accountId = (params.account_id as string | undefined)?.trim() ?? null
  const driverId = (params.driver_id as string | undefined)?.trim() ?? null
  const callId = (params.call_id as string | undefined)?.trim() ?? null

  if (!callerName || !callerPhone || !scheduledDate || !scheduledTime) {
    return {
      result: {
        booking_id: null,
        error: 'caller_name, caller_phone, scheduled_date, and scheduled_time are required',
      },
    }
  }

  // Combine date + time into a single ISO timestamp. Accept HH:MM
  // (24-hour) preferred but tolerate single-hour ("9" -> "09:00") and
  // h:mm am/pm form just in case the agent sends a casual string.
  const scheduledStart = buildScheduledTimestamp(scheduledDate, scheduledTime)
  if (!scheduledStart) {
    return {
      result: {
        booking_id: null,
        error: `Could not parse scheduled_date "${scheduledDate}" and scheduled_time "${scheduledTime}". Use YYYY-MM-DD and HH:MM.`,
      },
    }
  }

  // Pull scheduler defaults so we can compute scheduled_end and decide
  // whether to send confirmation SMS. maybeSingle keeps us safe if no
  // row exists yet -- we fall back to a 60 minute slot.
  const { data: settings } = await supabase
    .from('scheduler_settings')
    .select('default_duration_minutes, default_duration_tilt_minutes, default_duration_sideloader_minutes, booking_confirmation_sms')
    .eq('client_id', clientId)
    .maybeSingle()

  const durationMinutes = pickDurationMinutes(truckType, settings as Record<string, unknown> | null)
  const scheduledEnd = new Date(new Date(scheduledStart).getTime() + durationMinutes * 60_000).toISOString()
  const shouldSendSms = (settings as { booking_confirmation_sms?: boolean } | null)?.booking_confirmation_sms === true

  const insert: Record<string, unknown> = {
    client_id: clientId,
    caller_name: callerName,
    caller_phone: callerPhone,
    pickup_address: pickupAddress,
    pickup_contact_name: pickupContactName,
    pickup_contact_phone: pickupContactPhone,
    dropoff_address: dropoffAddress,
    dropoff_contact_name: dropoffContactName,
    dropoff_contact_phone: dropoffContactPhone,
    truck_type: truckType,
    rate_type: rateType,
    description,
    account_id: accountId,
    driver_id: driverId,
    scheduled_start: scheduledStart,
    scheduled_end: scheduledEnd,
    booking_source: 'agent',
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

  // ─── Session 29 — Hayden SMS confirmation loop ───────────────────
  //
  // 1. Generate a 6-char booking ref (first six chars of the UUID,
  //    minus hyphens, uppercased). Dispatcher quotes this back in
  //    YES/NO replies so we can find the right booking in
  //    /api/twilio/sms-reply.
  // 2. Fetch the business row once for both the dispatcher and
  //    caller SMS paths (previous code fetched it only inside the
  //    confirmation-sms branch).
  // 3. If notifications_config.dispatcher_alerts is on, text the
  //    dispatcher from TWILIO_CONFIRMATION_NUMBER asking for YES/NO.
  //    That number has its Twilio SMS webhook pointed at
  //    /api/twilio/sms-reply.
  // 4. Caller now gets a "received" SMS (not "confirmed") — the
  //    booking is still pending until the dispatcher replies.
  // 5. Persist confirmation_ref + dispatcher_notified_at in a single
  //    update; sms_confirmation_sent stamps when the caller's SMS
  //    succeeds (kept for compatibility with the reminders cron).
  const confirmationRef = booking.id.replace(/-/g, '').substring(0, 6).toUpperCase()
  const friendlyTime = formatFriendlyTime(scheduledStart)
  const friendlyDate = formatFriendlyDate(scheduledStart)

  const { data: biz } = await supabase
    .from('businesses')
    .select('name, notifications_config')
    .eq('id', clientId)
    .maybeSingle()
  const notifConfig = (biz?.notifications_config ?? {}) as Record<string, unknown>
  const dispatcherNumber = notifConfig.dispatcher_number as string | undefined
  const dispatcherAlerts = notifConfig.dispatcher_alerts === true
  const businessName = (biz?.name as string | undefined) || 'us'

  const bookingUpdate: Record<string, unknown> = { confirmation_ref: confirmationRef }

  // Dispatcher SMS — operational, bypasses plan limits in sendSMS.
  if (dispatcherAlerts && dispatcherNumber) {
    const dispatcherSms = await sendSMS({
      to: dispatcherNumber,
      from: process.env.TWILIO_CONFIRMATION_NUMBER,
      message: templateDispatcherNotification({
        confirmationRef,
        callerName: callerName ?? 'Customer',
        pickupAddress: pickupAddress ?? 'TBC',
        dropoffAddress: dropoffAddress ?? 'TBC',
        truckType: truckType ?? 'truck',
        scheduledDate: friendlyDate,
        scheduledTime: friendlyTime,
      }),
      clientId,
      smsType: 'dispatcher_job_notification',
      bookingId: booking.id,
    })
    if (dispatcherSms.success) {
      bookingUpdate.dispatcher_notified_at = new Date().toISOString()
    } else {
      console.warn('[create_booking] dispatcher SMS failed', {
        clientId, bookingId: booking.id, reason: dispatcherSms.reason, error: dispatcherSms.error,
      })
    }
  }

  // Caller-facing "received" SMS. Same gate as before
  // (scheduler_settings.booking_confirmation_sms) — we are reusing
  // that opt-in flag because the caller message replaces the old
  // "confirmation" send. Counts against the client's monthly quota,
  // same as booking_confirmation did before.
  let smsSent = false
  if (shouldSendSms) {
    const message = templateBookingReceived({
      callerName: callerName ?? 'there',
      truckType: truckType ?? 'job',
      businessName,
      scheduledDate: friendlyDate,
      scheduledTime: friendlyTime,
    })
    const sms = await sendSMS({
      to: callerPhone,
      message,
      clientId,
      smsType: 'booking_received',
      bookingId: booking.id,
    })
    if (sms.success) {
      smsSent = true
      bookingUpdate.sms_confirmation_sent = true
    }
  }

  await supabase
    .from('bookings')
    .update(bookingUpdate)
    .eq('id', booking.id)

  const confirmation = smsSent
    ? `Booked for ${friendlyDate} at ${friendlyTime}. We've texted ${callerName ?? 'the caller'} that we've received the request and we'll confirm shortly.`
    : `Booked for ${friendlyDate} at ${friendlyTime}.`

  return {
    result: {
      booking_id: booking.id,
      confirmation_ref: confirmationRef,
      scheduled_start: scheduledStart,
      sms_sent: smsSent,
      confirmation_message: confirmation,
    },
  }
}

function buildScheduledTimestamp(date: string, time: string): string | null {
  // date: YYYY-MM-DD ideally. Try Date.parse on `${date} ${time}` first;
  // if that fails, attempt to normalise common casual forms.
  const direct = new Date(`${date}T${normaliseTime(time)}:00`)
  if (!Number.isNaN(direct.getTime())) return direct.toISOString()
  const fallback = new Date(`${date} ${time}`)
  if (!Number.isNaN(fallback.getTime())) return fallback.toISOString()
  return null
}

function normaliseTime(time: string): string {
  // "9" -> "09:00", "9am" -> "09:00", "2:30pm" -> "14:30", "14:30" -> "14:30"
  const t = time.trim().toLowerCase()
  const ampm = /(am|pm)$/.exec(t)
  const body = t.replace(/(am|pm)$/, '').trim()
  const [hRaw, mRaw = '00'] = body.split(':')
  let h = parseInt(hRaw, 10)
  const m = parseInt(mRaw, 10)
  if (Number.isNaN(h) || Number.isNaN(m)) return time
  if (ampm) {
    if (ampm[1] === 'pm' && h < 12) h += 12
    if (ampm[1] === 'am' && h === 12) h = 0
  }
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function pickDurationMinutes(
  truckType: string | null,
  settings: Record<string, unknown> | null,
): number {
  if (!settings) return 60
  if (truckType === 'loaded_tilt_tray' || truckType === 'empty_tilt_tray') {
    const v = Number(settings.default_duration_tilt_minutes)
    if (Number.isFinite(v) && v > 0) return v
  }
  if (truckType === 'sideloader_40ft') {
    const v = Number(settings.default_duration_sideloader_minutes)
    if (Number.isFinite(v) && v > 0) return v
  }
  const fallback = Number(settings.default_duration_minutes)
  return Number.isFinite(fallback) && fallback > 0 ? fallback : 60
}

function formatFriendlyDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })
}

function formatFriendlyTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true })
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

  // Session 24 — close the loop on callback requests.
  //
  // Until this session the agent confirmed verbally and we logged the
  // callback row, but no SMS reached either side. Result: callers
  // walked away unsure whether their request had landed, and
  // dispatchers had no inbox to triage. Both sends bypass plan
  // limits (see BYPASS_PLAN_LIMIT_TYPES in sms.ts) so they always
  // fire — these are operational guarantees, not marketing.
  //
  // Fire-and-forget: a Twilio failure here must not break the Vapi
  // tool call response. We log errors but never throw upstream.
  try {
    const { data: businessRow } = await supabase
      .from('businesses')
      .select('name')
      .eq('id', clientId)
      .maybeSingle()
    const businessName = (businessRow?.name as string | undefined) ?? 'us'

    if (callerPhone) {
      const callerSms = await sendSMS({
        to: callerPhone,
        message: `Hi, thanks for calling ${businessName}. We have noted your callback request and someone will be in touch with you shortly.`,
        clientId,
        smsType: 'callback_confirmation',
      })
      if (!callerSms.success) {
        console.warn('[schedule_callback] caller SMS failed', { clientId, reason: callerSms.reason, error: callerSms.error })
      }
    }

    const { data: notifConfig } = await supabase
      .from('notifications_config')
      .select('dispatcher_number, dispatcher_alerts')
      .eq('client_id', clientId)
      .maybeSingle()

    const dispatcherNumber = (notifConfig?.dispatcher_number as string | undefined) ?? null
    const dispatcherAlerts = (notifConfig?.dispatcher_alerts as boolean | undefined) === true

    if (dispatcherAlerts && dispatcherNumber) {
      const reasonText = reason ?? 'no reason given'
      const callbackNameText = callerName ?? 'A caller'
      const callbackPhoneText = callerPhone ?? 'unknown number'
      const dispatcherSms = await sendSMS({
        to: dispatcherNumber,
        message: `Callback request — ${callbackNameText} (${callbackPhoneText}) — ${reasonText}. Please call them back.`,
        clientId,
        smsType: 'dispatcher_callback_alert',
      })
      if (!dispatcherSms.success) {
        console.warn('[schedule_callback] dispatcher SMS failed', { clientId, reason: dispatcherSms.reason, error: dispatcherSms.error })
      }
    }
  } catch (e) {
    console.error('[schedule_callback] SMS notification block failed', (e as Error).message)
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


// ─── Session 14: distance quoting ─────────────────────────────────

interface QuoteConfig {
  enabled?: boolean
  quote_validity_minutes?: number
  poa_threshold_km?: number
  after_hours_surcharge_percent?: number
  minimum_job_fee?: number
  currency?: string
}

interface ServiceEntry {
  id?: string
  name?: string
  price?: number | string
  enabled?: boolean
  category?: string
}

interface QuoteAddon {
  name: string
  price: number
  quantity: number
}

type TruckType = 'loaded_tilt_tray' | 'empty_tilt_tray' | 'sideloader_40ft'
type RateType = 'account' | 'retail'

const POA_LIMIT_TILT = 100
const POA_LIMIT_SIDELOADER = 30

function bandLabel(distanceKm: number): string | null {
  if (distanceKm <= 0) return null
  if (distanceKm <= 10) return '0 to 10km'
  if (distanceKm <= 20) return '10 to 20km'
  if (distanceKm <= 30) return '20 to 30km'
  if (distanceKm <= 40) return '30 to 40km'
  if (distanceKm <= 50) return '40 to 50km'
  if (distanceKm <= 60) return '50 to 60km'
  if (distanceKm <= 70) return '60 to 70km'
  if (distanceKm <= 80) return '70 to 80km'
  if (distanceKm <= 90) return '80 to 90km'
  if (distanceKm <= 100) return '90 to 100km'
  return null
}

function truckLabel(t: TruckType): string {
  switch (t) {
    case 'loaded_tilt_tray': return 'Loaded Tilt Tray'
    case 'empty_tilt_tray': return 'Empty Tilt Tray'
    case 'sideloader_40ft': return 'Sideloader 40ft'
  }
}

// Build the service name we expect to find in businesses.services for a
// given truck / rate / distance band. Format mirrors what was loaded into
// the GM Towing catalog.
function buildServicePattern(truck: TruckType, rate: RateType, band: string): string {
  if (truck === 'sideloader_40ft') return `Sideloader 40ft - ${band}`
  const base = truck === 'loaded_tilt_tray' ? 'Loaded Tilt Tray' : 'Empty Tilt Tray'
  return rate === 'retail' ? `${base} - Private ${band}` : `${base} - ${band}`
}

function priceOf(s: ServiceEntry | null | undefined): number | null {
  if (!s) return null
  if (typeof s.price === 'number') return s.price
  if (typeof s.price === 'string') {
    const n = parseFloat(s.price.replace(/[^0-9.]/g, ''))
    return Number.isFinite(n) ? n : null
  }
  return null
}

function findService(services: ServiceEntry[], targetName: string): ServiceEntry | null {
  const needle = targetName.toLowerCase().trim()
  return services.find(s => s.enabled !== false && (s.name ?? '').toLowerCase().trim() === needle) ?? null
}

interface SchedulerOpHours {
  monday?: { open?: string; close?: string; enabled?: boolean }
  tuesday?: { open?: string; close?: string; enabled?: boolean }
  wednesday?: { open?: string; close?: string; enabled?: boolean }
  thursday?: { open?: string; close?: string; enabled?: boolean }
  friday?: { open?: string; close?: string; enabled?: boolean }
  saturday?: { open?: string; close?: string; enabled?: boolean }
  sunday?: { open?: string; close?: string; enabled?: boolean }
}

function isAfterHours(opHours: SchedulerOpHours | null, timezone: string): boolean {
  // No scheduler row → fall back to 06:00-18:00 Mon-Fri local default.
  const now = new Date()
  const fmt = new Intl.DateTimeFormat('en-AU', {
    timeZone: timezone || 'Australia/Melbourne', hour12: false,
    weekday: 'short', hour: '2-digit', minute: '2-digit',
  })
  const parts = fmt.formatToParts(now)
  const weekday = parts.find(p => p.type === 'weekday')?.value ?? 'Mon'
  const hh = parts.find(p => p.type === 'hour')?.value ?? '00'
  const mm = parts.find(p => p.type === 'minute')?.value ?? '00'
  const hhmm = `${hh}:${mm}`
  const dayMap: Record<string, keyof SchedulerOpHours> = {
    Sun: 'sunday', Mon: 'monday', Tue: 'tuesday', Wed: 'wednesday',
    Thu: 'thursday', Fri: 'friday', Sat: 'saturday',
  }
  if (opHours) {
    const day = opHours[dayMap[weekday] ?? 'monday']
    if (!day || day.enabled === false) return true
    const open = day.open ?? '06:00'
    const close = day.close ?? '18:00'
    return hhmm < open || hhmm >= close
  }
  // Default: weekday 06:00 - 18:00
  const isWeekend = weekday === 'Sat' || weekday === 'Sun'
  if (isWeekend) return true
  return hhmm < '06:00' || hhmm >= '18:00'
}

async function calculateJobQuote(
  supabase: ReturnType<typeof createAdminClient>,
  clientId: string,
  params: Record<string, unknown>,
) {
  const pickupAddress = String(params.pickup_address ?? '').trim()
  const dropoffAddress = String(params.dropoff_address ?? '').trim()
  const truckType = String(params.truck_type ?? '').trim() as TruckType
  const rateType = String(params.rate_type ?? '').trim() as RateType
  const callerPhone = (params.caller_phone as string | undefined)?.trim() ?? null
  const callId = (params.call_id as string | undefined)?.trim() ?? null

  if (!pickupAddress || !dropoffAddress || !truckType || !rateType) {
    return { result: { quoted: false, reason: 'missing_params', message: 'pickup_address, dropoff_address, truck_type, rate_type required' } }
  }
  if (!['loaded_tilt_tray', 'empty_tilt_tray', 'sideloader_40ft'].includes(truckType)) {
    return { result: { quoted: false, reason: 'invalid_truck_type', message: 'Unknown truck type.' } }
  }
  if (!['account', 'retail'].includes(rateType)) {
    return { result: { quoted: false, reason: 'invalid_rate_type', message: 'Unknown rate type.' } }
  }

  // ---- plan gate ---------------------------------------------------
  const { data: biz } = await supabase
    .from('businesses')
    .select('plan, services, quote_config, timezone')
    .eq('id', clientId)
    .maybeSingle()
  if (!biz) {
    return { result: { quoted: false, reason: 'unknown_client', message: 'Quote engine could not load business config.' } }
  }
  if (biz.plan === 'starter') {
    return { result: { quoted: false, reason: 'plan_locked', message: 'Quote calculation is available on Growth and Pro plans.' } }
  }
  const services = Array.isArray(biz.services) ? (biz.services as ServiceEntry[]) : []
  const cfg = ((biz.quote_config ?? {}) as QuoteConfig) || {}
  if (cfg.enabled === false) {
    return { result: { quoted: false, reason: 'quote_disabled', message: 'Quoting is currently disabled for this business.' } }
  }

  // ---- distance + service area via /api/maps/distance --------------
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.talkmate.com.au'
  const internalSecret = process.env.INTERNAL_API_SECRET || process.env.VAPI_WEBHOOK_SECRET || ''
  let mapsRes: Response
  try {
    mapsRes = await fetch(`${appUrl}/api/maps/distance`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': internalSecret,
      },
      body: JSON.stringify({
        origin: pickupAddress,
        destination: dropoffAddress,
        client_id: clientId,
      }),
    })
  } catch (e) {
    console.error('[calculate_job_quote] maps fetch failed', e)
    return { result: { quoted: false, reason: 'maps_unavailable', message: 'Could not calculate the distance right now. Please take their details and let them know we will call back.' } }
  }
  const maps = await mapsRes.json().catch(() => ({}))
  if (!maps?.success) {
    return { result: { quoted: false, reason: 'maps_error', message: 'I had trouble calculating that distance. Can I take your name and number and have someone call you back with a quote?' } }
  }
  if (maps.within_service_area === false) {
    return { result: { quoted: false, reason: 'outside_service_area', message: 'Unfortunately that job falls outside our service area.' } }
  }
  if (maps.origin_confidence === 'low') {
    return { result: { quoted: false, reason: 'address_unclear', message: 'I want to make sure I have the right address. Can you confirm the pickup address for me?' } }
  }
  if (maps.destination_confidence === 'low') {
    return { result: { quoted: false, reason: 'address_unclear', message: 'Can you confirm the dropoff address for me?' } }
  }

  const distanceKm = Number(maps.distance_km ?? 0)
  const durationMinutes = Number(maps.duration_minutes ?? 0)

  // ---- POA bands ---------------------------------------------------
  const poaThreshold = cfg.poa_threshold_km ?? (truckType === 'sideloader_40ft' ? POA_LIMIT_SIDELOADER : POA_LIMIT_TILT)
  if (distanceKm > poaThreshold) {
    await insertPoaQuote(supabase, clientId, callId, callerPhone, pickupAddress, dropoffAddress, maps, truckType, rateType, distanceKm, durationMinutes)
    return { result: { quoted: false, reason: 'poa', message: 'That job is priced on application. Let me get the team to call you back with a quote. Can I take your name and best contact number?' } }
  }

  // ---- match band → service entry → price -------------------------
  const band = bandLabel(distanceKm)
  if (!band) {
    await insertPoaQuote(supabase, clientId, callId, callerPhone, pickupAddress, dropoffAddress, maps, truckType, rateType, distanceKm, durationMinutes)
    return { result: { quoted: false, reason: 'poa', message: 'That job is priced on application. Let me get the team to call you back with a quote.' } }
  }

  const serviceName = buildServicePattern(truckType, rateType, band)
  const matched = findService(services, serviceName)
  const matchedPrice = priceOf(matched)
  if (matchedPrice == null) {
    await insertPoaQuote(supabase, clientId, callId, callerPhone, pickupAddress, dropoffAddress, maps, truckType, rateType, distanceKm, durationMinutes)
    return { result: { quoted: false, reason: 'poa', message: 'That job is priced on application. Let me get the team to call you back with a quote.' } }
  }

  // ---- after-hours surcharge --------------------------------------
  let basePrice = matchedPrice
  const surchargePct = Math.max(0, cfg.after_hours_surcharge_percent ?? 0)
  if (surchargePct > 0) {
    const { data: sched } = await supabase
      .from('scheduler_settings')
      .select('operating_hours, timezone')
      .eq('client_id', clientId)
      .maybeSingle()
    const tz = (sched?.timezone as string | null) ?? (biz.timezone as string | null) ?? 'Australia/Melbourne'
    const opHours = (sched?.operating_hours as SchedulerOpHours | null) ?? null
    if (isAfterHours(opHours, tz)) {
      basePrice = Math.round(basePrice * (1 + surchargePct / 100) * 100) / 100
    }
  }

  // ---- minimum job fee --------------------------------------------
  const minFee = cfg.minimum_job_fee ?? 0
  if (minFee > 0 && basePrice < minFee) basePrice = minFee

  // ---- quote validity ---------------------------------------------
  const validityMinutes = cfg.quote_validity_minutes ?? 120
  const quoteValidUntil = new Date(Date.now() + validityMinutes * 60_000).toISOString()

  // ---- insert quotes row ------------------------------------------
  const insert: Record<string, unknown> = {
    client_id: clientId,
    call_id: callId,
    caller_phone: callerPhone,
    pickup_address: pickupAddress,
    dropoff_address: dropoffAddress,
    pickup_lat: maps.origin_lat ?? null,
    pickup_lng: maps.origin_lng ?? null,
    dropoff_lat: maps.destination_lat ?? null,
    dropoff_lng: maps.destination_lng ?? null,
    distance_km: distanceKm,
    duration_minutes: durationMinutes,
    truck_type: truckType,
    rate_type: rateType,
    base_price: basePrice,
    addons: [],
    total_price: basePrice,
    is_poa: false,
    quote_valid_until: quoteValidUntil,
    status: 'given',
  }
  const { data: quoteRow, error } = await supabase
    .from('quotes')
    .insert(insert)
    .select('id')
    .single()
  if (error) console.error('[calculate_job_quote] insert failed', error)

  // ---- response ---------------------------------------------------
  const truckPhrase = truckLabel(truckType).toLowerCase()
  const validityHours = Math.round((validityMinutes / 60) * 10) / 10
  const validityCopy = validityHours === Math.floor(validityHours)
    ? `${validityHours} hours`
    : `${validityHours} hours`
  const message =
    `That job is approximately ${Math.round(distanceKm)}km and should take around ${durationMinutes} minutes. ` +
    `The price for a ${truckPhrase} is $${basePrice}. ` +
    `This quote is valid for ${validityCopy}. Would you like me to book this job in?`

  return {
    result: {
      quoted: true,
      quote_id: quoteRow?.id ?? null,
      distance_km: distanceKm,
      duration_minutes: durationMinutes,
      truck_type: truckType,
      rate_type: rateType,
      base_price: basePrice,
      addons: [] as QuoteAddon[],
      total_price: basePrice,
      quote_valid_until: quoteValidUntil,
      currency: cfg.currency ?? 'AUD',
      message,
    },
  }
}

async function insertPoaQuote(
  supabase: ReturnType<typeof createAdminClient>,
  clientId: string,
  callId: string | null,
  callerPhone: string | null,
  pickup: string,
  dropoff: string,
  maps: Record<string, unknown>,
  truckType: TruckType,
  rateType: RateType,
  distanceKm: number,
  durationMinutes: number,
) {
  await supabase
    .from('quotes')
    .insert({
      client_id: clientId,
      call_id: callId,
      caller_phone: callerPhone,
      pickup_address: pickup,
      dropoff_address: dropoff,
      pickup_lat: (maps.origin_lat as number | undefined) ?? null,
      pickup_lng: (maps.origin_lng as number | undefined) ?? null,
      dropoff_lat: (maps.destination_lat as number | undefined) ?? null,
      dropoff_lng: (maps.destination_lng as number | undefined) ?? null,
      distance_km: distanceKm || null,
      duration_minutes: durationMinutes || null,
      truck_type: truckType,
      rate_type: rateType,
      base_price: null,
      addons: [],
      total_price: null,
      is_poa: true,
      status: 'given',
    })
}

async function logQuoteAddon(
  supabase: ReturnType<typeof createAdminClient>,
  clientId: string,
  params: Record<string, unknown>,
) {
  const quoteId = String(params.quote_id ?? '').trim()
  const addonName = String(params.addon_name ?? '').trim()
  const quantity = Math.max(1, Math.round(Number(params.quantity ?? 1)))
  if (!quoteId || !addonName) {
    return { result: { logged: false, error: 'quote_id and addon_name required' } }
  }

  const { data: quote } = await supabase
    .from('quotes')
    .select('id, base_price, addons, total_price, client_id')
    .eq('id', quoteId)
    .eq('client_id', clientId)
    .maybeSingle()
  if (!quote) return { result: { logged: false, error: 'quote not found' } }

  const { data: biz } = await supabase
    .from('businesses')
    .select('services')
    .eq('id', clientId)
    .maybeSingle()
  const services = Array.isArray(biz?.services) ? (biz!.services as ServiceEntry[]) : []
  const match = findService(services, addonName)
  const addonPrice = priceOf(match)
  if (addonPrice == null) {
    return { result: { logged: false, error: `add-on "${addonName}" not found in services list` } }
  }

  const existingAddons = Array.isArray(quote.addons) ? (quote.addons as QuoteAddon[]) : []
  const nextAddons: QuoteAddon[] = [
    ...existingAddons,
    { name: match?.name ?? addonName, price: addonPrice, quantity },
  ]
  const base = Number(quote.base_price ?? 0)
  const addonTotal = nextAddons.reduce((sum, a) => sum + a.price * a.quantity, 0)
  const newTotal = Math.round((base + addonTotal) * 100) / 100

  const { error } = await supabase
    .from('quotes')
    .update({ addons: nextAddons, total_price: newTotal })
    .eq('id', quoteId)

  if (error) return { result: { logged: false, error: error.message } }
  return {
    result: {
      logged: true,
      total_price: newTotal,
      addons: nextAddons,
      message: `Added ${match?.name ?? addonName}. New total is $${newTotal}.`,
    },
  }
}

// ─── Session 15: scheduler + waitlist functions ────────────────────

interface OperatingHoursMap {
  monday?: { open?: string; close?: string; enabled?: boolean }
  tuesday?: { open?: string; close?: string; enabled?: boolean }
  wednesday?: { open?: string; close?: string; enabled?: boolean }
  thursday?: { open?: string; close?: string; enabled?: boolean }
  friday?: { open?: string; close?: string; enabled?: boolean }
  saturday?: { open?: string; close?: string; enabled?: boolean }
  sunday?: { open?: string; close?: string; enabled?: boolean }
}

const DOW_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const
type DowKey = typeof DOW_NAMES[number]

function parseRequestedTime(
  date: string | null | undefined,
  time: string | null | undefined,
): Date | null {
  if (!date && !time) return null
  // Date can be "2026-05-20" or natural language like "tomorrow".
  let baseDate: Date | null = null
  if (date) {
    const m = date.trim().toLowerCase()
    const now = new Date()
    if (m === 'today') baseDate = new Date(now)
    else if (m === 'tomorrow') { baseDate = new Date(now); baseDate.setDate(baseDate.getDate() + 1) }
    else {
      const parsed = new Date(m)
      baseDate = Number.isFinite(parsed.getTime()) ? parsed : null
    }
  }
  if (!baseDate) baseDate = new Date()
  if (time) {
    const t = time.trim().toLowerCase().replace(/\s+/g, '')
    const match = t.match(/^(\d{1,2})(?::(\d{2}))?(am|pm)?$/)
    if (match) {
      let hour = parseInt(match[1], 10)
      const minute = match[2] ? parseInt(match[2], 10) : 0
      const meridiem = match[3]
      if (meridiem === 'pm' && hour < 12) hour += 12
      if (meridiem === 'am' && hour === 12) hour = 0
      baseDate.setHours(hour, minute, 0, 0)
    }
  }
  return baseDate
}

async function checkAvailability(
  supabase: ReturnType<typeof createAdminClient>,
  clientId: string,
  params: Record<string, unknown>,
) {
  const requestedAt = parseRequestedTime(params.date as string | undefined, params.time as string | undefined)
  if (!requestedAt) {
    return { result: { available: false, reason: 'invalid_time', message: 'I did not catch the time. Can you say it again?' } }
  }
  const durationMinutes = Math.max(15, Math.min(8 * 60, Number(params.duration_minutes ?? 60) || 60))
  const requestedEnd = new Date(requestedAt.getTime() + durationMinutes * 60_000)

  const [bizRes, schedRes] = await Promise.all([
    supabase.from('businesses').select('industry, plan').eq('id', clientId).maybeSingle(),
    supabase.from('scheduler_settings').select('operating_hours, state, timezone, max_concurrent_jobs, overridden_holidays').eq('client_id', clientId).maybeSingle(),
  ])
  const industry = (bizRes.data?.industry as string | null) ?? null
  const opHours = (schedRes.data?.operating_hours ?? {}) as OperatingHoursMap
  const state = (schedRes.data?.state as string | null) ?? 'VIC'
  const maxConcurrent = Math.max(1, (schedRes.data?.max_concurrent_jobs as number | null) ?? 1)
  const overridden = (schedRes.data?.overridden_holidays as string[] | null) ?? []

  // 1. Operating hours check
  const dowName = DOW_NAMES[requestedAt.getDay()] as DowKey
  const dayCfg = opHours[dowName]
  if (dayCfg?.enabled === false) {
    return { result: { available: false, reason: 'closed_day', message: "We're closed that day. Would you like a different day?" } }
  }
  if (dayCfg?.open && dayCfg?.close) {
    const hhmm = `${String(requestedAt.getHours()).padStart(2, '0')}:${String(requestedAt.getMinutes()).padStart(2, '0')}`
    if (hhmm < dayCfg.open || hhmm >= dayCfg.close) {
      return { result: { available: false, reason: 'outside_hours', message: `That time is outside our operating hours (${dayCfg.open} to ${dayCfg.close}). Would you like a different time?` } }
    }
  }

  // 2. Public holiday check (unless explicitly overridden)
  const dateStr = `${requestedAt.getFullYear()}-${String(requestedAt.getMonth() + 1).padStart(2, '0')}-${String(requestedAt.getDate()).padStart(2, '0')}`
  if (!overridden.includes(dateStr)) {
    const { data: holiday } = await supabase
      .from('public_holidays')
      .select('holiday_name')
      .eq('state', state)
      .eq('holiday_date', dateStr)
      .maybeSingle()
    if (holiday) {
      return { result: { available: false, reason: 'public_holiday', message: `That day is a public holiday (${holiday.holiday_name}). Would you like a different day?` } }
    }
  }

  // 3. Concurrent job count
  const startIso = requestedAt.toISOString()
  const endIso = requestedEnd.toISOString()
  const { count: overlap } = await supabase
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .in('status', ['pending', 'confirmed'])
    .lte('scheduled_start', endIso)
    .gte('scheduled_end', startIso)
  if ((overlap ?? 0) >= maxConcurrent) {
    return { result: { available: false, reason: 'capacity', message: "We're fully booked at that time. Would you like to be added to the waitlist or try a different time?" } }
  }

  // 4. Towing-only: driver availability check
  if (industry === 'towing') {
    const { data: drivers } = await supabase
      .from('drivers')
      .select('id')
      .eq('client_id', clientId)
      .eq('active', true)
    if (!drivers || drivers.length === 0) {
      return { result: { available: false, reason: 'no_drivers', message: "We don't have a driver available at that time." } }
    }
  }

  return {
    result: {
      available: true,
      message: `Yes, ${requestedAt.toLocaleString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit', hour12: true })} works. Shall I book it in?`,
      scheduled_start: startIso,
      scheduled_end: endIso,
      duration_minutes: durationMinutes,
    },
  }
}

async function addToWaitlist(
  supabase: ReturnType<typeof createAdminClient>,
  clientId: string,
  params: Record<string, unknown>,
) {
  const callerPhone = String(params.caller_phone ?? '').trim()
  if (!callerPhone) {
    return { result: { added: false, error: 'caller_phone required' } }
  }

  const { count } = await supabase
    .from('waitlist')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .eq('status', 'waiting')
  const position = (count ?? 0) + 1

  const callId = (params.call_id as string | undefined)?.trim() ?? null
  const { data, error } = await supabase
    .from('waitlist')
    .insert({
      client_id: clientId,
      caller_phone: callerPhone,
      caller_name: typeof params.caller_name === 'string' ? params.caller_name : null,
      requested_date: typeof params.requested_date === 'string' ? params.requested_date : null,
      truck_type: typeof params.truck_type === 'string' ? params.truck_type : null,
      pickup_address: typeof params.pickup_address === 'string' ? params.pickup_address : null,
      dropoff_address: typeof params.dropoff_address === 'string' ? params.dropoff_address : null,
      description: typeof params.description === 'string' ? params.description : null,
      position,
      status: 'waiting',
      call_id: callId,
    })
    .select('id')
    .single()
  if (error || !data) return { result: { added: false, error: error?.message ?? 'insert failed' } }

  return {
    result: {
      added: true,
      waitlist_id: data.id,
      position,
      message: `You are number ${position} on the waitlist. We will SMS you as soon as a slot opens.`,
    },
  }
}

async function cancelBooking(
  supabase: ReturnType<typeof createAdminClient>,
  clientId: string,
  params: Record<string, unknown>,
) {
  const bookingId = (params.booking_id as string | undefined)?.trim() ?? null
  const callerPhone = (params.caller_phone as string | undefined)?.trim() ?? null
  const scheduledStart = (params.scheduled_start as string | undefined)?.trim() ?? null

  let q = supabase
    .from('bookings')
    .select('*')
    .eq('client_id', clientId)
    .in('status', ['pending', 'confirmed'])

  if (bookingId) {
    q = q.eq('id', bookingId)
  } else if (callerPhone) {
    q = q.eq('caller_phone', callerPhone)
    if (scheduledStart) q = q.eq('scheduled_start', scheduledStart)
  } else {
    return { result: { cancelled: false, error: 'Need booking_id or caller_phone to find the booking.' } }
  }

  const { data: rows } = await q.order('scheduled_start', { ascending: true }).limit(2)
  if (!rows || rows.length === 0) {
    return { result: { cancelled: false, error: 'Could not find that booking.' } }
  }
  if (rows.length > 1 && !bookingId && !scheduledStart) {
    return { result: { cancelled: false, error: 'Multiple bookings on file. Can you confirm the date and time?' } }
  }
  const booking = rows[0]

  // Cancellation policy check
  const { data: settings } = await supabase
    .from('scheduler_settings')
    .select('cancellation_policy_enabled, cancellation_notice_hours, cancellation_fee_aud')
    .eq('client_id', clientId)
    .maybeSingle()
  let feeNotice: string | null = null
  if (settings?.cancellation_policy_enabled && booking.scheduled_start) {
    const startMs = new Date(booking.scheduled_start as string).getTime()
    const noticeHours = settings.cancellation_notice_hours ?? 24
    const hoursOut = (startMs - Date.now()) / (1000 * 60 * 60)
    if (hoursOut < noticeHours && (settings.cancellation_fee_aud ?? 0) > 0) {
      feeNotice = `Please note our cancellation policy requires ${noticeHours} hours notice. A $${settings.cancellation_fee_aud} cancellation fee may apply.`
    }
  }

  const { error } = await supabase
    .from('bookings')
    .update({
      status: 'cancelled',
      cancellation_reason: (params.cancellation_reason as string | undefined) ?? null,
    })
    .eq('id', booking.id)
  if (error) return { result: { cancelled: false, error: error.message } }

  // Trigger cancellation SMS + waitlist push best-effort.
  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.talkmate.com.au'
    const internalSecret = process.env.INTERNAL_API_SECRET || process.env.VAPI_WEBHOOK_SECRET || ''
    fetch(`${appUrl}/api/portal/waitlist/offer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': internalSecret },
      body: JSON.stringify({ client_id: clientId, scheduled_start: booking.scheduled_start }),
    }).catch(() => {})
  } catch {}

  return {
    result: {
      cancelled: true,
      booking_id: booking.id,
      message: `Your booking on ${new Date(booking.scheduled_start as string).toLocaleString('en-AU')} has been cancelled. ${feeNotice ?? 'Sorry to see it go.'}`.trim(),
    },
  }
}

async function rescheduleBooking(
  supabase: ReturnType<typeof createAdminClient>,
  clientId: string,
  params: Record<string, unknown>,
) {
  const bookingId = (params.booking_id as string | undefined)?.trim() ?? null
  const callerPhone = (params.caller_phone as string | undefined)?.trim() ?? null
  const oldStart = (params.scheduled_start as string | undefined)?.trim() ?? null
  const newDate = (params.new_date as string | undefined) ?? null
  const newTime = (params.new_time as string | undefined) ?? null

  const newStart = parseRequestedTime(newDate, newTime)
  if (!newStart) return { result: { rescheduled: false, error: 'I did not catch the new date and time.' } }

  let q = supabase.from('bookings').select('*').eq('client_id', clientId)
  if (bookingId) q = q.eq('id', bookingId)
  else if (callerPhone) {
    q = q.eq('caller_phone', callerPhone).in('status', ['pending', 'confirmed'])
    if (oldStart) q = q.eq('scheduled_start', oldStart)
  } else {
    return { result: { rescheduled: false, error: 'Need booking_id or caller_phone.' } }
  }

  const { data: rows } = await q.limit(2)
  if (!rows || rows.length === 0) return { result: { rescheduled: false, error: 'Could not find that booking.' } }
  if (rows.length > 1) return { result: { rescheduled: false, error: 'Multiple bookings on file. Can you confirm the original date?' } }
  const booking = rows[0]

  // Reuse check_availability for the new slot
  const avail = await checkAvailability(supabase, clientId, {
    date: newDate, time: newTime,
    duration_minutes: booking.scheduled_start && booking.scheduled_end
      ? (new Date(booking.scheduled_end as string).getTime() - new Date(booking.scheduled_start as string).getTime()) / 60_000
      : 60,
  })
  if (!('available' in avail.result) || avail.result.available !== true) {
    return { result: { rescheduled: false, ...avail.result } }
  }

  const newEnd = new Date((avail.result as { scheduled_end: string }).scheduled_end)
  const { error } = await supabase
    .from('bookings')
    .update({
      scheduled_start: newStart.toISOString(),
      scheduled_end: newEnd.toISOString(),
      sms_reminder_24h_sent: false,
      sms_reminder_2h_sent: false,
    })
    .eq('id', booking.id)
  if (error) return { result: { rescheduled: false, error: error.message } }

  return {
    result: {
      rescheduled: true,
      booking_id: booking.id,
      scheduled_start: newStart.toISOString(),
      message: `All sorted. Your booking is now on ${newStart.toLocaleString('en-AU')}. You'll get an updated SMS confirmation.`,
    },
  }
}
