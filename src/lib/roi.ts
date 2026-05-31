// ROI / industry benchmarks used by the dashboard ROI counter and the
// "paying for itself" banner. Numbers come from the master brief, Part 5.

import type { BusinessType } from './business-types'

export interface RoiBenchmark {
  avgValue: number
  missRate: number       // 0..1
  label: string
}

export const ROI_BENCHMARKS: Record<BusinessType, RoiBenchmark> = {
  hospitality: { avgValue: 32, missRate: 0.15, label: 'avg order value' },
  retail:      { avgValue: 32, missRate: 0.15, label: 'avg order value' },
  trades:      { avgValue: 380, missRate: 0.23, label: 'avg job value' },
  automotive:  { avgValue: 280, missRate: 0.30, label: 'avg job value' },
  medical:     { avgValue: 120, missRate: 0.18, label: 'avg appointment value' },
  beauty:      { avgValue: 95, missRate: 0.18, label: 'avg appointment value' },
  fitness:     { avgValue: 95, missRate: 0.18, label: 'avg booking value' },
  real_estate: { avgValue: 1200, missRate: 0.23, label: 'avg enquiry value' },
  professional:{ avgValue: 220, missRate: 0.20, label: 'avg consultation value' },
  other:       { avgValue: 85, missRate: 0.20, label: 'avg enquiry value' },
}

export function getBenchmark(t: string | null | undefined): RoiBenchmark {
  const key = (t || 'other') as BusinessType
  return ROI_BENCHMARKS[key] ?? ROI_BENCHMARKS.other
}

// Estimate the revenue TalkMate has *protected* this month — the calls that
// would have been missed if the agent weren't running.
// Calculation per the brief: missed-calls-per-day × avg-value × days-active-this-month.
// Operating ~5 working days/week, so the per-day baseline assumes ~10 incoming
// calls a day for restaurants/trades and similar.
export function estimateRevenueProtected(opts: {
  businessType: string
  daysActiveThisMonth: number
  callsThisMonth: number
}): number {
  const b = getBenchmark(opts.businessType)
  // expected total calls if we extrapolate observed call volume across the
  // remaining days of the month — fall back to 10 calls/day baseline.
  const observedPerDay = opts.daysActiveThisMonth > 0
    ? Math.max(opts.callsThisMonth / opts.daysActiveThisMonth, 0)
    : 0
  const callsPerDay = observedPerDay > 0 ? observedPerDay : 10
  const missedPerDay = callsPerDay * b.missRate
  return Math.round(missedPerDay * b.avgValue * opts.daysActiveThisMonth)
}

export function daysActiveThisMonth(signupAt: string | Date | null | undefined): number {
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const start = signupAt ? new Date(signupAt) : startOfMonth
  const effectiveStart = start > startOfMonth ? start : startOfMonth
  const ms = now.getTime() - effectiveStart.getTime()
  return Math.max(1, Math.ceil(ms / (24 * 60 * 60 * 1000)))
}

// ---------------------------------------------------------------------------
// Recovered-revenue ROI (chatbot + after-hours + win-backs).
//
// This block mirrors GET /api/dashboard/roi exactly so admin server pages can
// compute the same figures directly against the DB without a self-fetch.
// Keep the two in sync: after-hours bucketing, conversion-rate maths and the
// row cap are intentionally identical.
// ---------------------------------------------------------------------------

import type { createAdminClient } from '@/lib/supabase/server'

export type RoiAdminClient = ReturnType<typeof createAdminClient>
export type RoiPeriod = 'this_month' | 'last_month' | 'all_time'

const ROI_CALLS_ROW_CAP = 5000
const ROI_BUSINESS_HOUR_START = 9
const ROI_BUSINESS_HOUR_END = 17 // calls at/after 17:00 count as after-hours
const ROI_TZ = 'Australia/Brisbane'

export interface RoiRange {
  start: Date
  end: Date | null // null = open ended (all_time)
}

function roiMonthStart(now: Date, monthOffset: number): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + monthOffset, 1, 0, 0, 0, 0))
}

