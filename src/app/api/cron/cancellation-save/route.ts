// Session 4B Phase B — cancellation save sequence.
// ~23h after a subscription is cancelled, send ONE transactional SMS to the
// owner (service they paid for has ended + data-retention notice). Hourly.
// vercel.json: "0 * * * *".
//
// SAFETY: default-OFF. Only runs when CANCELLATION_SAVE_ENABLED === 'true'.
// This lets the route deploy to prod inert until explicitly switched on, and
// lets it be enabled first against a synthetic test business.
import { NextResponse } from 'next/server'
import { verifyCron } from '@/lib/cron-auth'
import { createAdminClient } from '@/lib/supabase/server'
import { sendSMS, normaliseAuPhone } from '@/lib/sms'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const denied = verifyCron(req)
  if (denied) return denied

  if (process.env.CANCELLATION_SAVE_ENABLED !== 'true') {
    return NextResponse.json({ ok: true, status: 'disabled' })
  }

  const admin = createAdminClient()
  const now = Date.now()
  const lo = new Date(now - 24 * 60 * 60 * 1000).toISOString()
  const hi = new Date(now - 22 * 60 * 60 * 1000).toISOString()

  const { data: businesses } = await admin
    .from('businesses')
    .select('id, name, owner_phone, notifications_config, escalation_number, cancelled_at, cancellation_save_sent')
    .eq('account_status', 'cancelled')
    .eq('cancellation_save_sent', false)
    .gte('cancelled_at', lo)
    .lte('cancelled_at', hi)
    .limit(10)

  let sent = 0, skipped = 0
  for (const b of businesses ?? []) {
    const cfg = (b.notifications_config ?? {}) as Record<string, unknown>
    const rawPhone = (b.owner_phone as string | null)
      || (typeof cfg.owner_number === 'string' ? cfg.owner_number : '')
      || (b.escalation_number as string | null)
      || ''
    const to = normaliseAuPhone(rawPhone)
    if (!to) { skipped++; continue }

    const res = await sendSMS({
      to,
      message: 'Your TalkMate agent has stopped answering calls. Your contacts and call history are saved for 30 days. To reactivate, sign in at app.talkmate.com.au or reply HELP. Reply STOP to opt out.',
      clientId: b.id as string,
      smsType: 'cancellation_save',
    })
    if (res.success) {
      sent++
      await admin.from('businesses')
        .update({ cancellation_save_sent: true, cancellation_save_sent_at: new Date().toISOString() })
        .eq('id', b.id)
    } else {
      skipped++
      console.warn('[cancellation-save] send failed', { businessId: b.id, reason: res.reason })
    }
  }

  return NextResponse.json({ ok: true, sent, skipped })
}
