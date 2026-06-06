// TalkMate Command — intent executor.
//
// Takes a ParsedCommand from command-parser.ts and runs the corresponding
// portal action against the client's data. All queries are scoped to
// `clientId`, and all writes use a passed-in SupabaseClient (the calling
// webhook injects either the service-role client or an RLS-scoped one).
//
// Deliberate deviations from the brief:
//   * Wait time writes to `dispatch_config.default_wait_minutes` (the
//     field read by /api/vapi/functions and the dispatch board) rather
//     than the brief's `wait_time_minutes`. Using the existing key means
//     the value actually reaches the voice agent and the dispatch UI.
//   * toggle_availability writes a business-level flag
//     `dispatch_config.accepting_jobs` instead of upserting to
//     driver_availability — that table requires a `driver_id` and is
//     intended for per-driver overrides, not a business-wide switch.
//     The voice agent reads accepting_jobs to decide whether to accept
//     new jobs at all.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ParsedCommand } from './command-parser'

export async function executeCommand(
  clientId: string,
  parsed: ParsedCommand,
  supabase: SupabaseClient,
): Promise<string> {
  switch (parsed.intent) {
    case 'set_wait_time':
      return setWaitTime(clientId, parsed.params, supabase)
    case 'toggle_availability':
      return toggleAvailability(clientId, parsed.params, supabase)
    case 'view_jobs':
      return viewJobs(clientId, parsed.params, supabase)
    case 'view_bookings':
      return viewBookings(clientId, supabase)
    case 'view_calls':
      return viewCalls(clientId, parsed.params, supabase)
    case 'assign_job':
      return assignJob(clientId, parsed.params, supabase)
    case 'complete_job':
      return completeJob(clientId, parsed.params, supabase)
    case 'view_quotes':
      return viewQuotes(clientId, parsed.params, supabase)
    case 'view_drivers':
      return viewDrivers(clientId, supabase)
    case 'pause_agent':
      return pauseAgent(clientId, parsed.params, supabase)
    case 'close_day':
      return closeDay(clientId, parsed.params, supabase)
    case 'missed_summary':
      return missedSummary(clientId, supabase)
    case 'vip_lookup':
      return vipLookup(clientId, parsed.params, supabase)
    default:
      return helpText()
  }
}

// ── set_wait_time ───────────────────────────────────────────────────────

async function setWaitTime(
  clientId: string,
  params: Record<string, unknown>,
  supabase: SupabaseClient,
): Promise<string> {
  const minutes = toInt(params.minutes)
  if (minutes == null || minutes < 0 || minutes > 24 * 60) {
    return `❌ Couldn't read the wait time. Try "we're busy for 2 hours" or "wait time 45 minutes".`
  }

  const { data: biz } = await supabase
    .from('businesses')
    .select('dispatch_config')
    .eq('id', clientId)
    .maybeSingle()
  const cfg = (biz?.dispatch_config ?? {}) as Record<string, unknown>

  const { error } = await supabase
    .from('businesses')
    .update({
      dispatch_config: { ...cfg, default_wait_minutes: minutes },
    })
    .eq('id', clientId)
  if (error) return `❌ Couldn't save the wait time: ${error.message}`

  return `✅ Done. Wait time set to ${humaniseMinutes(minutes)}. Your agent will tell callers.`
}

// ── toggle_availability ─────────────────────────────────────────────────

async function toggleAvailability(
  clientId: string,
  params: Record<string, unknown>,
  supabase: SupabaseClient,
): Promise<string> {
  const available = !!params.available

  const { data: biz } = await supabase
    .from('businesses')
    .select('dispatch_config')
    .eq('id', clientId)
    .maybeSingle()
  const cfg = (biz?.dispatch_config ?? {}) as Record<string, unknown>

  const { error } = await supabase
    .from('businesses')
    .update({
      dispatch_config: { ...cfg, accepting_jobs: available },
    })
    .eq('id', clientId)
  if (error) return `❌ Couldn't update availability: ${error.message}`

  return available
    ? `✅ You're back online. Agent is now accepting new jobs.`
    : `✅ Got it. Agent will stop accepting new jobs and advise callers of no availability.`
}

