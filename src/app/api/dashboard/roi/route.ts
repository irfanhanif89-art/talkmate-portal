// ROI dashboard summary for the signed-in business (or admin-as-client via
// ?adminClientId=<uuid>). Aggregates after-hours calls, win-backs, chat leads
// and review requests into an estimated-revenue figure for the chosen period.
//
// After-hours is computed in JS against Australia/Brisbane local time because
// hour-of-day cannot be expressed in a Supabase count filter. We select the
// call timestamps for the period (capped) and bucket them client-side.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { resolveBusinessId } from '@/lib/resolve-business'

export const dynamic = 'force-dynamic'

const VALID_PERIODS = new Set(['this_month', 'last_month', 'all_time'])
const CALLS_ROW_CAP = 5000
const BUSINESS_HOUR_START = 9
const BUSINESS_HOUR_END = 17 // calls at/after 17:00 count as after-hours
const TZ = 'Australia/Brisbane'

type Period = 'this_month' | 'last_month' | 'all_time'

interface Range {
  start: Date
  end: Date | null // null = open ended (all_time)
}

// First day of a given month (UTC date object representing that calendar month
// boundary). monthOffset 0 = current month, -1 = last month, etc.
function monthStart(now: Date, monthOffset: number): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + monthOffset, 1, 0, 0, 0, 0))
}

function rangeFor(period: Period, now: Date): Range {
  if (period === 'all_time') {
    return { start: new Date(0), end: null }
  }
  if (period === 'last_month') {
    return { start: monthStart(now, -1), end: monthStart(now, 0) }
  }
  // this_month
  return { start: monthStart(now, 0), end: monthStart(now, 1) }
}

function previousRangeFor(period: Period, now: Date): Range | null {
  if (period === 'this_month') {
    return { start: monthStart(now, -1), end: monthStart(now, 0) }
  }
  if (period === 'last_month') {
    return { start: monthStart(now, -2), end: monthStart(now, -1) }
  }
  return null
}

// Brisbane has no DST, so local time is a fixed offset, but we resolve it via
// Intl to stay correct regardless. Returns { hour, weekday } in local time.
function brisbaneParts(d: Date): { hour: number; isWeekend: boolean } {
  const fmt = new Intl.DateTimeFormat('en-AU', {
    timeZone: TZ,
    hour: 'numeric',
    hour12: false,
    weekday: 'short',
  })
  const parts = fmt.formatToParts(d)
  const hourStr = parts.find((p) => p.type === 'hour')?.value ?? '0'
  const weekday = parts.find((p) => p.type === 'weekday')?.value ?? ''
  let hour = parseInt(hourStr, 10)
  if (hour === 24) hour = 0 // some engines emit 24 for midnight
  const isWeekend = weekday === 'Sat' || weekday === 'Sun'
  return { hour, isWeekend }
}

function isAfterHours(d: Date): boolean {
  const { hour, isWeekend } = brisbaneParts(d)
  if (isWeekend) return true
  return hour < BUSINESS_HOUR_START || hour >= BUSINESS_HOUR_END
}

type Admin = ReturnType<typeof createAdminClient>

// Count helper applying a [start, end) window on the given column.
async function countInRange(
  admin: Admin,
  table: string,
  businessId: string,
  column: string,
  range: Range,
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
    console.error(`[dashboard/roi] count ${table}.${column} failed`, error.message)
    return 0
  }
  return count ?? 0
}

async function afterHoursCount(
  admin: Admin,
  businessId: string,
  range: Range,
): Promise<number> {
  let q = admin
    .from('calls')
    .select('created_at')
    .eq('business_id', businessId)
    .gte('created_at', range.start.toISOString())
    .limit(CALLS_ROW_CAP)
  if (range.end) q = q.lt('created_at', range.end.toISOString())
  const { data, error } = await q
  if (error) {
    console.error('[dashboard/roi] after-hours select failed', error.message)
    return 0
  }
  let n = 0
  for (const row of data ?? []) {
    if (!row.created_at) continue
    if (isAfterHours(new Date(row.created_at as string))) n++
  }
  return n
}

