import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { sendSMS, templateWaitlistOffer } from '@/lib/sms'

// Internal endpoint — called when a booking slot opens (cancellation,
// admin slot creation, etc.). Auth: internal secret matching
// INTERNAL_API_SECRET or VAPI_WEBHOOK_SECRET. Pulls the next waiting
// entry, marks it offered, sends the SMS, and stamps the expiry window.

export async function POST(request: Request) {
  const expected = process.env.INTERNAL_API_SECRET || process.env.VAPI_WEBHOOK_SECRET
  if (expected) {
    const got = request.headers.get('x-internal-secret') ?? ''
    if (got !== expected) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const clientId = String(body.client_id ?? '').trim()
  if (!clientId) return NextResponse.json({ error: 'client_id required' }, { status: 400 })

  const supabase = createAdminClient()

  const [{ data: scheduler }, { data: biz }] = await Promise.all([
    supabase.from('scheduler_settings')
      .select('waitlist_enabled, waitlist_auto_notify, waitlist_claim_window_minutes')
      .eq('client_id', clientId).maybeSingle(),
    supabase.from('businesses').select('name, phone_number').eq('id', clientId).maybeSingle(),
  ])
  if (scheduler?.waitlist_enabled === false || scheduler?.waitlist_auto_notify === false) {
    return NextResponse.json({ ok: true, offered: false, reason: 'waitlist_disabled' })
  }

  const { data: next } = await supabase
    .from('waitlist')
    .select('*')
    .eq('client_id', clientId)
    .eq('status', 'waiting')
    .order('position', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (!next) return NextResponse.json({ ok: true, offered: false, reason: 'empty' })

  const claimMins = scheduler?.waitlist_claim_window_minutes ?? 30
  const offerExpiresAt = new Date(Date.now() + claimMins * 60_000).toISOString()
  await supabase
    .from('waitlist')
    .update({ status: 'offered', offered_at: new Date().toISOString(), offer_expires_at: offerExpiresAt })
    .eq('id', next.id)

  const slotStart = typeof body.scheduled_start === 'string' ? new Date(body.scheduled_start) : null
  const message = templateWaitlistOffer({
    caller_name: next.caller_name as string | null,
    business_name: biz?.name ?? 'us',
    business_phone: biz?.phone_number ?? '',
    date: slotStart ? slotStart.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' }) : (next.requested_date as string | null) ?? '',
    time: slotStart ? slotStart.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true }) : (next.requested_time_preference as string | null) ?? '',
    claim_window: claimMins,
  })
  const smsRes = await sendSMS({
    to: next.caller_phone as string,
    message,
    clientId,
    smsType: 'waitlist_offer',
    waitlistId: next.id as string,
  })

  return NextResponse.json({ ok: true, offered: true, waitlist_id: next.id, sms: smsRes })
}