// ── view_jobs ───────────────────────────────────────────────────────────

async function viewJobs(
  clientId: string,
  params: Record<string, unknown>,
  supabase: SupabaseClient,
): Promise<string> {
  const filterRaw = String(params.filter ?? 'today').toLowerCase()
  const filter: 'today' | 'pending' | 'all' =
    filterRaw === 'pending' ? 'pending' : filterRaw === 'all' ? 'all' : 'today'

  let query = supabase
    .from('dispatch_jobs')
    .select('job_number, job_type, status, pickup_address, created_at')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(10)

  if (filter === 'today') {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    query = query.gte('created_at', today.toISOString())
  } else if (filter === 'pending') {
    // Sessions 36-37 — v1 status 'pending' is 'created' in the new
    // 13-state lifecycle (migration 048). Map the existing command
    // intent to the new enum so the SMS shortcut keeps working.
    query = query.eq('status', 'created')
  }

  const { data: jobs, error } = await query
  if (error) return `❌ Couldn't load jobs: ${error.message}`
  if (!jobs || jobs.length === 0) {
    if (filter === 'today') return `📋 No jobs today.`
    if (filter === 'pending') return `📋 No pending jobs.`
    return `📋 No jobs yet.`
  }

  const list = jobs.map(j => {
    const addr = j.pickup_address ? `\n  ${j.pickup_address}` : ''
    return `• ${j.job_number ?? '(no number)'} — ${j.job_type ?? 'job'} — ${j.status}${addr}`
  }).join('\n')

  const label = filter === 'today' ? `today` : filter === 'pending' ? `pending` : `recent`
  return `📋 ${jobs.length} ${label} job${jobs.length === 1 ? '' : 's'}:\n\n${list}`
}

// ── view_bookings ───────────────────────────────────────────────────────