export function roiRangeFor(period: RoiPeriod, now: Date = new Date()): RoiRange {
  if (period === 'all_time') return { start: new Date(0), end: null }
  if (period === 'last_month') return { start: roiMonthStart(now, -1), end: roiMonthStart(now, 0) }
  return { start: roiMonthStart(now, 0), end: roiMonthStart(now, 1) }
}

// Brisbane has no DST. Resolve via Intl to stay correct regardless of host TZ.
function roiBrisbaneParts(d: Date): { hour: number; isWeekend: boolean } {
  const fmt = new Intl.DateTimeFormat('en-AU', {
    timeZone: ROI_TZ,
    hour: 'numeric',
    hour12: false,
    weekday: 'short',
  })
  const parts = fmt.formatToParts(d)
  const hourStr = parts.find((p) => p.type === 'hour')?.value ?? '0'
  const weekday = parts.find((p) => p.type === 'weekday')?.value ?? ''
  let hour = parseInt(hourStr, 10)
  if (hour === 24) hour = 0
  const isWeekend = weekday === 'Sat' || weekday === 'Sun'
  return { hour, isWeekend }
}

function roiIsAfterHours(d: Date): boolean {
  const { hour, isWeekend } = roiBrisbaneParts(d)
  if (isWeekend) return true
  return hour < ROI_BUSINESS_HOUR_START || hour >= ROI_BUSINESS_HOUR_END
}

async function roiCountInRange(
  admin: RoiAdminClient,
  table: string,
  businessId: string,
  column: string,
  range: RoiRange,
  extraEq?: { column: string; value: unknown },
): Promise<number> {
  let q = admin
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq('business_id', businessId)
    .gte(column, range.start.toISOString())
  if (range.end) q = q.lt(column, range.end.toISOString())
  if (extraEq) q = q.eq(extraEq.column, extraEq.value)
  const { count, error } = await q
  if (error) {
    console.error(`[roi] count ${table}.${column} failed`, error.message)
    return 0
  }
  return count ?? 0
}

async function roiAfterHoursCount(
  admin: RoiAdminClient,
  businessId: string,
  range: RoiRange,
): Promise<number> {
  let q = admin
    .from('calls')
    .select('created_at')
    .eq('business_id', businessId)
    .gte('created_at', range.start.toISOString())
    .limit(ROI_CALLS_ROW_CAP)
  if (range.end) q = q.lt('created_at', range.end.toISOString())
  const { data, error } = await q
  if (error) {
    console.error('[roi] after-hours select failed', error.message)
    return 0
  }
  let n = 0
  for (const row of data ?? []) {
    const ca = (row as { created_at: string | null }).created_at
    if (!ca) continue
    if (roiIsAfterHours(new Date(ca))) n++
  }
  return n
}

export interface RoiSummary {
  totalEstimatedRevenue: number
  callsAfterHours: { count: number; estimatedValue: number }
  winbacksSent: { count: number; estimatedValue: number }
  chatLeads: { count: number; estimatedValue: number }
  reviewRequestsSent: { count: number }
  totalCallsAnswered: number
  avgJobValue: number
}

