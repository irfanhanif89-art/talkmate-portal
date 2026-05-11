import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin-auth'

// "Mark onboarding complete and brief Donna" — flips the
// onboarding_complete flag and fires the Make.com auto-agent-brief
// webhook so Donna can build the Vapi agent without a manual handover.
//
// The webhook URL is configured via MAKE_AGENT_BRIEF_WEBHOOK. If it's
// not set we still flip the flag (so the UI moves forward) but record
// the missing-webhook condition in the response. Donna fills the URL in
// after wiring the Make.com scenario.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const { id } = await params
  if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })

  const admin = createAdminClient()
  const triggeredAt = new Date().toISOString()

  const { data: business, error } = await admin
    .from('businesses')
    .update({
      onboarding_complete: true,
      onboarding_complete_at: triggeredAt,
    })
    .eq('id', id)
    .select('*')
    .single()

  if (error || !business) {
    return NextResponse.json({ ok: false, error: error?.message ?? 'business not found' }, { status: 500 })
  }

  // Map our schema → the wire format Donna's Make.com scenario expects.
  // The brief uses business_name / phone / trading_hours; our columns
  // are name / phone_number / opening_hours. The translation lives in
  // one place: here.
  const payload = {
    trigger: 'onboarding_complete',
    timestamp: triggeredAt,
    business: {
      id: business.id,
      business_name: business.name,
      industry: business.industry,
      trade_type: business.trade_type,
      plan: business.plan,
      account_status: business.account_status,
      phone: business.phone_number,
      address: business.address,
      service_area: business.service_area ?? null,
      trading_hours: business.opening_hours ?? null,
      services: business.services ?? [],
      escalation_name: business.escalation_name ?? null,
      escalation_phone: business.escalation_phone ?? null,
      notifications_config: business.notifications_config ?? {},
    },
  }

  const webhookUrl = process.env.MAKE_AGENT_BRIEF_WEBHOOK
  let webhookStatus: 'sent' | 'skipped_no_url' | 'failed' = 'skipped_no_url'
  let webhookError: string | null = null

  if (webhookUrl) {
    try {
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      webhookStatus = res.ok ? 'sent' : 'failed'
      if (!res.ok) webhookError = `webhook responded ${res.status}`
    } catch (e) {
      webhookStatus = 'failed'
      webhookError = e instanceof Error ? e.message : String(e)
    }
  }

  await admin.from('client_comms_log').insert({
    business_id: id,
    note: webhookStatus === 'sent'
      ? 'Onboarding marked complete. Donna briefed via Make.com webhook.'
      : webhookStatus === 'skipped_no_url'
        ? 'Onboarding marked complete. Make.com webhook URL not configured — Donna must be briefed manually.'
        : `Onboarding marked complete. Donna webhook FAILED: ${webhookError}`,
  })

  return NextResponse.json({
    ok: true,
    business: {
      id: business.id,
      onboarding_complete: true,
      onboarding_complete_at: triggeredAt,
    },
    webhook: { status: webhookStatus, error: webhookError },
  })
}
