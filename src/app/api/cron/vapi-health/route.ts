import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { verifyCron } from '@/lib/cron-auth'
import { createSystemAlert, resolveAlerts, sendInternalEmail } from '@/lib/alerts'

// Brief Part 12. Runs every minute (vercel.json).
// Pings the Vapi API and tracks consecutive fail/success streaks.
// 3 consecutive fails -> notify all active clients + create alerts.
// 3 consecutive successes after a failure -> clear alerts + notify.
export async function GET(req: Request) {
  const guard = verifyCron(req); if (guard) return guard

  const supabase = createAdminClient()
  const { data: state } = await supabase.from('vapi_health').select('*').eq('id', 1).single()
  const failCount = state?.fail_count ?? 0
  const successStreak = state?.success_streak ?? 0
  const apiKey = process.env.VAPI_API_KEY

  let healthy = false
  let lastError: string | null = null
  if (!apiKey) {
    healthy = false
    lastError = 'VAPI_API_KEY not set'
  } else {
    try {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 5000)
      const res = await fetch('https://api.vapi.ai/health', {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: ctrl.signal,
      })
      clearTimeout(timer)
      healthy = res.ok
      if (!res.ok) lastError = `Vapi ${res.status}`
    } catch (e) {
      healthy = false
      lastError = (e as Error).name === 'AbortError' ? 'timeout' : (e as Error).message
    }
  }

  if (healthy) {
    const newSuccess = successStreak + 1
    await supabase.from('vapi_health').upsert({
      id: 1,
      fail_count: 0,
      success_streak: newSuccess,
      last_check: new Date().toISOString(),
      last_status: 'ok',
      last_error: null,
    })
    // Recovery: 3 successes in a row after a previous outage
    if (failCount >= 3 && newSuccess === 3) {
      await resolveAlerts(supabase, { type: 'vapi_down' })
      await createSystemAlert(supabase, {
        type: 'vapi_recovered',
        severity: 'info',
        message: 'Vapi voice agent service has recovered.',
      })
      await sendInternalEmail('✅ Vapi recovered', '<p>Voice agent service is back online after a degradation event.</p>')
    }
    return NextResponse.json({ ok: true, healthy: true, successStreak: newSuccess })
  }

  const newFail = failCount + 1
  await supabase.from('vapi_health').upsert({
    id: 1,
    fail_count: newFail,
    success_streak: 0,
    last_check: new Date().toISOString(),
    last_status: newFail >= 3 ? 'down' : 'degraded',
    last_error: lastError,
  })

  // Trigger alert at the 3rd consecutive failure
  if (newFail === 3) {
    await createSystemAlert(supabase, {
      type: 'vapi_down',
      severity: 'critical',
      message: 'Vapi voice agent has failed health checks 3 consecutive times.',
      metadata: { lastError },
    })
    await sendInternalEmail(
      '🚨 Vapi voice agent down',
      `<p>Vapi has failed 3 consecutive health checks.</p><p>Last error: <code>${lastError ?? 'unknown'}</code></p>`,
    )
  }

  return NextResponse.json({ ok: true, healthy: false, failCount: newFail, error: lastError })
}
