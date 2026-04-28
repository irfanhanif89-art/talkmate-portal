import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { verifyCron } from '@/lib/cron-auth'
import { createSystemAlert } from '@/lib/alerts'
import { postEmailTrigger } from '@/lib/make-webhook'
import { getPlan } from '@/lib/plan'

// Brief Part 12 — usage monitoring.
// Runs every 30 minutes. Aggregates this-month call counts per business and
// raises 80%/95% alerts when thresholds are crossed (idempotent via flags).
export async function GET(req: Request) {
  const guard = verifyCron(req); if (guard) return guard
  const supabase = createAdminClient()

  const startOfMonth = new Date()
  startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0)
  const monthYear = `${startOfMonth.getFullYear()}-${String(startOfMonth.getMonth() + 1).padStart(2, '0')}`

  const { data: businesses } = await supabase
    .from('businesses')
    .select('id, name, plan, owner_user_id, plan_call_limit')

  const stats = { reviewed: 0, alert80: 0, alert95: 0 }

  for (const b of businesses ?? []) {
    stats.reviewed++
    const plan = getPlan(b.plan)
    const limit = b.plan_call_limit ?? plan.callLimit ?? 0
    if (!limit) continue // unlimited plans

    const { count } = await supabase.from('calls').select('id', { count: 'exact', head: true })
      .eq('business_id', b.id).gte('created_at', startOfMonth.toISOString())
    const callCount = count ?? 0

    const pct = callCount / limit

    // Upsert usage_alerts
    const { data: row } = await supabase.from('usage_alerts')
      .select('alert_sent_80, alert_sent_95').eq('business_id', b.id).eq('month_year', monthYear).maybeSingle()
    const sent80 = row?.alert_sent_80 ?? false
    const sent95 = row?.alert_sent_95 ?? false

    let updates: { alert_sent_80?: boolean; alert_sent_95?: boolean } = {}

    if (pct >= 0.95 && !sent95) {
      updates.alert_sent_95 = true
      stats.alert95++
      await createSystemAlert(supabase, {
        userId: b.owner_user_id, businessId: b.id,
        type: 'usage_95pct', severity: 'critical',
        message: `${b.name} has used 95% of monthly call limit (${callCount}/${limit})`,
      })
      await postEmailTrigger({ event: 'usage_95pct', userId: b.owner_user_id, businessId: b.id, data: { callsUsed: callCount, callsLimit: limit } })
    } else if (pct >= 0.80 && !sent80) {
      updates.alert_sent_80 = true
      stats.alert80++
      await createSystemAlert(supabase, {
        userId: b.owner_user_id, businessId: b.id,
        type: 'usage_80pct', severity: 'warning',
        message: `${b.name} has used 80% of monthly call limit (${callCount}/${limit})`,
      })
      await postEmailTrigger({ event: 'usage_80pct', userId: b.owner_user_id, businessId: b.id, data: { callsUsed: callCount, callsLimit: limit } })
    }

    await supabase.from('usage_alerts').upsert({
      business_id: b.id,
      call_count: callCount,
      plan_limit: limit,
      month_year: monthYear,
      alert_sent_80: sent80 || updates.alert_sent_80 || false,
      alert_sent_95: sent95 || updates.alert_sent_95 || false,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'business_id,month_year' })
  }

  return NextResponse.json({ ok: true, ...stats })
}