async function viewBookings(clientId: string, supabase: SupabaseClient): Promise<string> {
  const { data: bookings, error } = await supabase
    .from('bookings')
    .select('caller_name, truck_type, description, scheduled_start, status, created_at')
    .eq('client_id', clientId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(10)

  if (error) return `❌ Couldn't load bookings: ${error.message}`
  if (!bookings || bookings.length === 0) return `📅 No pending bookings.`

  const list = bookings.map(b => {
    const when = b.scheduled_start
      ? new Date(b.scheduled_start).toLocaleString('en-AU', {
          day: 'numeric', month: 'short',
          hour: '2-digit', minute: '2-digit',
        })
      : 'TBC'
    // Telegram admin command — lowercase via .replace is acceptable here.
    // For UI use formatTruckLabel() in bookings-view.tsx.
    const what = b.truck_type
      ? b.truck_type.replace(/_/g, ' ')
      : b.description ?? 'General'
    return `• ${b.caller_name ?? 'Unknown'} — ${what} — ${when} — ${b.status}`
  }).join('\n')

  return `📅 ${bookings.length} pending booking${bookings.length === 1 ? '' : 's'}:\n\n${list}`
}

// ── view_calls ─────────────────────────────────────────────────────

async function viewCalls(
  clientId: string,
  params: Record<string, unknown>,
  supabase: SupabaseClient,
): Promise<string> {
  const filterRaw = String(params.filter ?? 'today').toLowerCase()
  const filter: 'today' | 'missed' | 'all' =
    filterRaw === 'missed' ? 'missed' : filterRaw === 'all' ? 'all' : 'today'

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  let query = supabase
    .from('calls')
    .select('caller_number, caller_name, outcome, duration_seconds, started_at, ended_reason, summary')
    .eq('business_id', clientId)
    .order('started_at', { ascending: false })
    .limit(10)

  if (filter === 'today' || filter === 'missed') {
    query = query.gte('started_at', today.toISOString())
  }
  if (filter === 'missed') {
    query = query.in('ended_reason', ['silence-timed-out', 'customer-did-not-answer', 'voicemail'])
  }

  const { data: calls, error } = await query
  if (error) return `❌ Couldn't load calls: ${error.message}`

  // Also get total count for today
  const { count: todayCount } = await supabase
    .from('calls')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', clientId)
    .gte('started_at', today.toISOString())

  if (!calls || calls.length === 0) {
    if (filter === 'missed') return `✅ No missed calls today.`
    return `📞 No calls today yet.`
  }

  if (filter === 'today' && calls.length > 0) {
    const total = todayCount ?? calls.length
    const missed = calls.filter(c =>
      c.ended_reason === 'silence-timed-out' || c.ended_reason === 'customer-did-not-answer'
    ).length
    const short = calls.filter(c => (c.duration_seconds ?? 0) < 10).length
    const summary = calls.slice(0, 5).map(c => {
      const num = c.caller_number ?? 'Unknown'
      const dur = c.duration_seconds ? `${c.duration_seconds}s` : ''
      const outcome = c.outcome ?? c.ended_reason ?? ''
      return `\u2022 ${num}${dur ? ' (' + dur + ')' : ''} — ${outcome}`
    }).join('\n')
    return `📞 *${total} call${total === 1 ? '' : 's'} today*${missed > 0 ? ` \u26a0️ ${missed} hung up early` : ''}\n\n${summary}${total > 5 ? `\n\n...and ${total - 5} more.` : ''}`
  }

  const list = calls.map(c => {
    const num = c.caller_number ?? 'Unknown'
    const outcome = c.outcome ?? c.ended_reason ?? ''
    return `• ${num} — ${outcome}`
  }).join('\n')
  return `📞 ${calls.length} call${calls.length === 1 ? '' : 's'}:\n\n${list}`
}

// ── assign_job ──────────────────────────────────────────────────────────

async function assignJob(
  clientId: string,
  params: Record<string, unknown>,
  supabase: SupabaseClient,
): Promise<string> {
  const jobNumber = normaliseJobNumber(params.job_number)
  const driverName = String(params.driver_name ?? '').trim()
  if (!jobNumber) return `❌ Which job? Try "assign JOB-0042 to Dave".`
  if (!driverName) return `❌ Which driver? Try "assign ${jobNumber} to Dave".`

  const { data: job } = await supabase
    .from('dispatch_jobs')
    .select('id, job_number, status')
    .eq('client_id', clientId)
    .ilike('job_number', jobNumber)
    .maybeSingle()
  if (!job) return `❌ Could not find job ${jobNumber}.`

  // Sessions 36-37 — migration 048 renamed drivers.active → is_active,
  // dispatch_jobs.assigned_driver_id → driver_id, and dispatch_jobs.status
  // 'assigned' → 'driver_notified' (the new lifecycle's "offered but
  // awaiting driver response" state).
  const { data: drivers, error: drvErr } = await supabase
    .from('drivers')
    .select('id, name')
    .eq('client_id', clientId)
    .eq('is_active', true)
    .ilike('name', `%${driverName}%`)
  if (drvErr) return `❌ Couldn't look up drivers: ${drvErr.message}`
  if (!drivers || drivers.length === 0) {
    return `❌ Could not find an active driver matching "${driverName}".`
  }
  const driver = drivers[0]

  const { error } = await supabase
    .from('dispatch_jobs')
    .update({
      driver_id: driver.id,
      status: 'driver_notified',
      notified_at: new Date().toISOString(),
    })
    .eq('id', job.id)
  if (error) return `❌ Couldn't assign: ${error.message}`

  return `✅ ${job.job_number} assigned to ${driver.name}.`
}

// ── complete_job ────────────────────────────────────────────────────────

async function completeJob(
  clientId: string,
  params: Record<string, unknown>,
  supabase: SupabaseClient,
): Promise<string> {
  const jobNumber = normaliseJobNumber(params.job_number)
  if (!jobNumber) return `❌ Which job? Try "JOB-0042 is done".`

  const { data: job } = await supabase
    .from('dispatch_jobs')
    .select('id, job_number, status')
    .eq('client_id', clientId)
    .ilike('job_number', jobNumber)
    .maybeSingle()
  if (!job) return `❌ Could not find job ${jobNumber}.`
  // Sessions 36-37 — v1 'complete' is 'completed' in the new lifecycle.
  if (job.status === 'completed') return `ℹ️ ${job.job_number} is already marked complete.`

  const { error } = await supabase
    .from('dispatch_jobs')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
    })
    .eq('id', job.id)
  if (error) return `❌ Couldn't mark complete: ${error.message}`

  return `✅ ${job.job_number} marked as complete.`
}

