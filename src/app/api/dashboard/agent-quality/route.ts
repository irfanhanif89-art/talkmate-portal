import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Session 18 — powers the Agent Quality card on /dashboard.
// Returns average intelligence_score over the last 7 days, the
// previous-7-days average for the trend arrow, and the count of calls
// today still flagged for review or critical.

export const dynamic = 'force-dynamic'

interface ScoreRow {
  intelligence_score: number | null
  intelligence_status: string | null
  created_at: string
}

export async function GET() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: biz } = await supabase
    .from('businesses')
    .select('id')
    .eq('owner_user_id', user.id)
    .maybeSingle()
  if (!biz) return NextResponse.json({ error: 'No business' }, { status: 404 })

  const now = Date.now()
  const day = 24 * 60 * 60 * 1000
  const cutoff14 = new Date(now - 14 * day).toISOString()
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)

  const { data } = await supabase
    .from('calls')
    .select('intelligence_score, intelligence_status, created_at')
    .eq('business_id', (biz as { id: string }).id)
    .gte('created_at', cutoff14)
    .order('created_at', { ascending: false })
    .limit(500)

  const rows = (data ?? []) as ScoreRow[]
  const cutoff7 = now - 7 * day

  let sum7 = 0, count7 = 0
  let sumPrev = 0, countPrev = 0
  let flaggedToday = 0
  const todayMs = todayStart.getTime()

  for (const r of rows) {
    const t = Date.parse(r.created_at)
    if (!Number.isFinite(t)) continue
    if (typeof r.intelligence_score === 'number') {
      if (t >= cutoff7) { sum7 += r.intelligence_score; count7++ }
      else { sumPrev += r.intelligence_score; countPrev++ }
    }
    if (t >= todayMs && (r.intelligence_status === 'critical' || r.intelligence_status === 'review')) {
      flaggedToday++
    }
  }

  const avg7 = count7 > 0 ? Math.round((sum7 / count7) * 10) / 10 : null
  const avgPrev = countPrev > 0 ? Math.round((sumPrev / countPrev) * 10) / 10 : null

  return NextResponse.json({
    avg7,
    avgPrev,
    count7,
    flaggedToday,
  })
}