// Compute the recovered-revenue ROI summary for a single business directly
// against the DB. Mirrors GET /api/dashboard/roi.
export async function computeRoiForBusiness(
  admin: RoiAdminClient,
  businessId: string,
  period: RoiPeriod = 'this_month',
  now: Date = new Date(),
): Promise<RoiSummary> {
  const { data: business } = await admin
    .from('businesses')
    .select('avg_job_value, roi_conversion_rate_calls, roi_conversion_rate_chat, roi_conversion_rate_winback')
    .eq('id', businessId)
    .maybeSingle()

  const b = (business ?? {}) as {
    avg_job_value: number | null
    roi_conversion_rate_calls: number | null
    roi_conversion_rate_chat: number | null
    roi_conversion_rate_winback: number | null
  }

  const avgJobValue = b.avg_job_value != null ? Number(b.avg_job_value) : 250
  const rateCalls = b.roi_conversion_rate_calls != null ? Number(b.roi_conversion_rate_calls) : 40
  const rateChat = b.roi_conversion_rate_chat != null ? Number(b.roi_conversion_rate_chat) : 20
  const rateWinback = b.roi_conversion_rate_winback != null ? Number(b.roi_conversion_rate_winback) : 30

  const range = roiRangeFor(period, now)

  const [
    callsAfterHoursCount,
    winbacksSentCount,
    chatLeadsCount,
    reviewRequestsSentCount,
    totalCallsAnswered,
  ] = await Promise.all([
    roiAfterHoursCount(admin, businessId, range),
    roiCountInRange(admin, 'calls', businessId, 'winback_sent_at', range, { column: 'winback_sent', value: true }),
    roiCountInRange(admin, 'chat_sessions', businessId, 'started_at', range, { column: 'lead_captured', value: true }),
    roiCountInRange(admin, 'review_requests', businessId, 'sent_at', range),
    roiCountInRange(admin, 'calls', businessId, 'created_at', range),
  ])

  const callsValue = Math.round(callsAfterHoursCount * avgJobValue * (rateCalls / 100))
  const winbacksValue = Math.round(winbacksSentCount * avgJobValue * (rateWinback / 100))
  const chatValue = Math.round(chatLeadsCount * avgJobValue * (rateChat / 100))

  return {
    totalEstimatedRevenue: callsValue + winbacksValue + chatValue,
    callsAfterHours: { count: callsAfterHoursCount, estimatedValue: callsValue },
    winbacksSent: { count: winbacksSentCount, estimatedValue: winbacksValue },
    chatLeads: { count: chatLeadsCount, estimatedValue: chatValue },
    reviewRequestsSent: { count: reviewRequestsSentCount },
    totalCallsAnswered,
    avgJobValue: Math.round(avgJobValue),
  }
}

export interface RoiTotals {
  totalEstimatedRevenue: number
  chatLeads: number
  winbacksSent: number
}

// Aggregate recovered-revenue totals across every (non-demo) business for the
// admin dashboard cards. Uses the same efficient grouped-query pass as the
// admin clients list (computeRoiForBusinessList) plus one win-back count.
export async function computeRoiTotals(
  admin: RoiAdminClient,
  now: Date = new Date(),
): Promise<RoiTotals> {
  const range = roiRangeFor('this_month', now)
  const startIso = range.start.toISOString()
  const endIso = range.end ? range.end.toISOString() : null

  const perBusiness = await computeRoiForBusinessList(admin, now)
  let totalEstimatedRevenue = 0
  let chatLeads = 0
  for (const row of Object.values(perBusiness)) {
    totalEstimatedRevenue += row.estimatedRevenue
    chatLeads += row.chatLeads
  }

  // Win-backs sent this month across all businesses (single count query).
  let winQ = admin
    .from('calls')
    .select('id', { count: 'exact', head: true })
    .eq('winback_sent', true)
    .gte('winback_sent_at', startIso)
  if (endIso) winQ = winQ.lt('winback_sent_at', endIso)
  const { count: winbacksSent } = await winQ

  return { totalEstimatedRevenue, chatLeads, winbacksSent: winbacksSent ?? 0 }
}

export function formatRoiDollars(n: number): string {
  return `$${Math.round(n).toLocaleString('en-AU')}`
}

export interface BusinessRoiRow {
  estimatedRevenue: number
  chatLeads: number
  chatbotEnabled: boolean
}