// ── view_quotes ─────────────────────────────────────────────────────────

async function viewQuotes(
  clientId: string,
  params: Record<string, unknown>,
  supabase: SupabaseClient,
): Promise<string> {
  const filterRaw = String(params.filter ?? 'today').toLowerCase()
  const filter: 'today' | 'all' = filterRaw === 'all' ? 'all' : 'today'

  let query = supabase
    .from('quotes')
    .select('caller_phone, pickup_address, dropoff_address, truck_type, base_price, is_poa, created_at')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(10)

  if (filter === 'today') {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    query = query.gte('created_at', today.toISOString())
  }

  const { data: quotes, error } = await query
  if (error) return `❌ Couldn't load quotes: ${error.message}`
  if (!quotes || quotes.length === 0) {
    return filter === 'today' ? `📊 No quotes today.` : `📊 No quotes on file.`
  }

  const list = quotes.map(q => {
    const price = q.is_poa ? 'POA' : q.base_price != null ? `$${q.base_price}` : '—'
    const route = [q.pickup_address, q.dropoff_address].filter(Boolean).join(' to ')
    return `• ${q.caller_phone ?? 'Unknown'} — ${q.truck_type ?? 'truck'} — ${route || 'no route'} — ${price}`
  }).join('\n')

  const label = filter === 'today' ? 'today' : 'recent'
  return `📊 ${quotes.length} quote${quotes.length === 1 ? '' : 's'} ${label}:\n\n${list}`
}

// ── view_drivers ─────────────────────────────────────────────────────────

async function viewDrivers(clientId: string, supabase: SupabaseClient): Promise<string> {
  // Sessions 36-37 — migration 048 replaced driver_availability with
  // drivers.is_online (current shift state) + driver_availability_log
  // (append-only history). For the SMS view-drivers command, the
  // is_online flag is what the owner actually wants to see.
  const { data: drivers, error } = await supabase
    .from('drivers')
    .select('id, name, phone, is_online, truck_type')
    .eq('client_id', clientId)
    .eq('is_active', true)
    .order('name')

  if (error) return `❌ Couldn't load drivers: ${error.message}`
  if (!drivers || drivers.length === 0) return `🚛 No active drivers on file.`

  const list = drivers.map(d => {
    const status = d.is_online ? 'online' : 'offline'
    return `• ${d.name} — ${status}`
  }).join('\n')

  return `🚛 ${drivers.length} active driver${drivers.length === 1 ? '' : 's'}:\n\n${list}`
}

// ── pause_agent ──────────────────────────────────────────────────────────