async function totalRevenueFor(
  admin: Admin,
  businessId: string,
  range: Range,
  avgJobValue: number,
  rateCalls: number,
  rateWinback: number,
  rateChat: number,
): Promise<number> {
  const [ah, winbacks, chatLeads] = await Promise.all([
    afterHoursCount(admin, businessId, range),
    countInRange(admin, 'calls', businessId, 'winback_sent_at', range, {
      column: 'winback_sent',
      value: true,
    }),
    countInRange(admin, 'chat_sessions', businessId, 'started_at', range, {
      column: 'lead_captured',
      value: true,
    }),
  ])
  const v =
    ah * avgJobValue * (rateCalls / 100) +
    winbacks * avgJobValue * (rateWinback / 100) +
    chatLeads * avgJobValue * (rateChat / 100)
  return Math.round(v)
}

export async function GET(request: NextRequest) {
  const adminClientId = request.nextUrl.searchParams.get('adminClientId')
  const auth = await resolveBusinessId(adminClientId)
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const periodParam = request.nextUrl.searchParams.get('period') || 'this_month'
  const period: Period = (VALID_PERIODS.has(periodParam) ? periodParam : 'this_month') as Period

  const admin = createAdminClient()

  const { data: business, error: bizErr } = await admin
    .from('businesses')
    .select('avg_job_value, roi_conversion_rate_calls, roi_conversion_rate_chat, roi_conversion_rate_winback')
    .eq('id', auth.businessId)
    .maybeSingle()

  if (bizErr || !business) {
    console.error('[dashboard/roi] business load failed', bizErr?.message)
    return NextResponse.json({ ok: false, error: 'business_not_found' }, { status: 404 })
  }

  const avgJobValue = business.avg_job_value != null ? Number(business.avg_job_value) : 250
  const rateCalls = business.roi_conversion_rate_calls != null ? Number(business.roi_conversion_rate_calls) : 40
  const rateChat = business.roi_conversion_rate_chat != null ? Number(business.roi_conversion_rate_chat) : 20
  const rateWinback = business.roi_conversion_rate_winback != null ? Number(business.roi_conversion_rate_winback) : 30

  const now = new Date()
  const range = rangeFor(period, now)

  const [
    callsAfterHoursCount,
    winbacksSentCount,
    chatLeadsCount,
    reviewRequestsSentCount,
    totalCallsAnswered,
  ] = await Promise.all([
    afterHoursCount(admin, auth.businessId, range),
    countInRange(admin, 'calls', auth.businessId, 'winback_sent_at', range, {
      column: 'winback_sent',
      value: true,
    }),
    countInRange(admin, 'chat_sessions', auth.businessId, 'started_at', range, {
      column: 'lead_captured',
      value: true,
    }),
    countInRange(admin, 'review_requests', auth.businessId, 'sent_at', range),
    countInRange(admin, 'calls', auth.businessId, 'created_at', range),
  ])

  const callsValue = Math.round(callsAfterHoursCount * avgJobValue * (rateCalls / 100))
  const winbacksValue = Math.round(winbacksSentCount * avgJobValue * (rateWinback / 100))
  const chatValue = Math.round(chatLeadsCount * avgJobValue * (rateChat / 100))
  const totalEstimatedRevenue = callsValue + winbacksValue + chatValue

  let previousPeriod: { totalEstimatedRevenue: number } | null = null
  const prevRange = previousRangeFor(period, now)
  if (prevRange) {
    const prevTotal = await totalRevenueFor(
      admin,
      auth.businessId,
      prevRange,
      avgJobValue,
      rateCalls,
      rateWinback,
      rateChat,
    )
    previousPeriod = { totalEstimatedRevenue: prevTotal }
  }

  return NextResponse.json({
    ok: true,
    period,
    totalEstimatedRevenue,
    callsAfterHours: { count: callsAfterHoursCount, estimatedValue: callsValue },
    winbacksSent: { count: winbacksSentCount, estimatedValue: winbacksValue },
    chatLeads: { count: chatLeadsCount, estimatedValue: chatValue },
    reviewRequestsSent: { count: reviewRequestsSentCount },
    totalCallsAnswered,
    avgJobValue: Math.round(avgJobValue),
    previousPeriod,
  })
}
