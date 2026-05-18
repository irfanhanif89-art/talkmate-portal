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
    .single()
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
    .single()
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
    query = query.eq('status', 'pending')
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
    .select('caller_name, service_requested, preferred_date, preferred_time, status, created_at')
    .eq('client_id', clientId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(10)

  if (error) return `❌ Couldn't load bookings: ${error.message}`
  if (!bookings || bookings.length === 0) return `📅 No pending bookings.`

  const list = bookings.map(b => {
    const when = b.preferred_date ? `${b.preferred_date}${b.preferred_time ? ' ' + b.preferred_time : ''}` : 'TBC'
    return `• ${b.caller_name ?? 'Unknown'} — ${b.service_requested ?? 'General'} — ${when}`
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

  const { data: drivers, error: drvErr } = await supabase
    .from('drivers')
    .select('id, name')
    .eq('client_id', clientId)
    .eq('active', true)
    .ilike('name', `%${driverName}%`)
  if (drvErr) return `❌ Couldn't look up drivers: ${drvErr.message}`
  if (!drivers || drivers.length === 0) {
    return `❌ Could not find an active driver matching "${driverName}".`
  }
  const driver = drivers[0]

  const { error } = await supabase
    .from('dispatch_jobs')
    .update({
      assigned_driver_id: driver.id,
      status: 'assigned',
      assigned_at: new Date().toISOString(),
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
  if (job.status === 'complete') return `ℹ️ ${job.job_number} is already marked complete.`

  const { error } = await supabase
    .from('dispatch_jobs')
    .update({
      status: 'complete',
      completed_at: new Date().toISOString(),
    })
    .eq('id', job.id)
  if (error) return `❌ Couldn't mark complete: ${error.message}`

  return `✅ ${job.job_number} marked as complete.`
}

// ── helpers ─────────────────────────────────────────────────────────────

export function helpText(): string {
  return `❓ I didn't quite get that. Here's what I can help with:\n\n` +
    `• Calls: "How many calls today?" / "Any missed calls?"\n` +
    `• Jobs: "Show today's jobs"\n` +
    `• Bookings: "Any bookings?"\n` +
    `• Wait time: "We're busy for 2 hours"\n` +
    `• Availability: "Stop taking jobs" / "Back online"\n` +
    `• Assign a job: "Assign JOB-0042 to Dave"\n` +
    `• Complete a job: "JOB-0042 is done"`
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
