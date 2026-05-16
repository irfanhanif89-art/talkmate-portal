import { NextResponse } from 'next/server'
import { verifyCron } from '@/lib/cron-auth'
import { createAdminClient } from '@/lib/supabase/server'
import { sendSMS, templateWaitlistExpired } from '@/lib/sms'

// Runs every 15 minutes. Expires any waitlist offer that has run past
// its claim window, sends the expiry SMS, and pushes the offer to the
// next waiting entry on that client.
export async function GET(request: Request) {
  const auth = verifyCron(request)
  if (auth) return auth

  const supabase = createAdminClient()
  const nowIso = new Date().toISOString()

  const { data: expired } = await supabase
    .from('waitlist')
    .select('id, client_id, caller_phone, caller_name')
    .eq('status', 'offered')
    .lt('offer_expires_at', nowIso)

  const expiredRows = expired ?? []
  const businesses = new Set<string>()
  let expiredCount = 0
  let smsCount = 0

  for (const row of expiredRows) {
    await supabase
      .from('waitlist')
      .update({ status: 'expired' })
      .eq('id', row.id)
    expiredCount++

    const { data: biz } = await supabase.from('businesses').select('name, phone_number').eq('id', row.client_id).maybeSingle()
    const message = templateWaitlistExpired({
      caller_name: row.caller_name as string | null,
      business_name: biz?.name ?? 'us',
      business_phone: biz?.phone_number ?? '',
    })
    const r = await sendSMS({
      to: row.caller_phone as string,
      message,
      clientId: row.client_id as string,
      smsType: 'waitlist_expired',
      waitlistId: row.id as string,
    })
    if (r.success) smsCount++
    businesses.add(row.client_id as string)
  }

  // For each business that had an expiry, push the offer to the next entry.
  const internalSecret = process.env.INTERNAL_API_SECRET || process.env.VAPI_WEBHOOK_SECRET || ''
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.talkmate.com.au'
  let offered = 0
  for (const clientId of businesses) {
    try {
      const res = await fetch(`${appUrl}/api/portal/waitlist/offer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-secret': internalSecret },
        body: JSON.stringify({ client_id: clientId }),
      })
      const d = await res.json().catch(() => ({}))
      if (d?.offered) offered++
    } catch (e) { console.error('[cron/waitlist-expiry] offer failed', e) }
  }

  return NextResponse.json({ ok: true, expired: expiredCount, sms_sent: smsCount, offers_pushed: offered })
}

export const POST = GET
