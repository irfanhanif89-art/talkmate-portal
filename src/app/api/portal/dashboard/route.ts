// GET /api/portal/dashboard — mobile home aggregate.
// Stats (today/week/month), a 7-day call chart, recent calls, today's
// bookings. Computed from calls + bookings + callbacks for the owner's
// business. Bearer (or cookie) via requireClient.

import { NextResponse } from 'next/server'
import { requireClient } from '@/lib/portal-auth'

export const dynamic = 'force-dynamic'

const DAY = 24 * 60 * 60 * 1000
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export async function GET(request: Request) {
  const auth = await requireClient(request)
  if ('error' in auth) return auth.error
  const { supabase, clientId } = auth

  const now = Date.now()
  const startToday = new Date(); startToday.setHours(0, 0, 0, 0)
  const since30 = new Date(now - 30 * DAY).toISOString()

  const [callsRes, bookingsRes, recentRes, callbacksRes] = await Promise.all([
    supabase.from('calls')
      .select('started_at, duration_seconds, was_abandoned')
      .eq('business_id', clientId)
      .gte('started_at', since30),
    supabase.from('bookings')
      .select('scheduled_start, status')
      .eq('client_id', clientId)
      .gte('scheduled_start', since30),
    supabase.from('calls')
      .select('id, caller_name, caller_number, started_at, created_at, duration_seconds, outcome, summary, transcript, recording_url, intelligence_score, is_vip_caller, was_abandoned, booking_id')
      .eq('business_id', clientId)
      .order('started_at', { ascending: false, nullsFirst: false })
      .limit(3),
    supabase.from('callbacks')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', clientId)
      .eq('status', 'pending'),
  ])

  const calls = callsRes.data ?? []
  const bookings = bookingsRes.data ?? []
  const callbacksPending = callbacksRes.count ?? 0

  const isMissed = (c: { was_abandoned?: boolean | null; duration_seconds?: number | null }) =>
    !!c.was_abandoned || !c.duration_seconds

  function statsSince(ms: number) {
    const cutoff = now - ms
    const c = calls.filter(x => x.started_at && new Date(x.started_at).getTime() >= cutoff)
    const b = bookings.filter(x => x.scheduled_start && new Date(x.scheduled_start).getTime() >= cutoff)
    return {
      calls: c.length,
      bookings: b.length,
      missed: c.filter(isMissed).length,
      callbacksPending,
    }
  }
  const startTodayMs = startToday.getTime()
  const todayStats = {
    calls: calls.filter(x => x.started_at && new Date(x.started_at).getTime() >= startTodayMs).length,
    bookings: bookings.filter(x => x.scheduled_start && new Date(x.scheduled_start).getTime() >= startTodayMs).length,
    missed: calls.filter(x => x.started_at && new Date(x.started_at).getTime() >= startTodayMs && isMissed(x)).length,
    callbacksPending,
  }

  // 7-day chart (oldest -> newest)
  const values: number[] = []
  const labels: string[] = []
  for (let i = 6; i >= 0; i--) {
    const dayStart = new Date(now - i * DAY); dayStart.setHours(0, 0, 0, 0)
    const dayEnd = dayStart.getTime() + DAY
    values.push(calls.filter(x => {
      const t = x.started_at ? new Date(x.started_at).getTime() : 0
      return t >= dayStart.getTime() && t < dayEnd
    }).length)
    labels.push(DAY_NAMES[dayStart.getDay()])
  }

  const todayBookings = (await supabase.from('bookings')
    .select('*')
    .eq('client_id', clientId)
    .gte('scheduled_start', startToday.toISOString())
    .lt('scheduled_start', new Date(startTodayMs + DAY).toISOString())
    .order('scheduled_start', { ascending: true })).data ?? []

  return NextResponse.json({
    ok: true,
    stats: { today: todayStats, week: statsSince(7 * DAY), month: statsSince(30 * DAY) },
    chart: { week: { values, labels } },
    recentCalls: recentRes.data ?? [],
    todayBookings,
  })
}
