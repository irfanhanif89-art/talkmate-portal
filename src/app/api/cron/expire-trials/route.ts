import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyCron } from '@/lib/cron-auth'
import { sendSms } from '@/lib/twilio'
import { unassignVapiPhone } from '@/lib/vapi-phone'

// Daily cron — runs at 8am AEST (22:00 UTC). Flips every trial whose
// trial_end_date has passed to account_status = 'expired'. Also fires
// the Make.com "trial expired" webhook so Donna can take the agent
// offline and send the lapsed-trial email.
export async function GET(req: Request) {
  const denied = verifyCron(req)
  if (denied) return denied

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const now = new Date().toISOString()

  const { data: expired, error } = await supabase
    .from('businesses')
    .update({ account_status: 'expired' })
    .eq('account_status', 'trial')
    .lt('trial_end_date', now)
    .select('id, name, plan, industry, trial_end_date, owner_user_id')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const expiredList = expired ?? []

  // Fire the Make.com webhook (best-effort — never block the cron on a
  // webhook failure).
  let webhookStatus: 'sent' | 'skipped_no_url' | 'skipped_empty' | 'failed' = 'skipped_no_url'
  let webhookError: string | null = null

  if (expiredList.length === 0) {
    webhookStatus = 'skipped_empty'
  } else if (process.env.MAKE_TRIAL_EXPIRED_WEBHOOK) {
    try {
      const res = await fetch(process.env.MAKE_TRIAL_EXPIRED_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trigger: 'trial_expired',
          timestamp: now,
          expired: expiredList.map(b => ({
            id: b.id,
            business_name: b.name,
            industry: b.industry,
            plan: b.plan,
            trial_end_date: b.trial_end_date,
          })),
        }),
      })
      webhookStatus = res.ok ? 'sent' : 'failed'
      if (!res.ok) webhookError = `webhook responded ${res.status}`
    } catch (e) {
      webhookStatus = 'failed'
      webhookError = e instanceof Error ? e.message : String(e)
    }
  }

  // Session 42 (H8) — unbind each expired business's Vapi phoneNumber
  // so the assistant stops answering calls. Idempotent: unassignVapiPhone
  // no-ops if vapi_phone_unassigned_at is already set or if
  // vapi_phone_number_id is null. Errors are logged + Telegram'd inside
  // the helper; we don't let one failed unassign break the cron loop.
  for (const b of expiredList) {
    await unassignVapiPhone(b.id, 'expired').catch((e) => {
      console.error('[expire-trials] unassignVapiPhone threw for', b.id, e)
    })
  }

  // Direct SMS to Irfan (belt-and-braces alongside Make.com webhook)
  if (expiredList.length > 0) {
    try {
      const lines = expiredList.map(b => {
        const d = new Date(b.trial_end_date)
        const dd = String(d.getUTCDate()).padStart(2, '0')
        const mon = d.toLocaleString('en-AU', { month: 'short', timeZone: 'UTC' })
        const yyyy = d.getUTCFullYear()
        return `${b.name} (${b.plan} plan) - ended ${dd} ${mon} ${yyyy}`
      }).join('\n')
      const plural = expiredList.length === 1 ? '' : 'es'
      await sendSms(
        `${expiredList.length} trial${plural === '' ? '' : 's'} expired today. ${lines}. Follow up and take agents offline.`
      )
    } catch (e) {
      console.error('[expire-trials] sms notification failed', e)
    }
  }

  return NextResponse.json({
    success: true,
    expired_count: expiredList.length,
    businesses: expiredList.map(b => b.name),
    webhook: { status: webhookStatus, error: webhookError },
    timestamp: now,
  })
}
