import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { verifyCron } from '@/lib/cron-auth'
import { createSystemAlert, resolveAlerts } from '@/lib/alerts'

// Daily 09:00 AEST (= 23:00 UTC). For each LIVE client, verify the Vapi phone
// number is still bound to an assistant (assistantId != null). A bound number
// means inbound calls actually reach the agent. Alert only on a real unbinding
// or fetch failure, and AUTO-RESOLVE the alert once the binding is healthy.
//
// Why this was rewritten (Session 6A): the previous implementation placed an
// OUTBOUND test call to the business number and alerted on `!res.ok` — i.e. it
// only checked that the Vapi API ACCEPTED the call-create request, never that
// call forwarding worked or that anyone answered. It also tested EVERY business
// with a number (including churned/demo rows like "Rapid Plumbing & Gas") with
// no account_status filter. The result was a daily false alarm for GM Towing,
// Spectrum Towing, and Rapid Plumbing even though the agents were answering
// real calls fine. The new check tests the thing that actually maps to call
// delivery (the phoneNumber -> assistantId binding) for LIVE clients only,
// dedupes so it does not stack a fresh alert every day, and clears the alert
// automatically once healthy.
export async function GET(req: Request) {
  const guard = verifyCron(req); if (guard) return guard
  const apiKey = process.env.VAPI_API_KEY
  if (!apiKey) return NextResponse.json({ ok: false, error: 'VAPI_API_KEY missing' }, { status: 500 })

  const supabase = createAdminClient()
  // LIVE clients only (Rule 12 — never test churned/demo/cancelled rows).
  // Must have a captured Vapi phone-number id to test against.
  const { data: businesses } = await supabase
    .from('businesses')
    .select('id, name, owner_user_id, vapi_phone_number_id, vapi_agent_id, vapi_phone_unassigned_at')
    .in('account_status', ['active', 'trial'])
    .not('vapi_phone_number_id', 'is', null)

  const stats = { tested: 0, passed: 0, failed: 0, skipped: 0, errors: [] as string[] }

  for (const b of businesses ?? []) {
    // A deliberately deprovisioned number (cancel/suspend via Lever 2) has its
    // assistantId intentionally nulled — that is not a fault, so skip it.
    if (b.vapi_phone_unassigned_at) { stats.skipped++; continue }
    stats.tested++
    try {
      const res = await fetch(`https://api.vapi.ai/phone-number/${b.vapi_phone_number_id}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(8000),
      })

      let healthy = false
      if (res.ok) {
        const pn = (await res.json().catch(() => null)) as { assistantId?: string | null } | null
        healthy = !!pn?.assistantId
      }

      await supabase.from('businesses').update({
        last_call_forward_check: new Date().toISOString(),
        call_forward_status: healthy ? 'ok' : 'failed',
      }).eq('id', b.id)

      if (healthy) {
        stats.passed++
        // Self-healing: clear any open alert now that the binding is fine again.
        await resolveAlerts(supabase, { businessId: b.id, type: 'call_forward_broken' })
      } else {
        stats.failed++
        // Dedup: only raise a new alert if one is not already open for this
        // business, so a persistent fault does not stack a fresh row every day.
        const { data: existing } = await supabase
          .from('system_alerts')
          .select('id')
          .eq('business_id', b.id)
          .eq('type', 'call_forward_broken')
          .eq('resolved', false)
          .limit(1)
        if (!existing || existing.length === 0) {
          await createSystemAlert(supabase, {
            userId: b.owner_user_id,
            businessId: b.id,
            type: 'call_forward_broken',
            severity: 'warning',
            message: `Call routing check failed for ${b.name}: the phone number is not connected to an agent. Inbound calls may not be answered.`,
            metadata: { vapi_phone_number_id: b.vapi_phone_number_id, http_status: res.status },
          })
        }
      }
    } catch (e) {
      stats.errors.push(`${b.id}: ${(e as Error).message}`)
    }
  }

  return NextResponse.json({ ok: true, ...stats })
}
