import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { verifyCron } from '@/lib/cron-auth'
import { createSystemAlert } from '@/lib/alerts'
import { sendAdminTelegram } from '@/lib/notifications'
import { CLIENT_HEALTH_CONFIG, evaluateClientHealth, type CallRow } from '@/lib/client-health'

// ─── Per-client health watcher ──────────────────────────────────────
// Churn-risk early warning. Distinct from:
//   • health-monitor       (system-level health)
//   • agent-health-check   (Vapi assistant liveness)
//   • daily-quality-digest (per-call quality digest)
//
// This scans each ACTIVE client's recent call OUTCOMES and flags the
// pattern that killed GM Towing weeks before they gave notice: average
// call duration collapsing, callers hanging up in the first few seconds,
// known regulars bouncing off the agent, and silence timeouts climbing.
//
// Fires at most ONE Telegram alert per client per 7-day window (deduped
// via a `system_alerts` row of type `client_health_risk`). Re-alerts the
// following week if the client is still unhealthy.
//
// Metric math lives in `@/lib/client-health` (unit-tested). This route
// owns fetching + dedup + alerting only.

export async function GET(req: Request) {
  const guard = verifyCron(req)
  if (guard) return guard
  const supabase = createAdminClient()

  const windowStart = new Date(Date.now() - CLIENT_HEALTH_CONFIG.WINDOW_DAYS * 24 * 60 * 60 * 1000)
  const dedupStart = new Date(Date.now() - CLIENT_HEALTH_CONFIG.DEDUP_DAYS * 24 * 60 * 60 * 1000)

  const { data: businesses } = await supabase
    .from('businesses')
    .select('id, name, account_status')
    .eq('account_status', 'active')
    .not('is_demo', 'is', true) // skip demo/test businesses

  const stats = { checked: 0, alerted: 0, skipped_low_volume: 0, healthy: 0 }

  for (const b of businesses ?? []) {
    stats.checked++

    const { data: calls } = await supabase
      .from('calls')
      .select('duration_seconds, caller_number, ended_reason')
      .eq('business_id', b.id)
      .gte('created_at', windowStart.toISOString())

    const rows = (calls ?? []) as CallRow[]
    if (rows.length < CLIENT_HEALTH_CONFIG.MIN_CALLS) {
      stats.skipped_low_volume++
      continue
    }

    const result = evaluateClientHealth(rows)
    if (!result.breached) {
      stats.healthy++
      continue
    }

    // Dedup — already alerted on this client in the dedup window?
    const { data: existing } = await supabase
      .from('system_alerts')
      .select('id')
      .eq('business_id', b.id)
      .eq('type', 'client_health_risk')
      .gte('created_at', dedupStart.toISOString())
      .limit(1)

    if (existing && existing.length > 0) continue

    stats.alerted++

    const lines = [
      `${result.severity === 'critical' ? '🔴' : '⚠️'} Client health risk: ${b.name}`,
      `Last ${CLIENT_HEALTH_CONFIG.WINDOW_DAYS}d · ${result.total} calls`,
      ...result.reasons.map(r => `• ${r}`),
    ]
    if (result.repeatShortNumbers.length) {
      lines.push(`Repeat hang-ups: ${result.repeatShortNumbers.join(', ')}`)
    }
    lines.push(`Review: https://app.talkmate.com.au/admin/clients/${b.id}`)

    await sendAdminTelegram(lines.join('\n'))
    await createSystemAlert(supabase, {
      businessId: b.id,
      type: 'client_health_risk',
      severity: result.severity,
      message: `${b.name}: ${result.reasons.join('; ')}`,
      metadata: result.metrics,
    })
  }

  return NextResponse.json({ ok: true, ...stats })
}
