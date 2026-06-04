import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { verifyCron } from '@/lib/cron-auth'
import { createSystemAlert } from '@/lib/alerts'
import { sendAdminTelegram } from '@/lib/notifications'
import { CLIENT_HEALTH_CONFIG, evaluateClientHealth, evaluateAccountSignals, type CallRow } from '@/lib/client-health'

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
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)

  const { data: businesses } = await supabase
    .from('businesses')
    .select('id, name, account_status, owner_user_id, created_at, winback_enabled, review_requests_enabled, google_review_url')
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

    // Session 4B — account-level signals, evaluated regardless of call volume
    // so a quiet client (zero calls) can still surface as a churn risk.
    let daysSinceLogin: number | null = null
    if (b.owner_user_id) {
      try {
        const { data: u } = await supabase.auth.admin.getUserById(b.owner_user_id as string)
        const last = u?.user?.last_sign_in_at
        if (last) daysSinceLogin = Math.floor((Date.now() - Date.parse(last)) / 86_400_000)
      } catch { /* ignore auth lookup failure */ }
    }
    const [{ count: kbCount }, { count: pendingGaps }] = await Promise.all([
      supabase.from('knowledge_base_entries').select('id', { count: 'exact', head: true }).eq('business_id', b.id),
      supabase.from('transcript_gaps').select('id', { count: 'exact', head: true })
        .eq('business_id', b.id).eq('status', 'pending').lt('detected_at', threeDaysAgo.toISOString()),
    ])
    const accountAgeDays = b.created_at ? Math.floor((Date.now() - Date.parse(b.created_at as string)) / 86_400_000) : 0
    const accountSig = evaluateAccountSignals({
      daysSinceLogin,
      kbCount: kbCount ?? 0,
      callsLast7d: rows.length,
      accountAgeDays,
      winbackEnabled: !!b.winback_enabled,
      reviewRequestsEnabled: !!b.review_requests_enabled,
      hasGoogleReviewUrl: !!b.google_review_url,
      pendingGapsOver3d: pendingGaps ?? 0,
    })

    const callResult = rows.length >= CLIENT_HEALTH_CONFIG.MIN_CALLS ? evaluateClientHealth(rows) : null
    const callBreached = callResult?.breached ?? false
    const accountBreached = accountSig.riskScore >= 60

    if (rows.length < CLIENT_HEALTH_CONFIG.MIN_CALLS && !accountBreached) {
      stats.skipped_low_volume++
      continue
    }
    if (!callBreached && !accountBreached) {
      stats.healthy++
      continue
    }

    const result = {
      total: rows.length,
      reasons: [...(callResult?.reasons ?? []), ...accountSig.reasons],
      repeatShortNumbers: callResult?.repeatShortNumbers ?? [],
      severity: (callResult?.severity ?? (accountSig.riskScore >= 80 ? 'critical' : 'warning')) as 'warning' | 'critical',
      metrics: { ...(callResult?.metrics ?? { window_calls: rows.length }), risk_score: accountSig.riskScore, health_score: accountSig.healthScore },
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