async function pauseAgent(
  clientId: string,
  params: Record<string, unknown>,
  supabase: SupabaseClient,
): Promise<string> {
  const minutes = toInt(params.minutes)
  if (minutes == null || minutes <= 0 || minutes > 24 * 60) {
    return `❌ How long should I pause for? Try "pause agent for 2 hours" or "stop agent for 30 minutes".`
  }

  const { data: biz } = await supabase
    .from('businesses')
    .select('dispatch_config')
    .eq('id', clientId)
    .maybeSingle()
  const cfg = (biz?.dispatch_config ?? {}) as Record<string, unknown>

  const resumeAt = new Date(Date.now() + minutes * 60000).toISOString()
  const { error } = await supabase
    .from('businesses')
    .update({
      dispatch_config: { ...cfg, accepting_jobs: false, resume_at: resumeAt },
    })
    .eq('id', clientId)
  if (error) return `❌ Couldn't pause agent: ${error.message}`

  const resumeTime = new Date(resumeAt).toLocaleTimeString('en-AU', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  return `⏸ Agent paused for ${humaniseMinutes(minutes)}. Will resume at ${resumeTime}.`
}

// ── close_day ────────────────────────────────────────────────────────────

const DAY_ALIASES: Record<string, string> = {
  sun: 'sunday', sunday: 'sunday',
  mon: 'monday', monday: 'monday',
  tue: 'tuesday', tues: 'tuesday', tuesday: 'tuesday',
  wed: 'wednesday', weds: 'wednesday', wednesday: 'wednesday',
  thu: 'thursday', thur: 'thursday', thurs: 'thursday', thursday: 'thursday',
  fri: 'friday', friday: 'friday',
  sat: 'saturday', saturday: 'saturday',
}

async function closeDay(
  clientId: string,
  params: Record<string, unknown>,
  supabase: SupabaseClient,
): Promise<string> {
  const dayRaw = String(params.day ?? '').toLowerCase().trim()
  const day = DAY_ALIASES[dayRaw]
  if (!day) return `❌ Couldn't recognise that day. Try "close on Sunday" or "open on Saturday".`

  const closed = !!params.closed

  const { data: settings, error: fetchErr } = await supabase
    .from('scheduler_settings')
    .select('operating_hours')
    .eq('client_id', clientId)
    .maybeSingle()

  if (fetchErr) return `❌ Couldn't load scheduler settings: ${fetchErr.message}`
  if (!settings) {
    return `❌ No scheduler settings found. Set up your schedule in the portal first.`
  }

  const hours = ((settings.operating_hours ?? {}) as Record<string, unknown>)
  const dayHours = (hours[day] ?? {}) as Record<string, unknown>

  const { error } = await supabase
    .from('scheduler_settings')
    .update({
      operating_hours: {
        ...hours,
        [day]: { ...dayHours, enabled: !closed },
      },
    })
    .eq('client_id', clientId)

  if (error) return `❌ Couldn't update schedule: ${error.message}`

  const dayLabel = day.charAt(0).toUpperCase() + day.slice(1)
  return `✅ ${dayLabel} marked as ${closed ? 'closed' : 'open'}.`
}

// ── missed_summary ────────────────────────────────────────────────────────

async function missedSummary(clientId: string, supabase: SupabaseClient): Promise<string> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const [callsRes, jobsRes, quotesRes] = await Promise.all([
    supabase
      .from('calls')
      .select('caller_number, outcome, ended_reason, started_at')
      .eq('business_id', clientId)
      .gte('started_at', since)
      .order('started_at', { ascending: false }),
    supabase
      .from('dispatch_jobs')
      .select('status, created_at')
      .eq('client_id', clientId)
      .gte('created_at', since),
    supabase
      .from('quotes')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', clientId)
      .gte('created_at', since),
  ])

  const calls = callsRes.data ?? []
  const jobs = jobsRes.data ?? []
  const quoteCount = quotesRes.count ?? 0

  const hungUp = calls.filter(c =>
    c.ended_reason === 'silence-timed-out' || c.ended_reason === 'customer-did-not-answer'
  )
  const newJobs = jobs.filter(j => j.status !== 'complete')
  const pendingJobs = jobs.filter(j => j.status === 'pending')

  const attentionCalls = hungUp.slice(0, 3).map(c => {
    return `  - ${c.caller_number ?? 'Unknown'} — ${c.outcome ?? c.ended_reason ?? 'hung up'}`
  }).join('\n')

  let msg = `📋 *Last 24 hours:*\n`
  msg += `📞 Calls: ${calls.length} total${hungUp.length > 0 ? `, ${hungUp.length} hung up early` : ''}\n`
  msg += `🔧 Jobs: ${newJobs.length} new, ${pendingJobs.length} pending\n`
  msg += `📊 Quotes: ${quoteCount}\n`
  if (hungUp.length > 0) {
    msg += `\n⚠️ Calls needing attention:\n${attentionCalls}`
    if (hungUp.length > 3) msg += `\n  ...and ${hungUp.length - 3} more`
  }
  return msg
}