// Efficient batch computation for the admin clients list. Computes this-month
// recovered-revenue, chat-lead count and chatbot-enabled flag for EVERY
// business in `businessIds` using a handful of grouped queries (calls this
// month, win-backs this month, chat-leads this month) instead of N+1 per row.
// After-hours bucketing matches computeRoiForBusiness / the ROI API exactly.
export async function computeRoiForBusinessList(
  admin: RoiAdminClient,
  now: Date = new Date(),
): Promise<Record<string, BusinessRoiRow>> {
  const range = roiRangeFor('this_month', now)
  const startIso = range.start.toISOString()
  const endIso = range.end ? range.end.toISOString() : null

  // Per-business config + chatbot flag.
  const { data: bizRows } = await admin
    .from('businesses')
    .select('id, avg_job_value, roi_conversion_rate_calls, roi_conversion_rate_chat, roi_conversion_rate_winback, chatbot_enabled')
    .eq('is_demo', false)

  const out: Record<string, BusinessRoiRow> = {}
  const cfg: Record<string, { avg: number; rc: number; rw: number; rch: number }> = {}
  for (const b of (bizRows ?? []) as Array<{
    id: string
    avg_job_value: number | null
    roi_conversion_rate_calls: number | null
    roi_conversion_rate_chat: number | null
    roi_conversion_rate_winback: number | null
    chatbot_enabled: boolean | null
  }>) {
    cfg[b.id] = {
      avg: b.avg_job_value != null ? Number(b.avg_job_value) : 250,
      rc: b.roi_conversion_rate_calls != null ? Number(b.roi_conversion_rate_calls) : 40,
      rch: b.roi_conversion_rate_chat != null ? Number(b.roi_conversion_rate_chat) : 20,
      rw: b.roi_conversion_rate_winback != null ? Number(b.roi_conversion_rate_winback) : 30,
    }
    out[b.id] = { estimatedRevenue: 0, chatLeads: 0, chatbotEnabled: b.chatbot_enabled ?? false }
  }

  const afterHoursByBiz: Record<string, number> = {}
  const winbacksByBiz: Record<string, number> = {}
  const chatLeadsByBiz: Record<string, number> = {}

  // Calls this month (for after-hours bucketing + win-backs). One grouped read.
  let callsQ = admin
    .from('calls')
    .select('business_id, created_at, winback_sent, winback_sent_at')
    .gte('created_at', startIso)
    .limit(50000)
  if (endIso) callsQ = callsQ.lt('created_at', endIso)
  const { data: callRows } = await callsQ
  for (const c of (callRows ?? []) as Array<{
    business_id: string
    created_at: string | null
    winback_sent: boolean | null
    winback_sent_at: string | null
  }>) {
    if (c.created_at && roiIsAfterHours(new Date(c.created_at))) {
      afterHoursByBiz[c.business_id] = (afterHoursByBiz[c.business_id] ?? 0) + 1
    }
  }

  // Win-backs this month are filtered on winback_sent_at, matching the API.
  let winQ = admin
    .from('calls')
    .select('business_id')
    .eq('winback_sent', true)
    .gte('winback_sent_at', startIso)
    .limit(50000)
  if (endIso) winQ = winQ.lt('winback_sent_at', endIso)
  const { data: winRows } = await winQ
  for (const w of (winRows ?? []) as Array<{ business_id: string }>) {
    winbacksByBiz[w.business_id] = (winbacksByBiz[w.business_id] ?? 0) + 1
  }

  // Chat leads this month.
  let chatQ = admin
    .from('chat_sessions')
    .select('business_id')
    .eq('lead_captured', true)
    .gte('started_at', startIso)
    .limit(50000)
  if (endIso) chatQ = chatQ.lt('started_at', endIso)
  const { data: chatRows } = await chatQ
  for (const ch of (chatRows ?? []) as Array<{ business_id: string }>) {
    chatLeadsByBiz[ch.business_id] = (chatLeadsByBiz[ch.business_id] ?? 0) + 1
  }

  for (const id of Object.keys(out)) {
    const c = cfg[id]
    if (!c) continue
    const ah = afterHoursByBiz[id] ?? 0
    const wb = winbacksByBiz[id] ?? 0
    const cl = chatLeadsByBiz[id] ?? 0
    const callsValue = Math.round(ah * c.avg * (c.rc / 100))
    const winbacksValue = Math.round(wb * c.avg * (c.rw / 100))
    const chatValue = Math.round(cl * c.avg * (c.rch / 100))
    out[id].estimatedRevenue = callsValue + winbacksValue + chatValue
    out[id].chatLeads = cl
  }

  return out
}