// ── vip_lookup ────────────────────────────────────────────────────────────

async function vipLookup(
  clientId: string,
  params: Record<string, unknown>,
  supabase: SupabaseClient,
): Promise<string> {
  const phone = String(params.phone ?? '').trim().replace(/\s+/g, '')
  if (!phone) return `❌ Which number? Try "is 0412345678 a VIP".`

  // Match on last 9 digits to handle country code variations
  const last9 = phone.slice(-9)

  const { data: vips, error } = await supabase
    .from('vip_callers')
    .select('name, company, note, phone')
    .eq('client_id', clientId)

  if (error) return `❌ Couldn't check VIP list: ${error.message}`

  const match = (vips ?? []).find(v => {
    const vPhone = String(v.phone ?? '').replace(/\s+/g, '')
    return vPhone.slice(-9) === last9
  })

  if (!match) return `ℹ️ Not a VIP caller.`

  const parts = [match.name ?? 'Unknown']
  if (match.company) parts.push(`(${match.company})`)
  if (match.note) parts.push(`— ${match.note}`)
  return `⭐ VIP: ${parts.join(' ')}`
}

// ── helpers ─────────────────────────────────────────────────────────────

export function helpText(): string {
  return `❓ I didn't quite get that. Here's what I can help with:\n\n` +
    `📞 *Calls*\n` +
    `• "How many calls today?" / "Any missed calls?"\n` +
    `• "What did I miss?" / "Catch me up"\n\n` +
    `🔧 *Jobs & Dispatch*\n` +
    `• "Show today's jobs" / "List pending jobs"\n` +
    `• "Any bookings?"\n` +
    `• "Assign JOB-0042 to Dave"\n` +
    `• "JOB-0042 is done"\n\n` +
    `📊 *Quotes*\n` +
    `• "Any quotes today?" / "Show recent quotes"\n\n` +
    `🚛 *Drivers*\n` +
    `• "Who is available?" / "Driver status"\n\n` +
    `⭐ *VIP*\n` +
    `• "Is 0412345678 a VIP?" / "Who is 0412345678?"\n\n` +
    `⚙️ *Agent Control*\n` +
    `• "We're busy for 2 hours" (sets wait time)\n` +
    `• "Stop taking jobs" / "Back online"\n` +
    `• "Pause agent for 1 hour"\n` +
    `• "Close on Sunday" / "Open on Saturday"`
}

function toInt(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return null
  return Math.round(n)
}

function humaniseMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`
  const hours = minutes / 60
  if (Number.isInteger(hours)) return `${hours} hour${hours === 1 ? '' : 's'}`
  const h = Math.floor(hours)
  const m = minutes % 60
  return `${h}h ${m}m`
}

function normaliseJobNumber(v: unknown): string {
  const raw = String(v ?? '').trim().toUpperCase()
  if (!raw) return ''
  // "42" -> "JOB-0042"; "job 42" -> "JOB-0042"; "JOB-0042" -> "JOB-0042"
  const m = raw.match(/(\d+)/)
  if (!m) return raw
  const padded = m[1].padStart(4, '0')
  return `JOB-${padded}`
}
