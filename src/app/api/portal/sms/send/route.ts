import { NextResponse } from 'next/server'
import { requireClient } from '@/lib/portal-auth'
import { sendSMS, type SmsType } from '@/lib/sms'

// Manual SMS send endpoint for the portal — used by the scheduler UI to
// resend a confirmation, push a reminder early, or trigger a custom send.
// Anything kicked off by the agent or by a cron writes through `sendSMS`
// directly without going via this route.

const VALID_TYPES: SmsType[] = [
  'booking_confirmation', 'booking_reminder_24h', 'booking_reminder_2h',
  'booking_cancellation', 'waitlist_offer', 'waitlist_claimed',
  'waitlist_expired', 'callback_reminder', 'vip_missed_call', 'other',
]

export async function POST(request: Request) {
  const auth = await requireClient()
  if ('error' in auth) return auth.error
  const { clientId } = auth

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const to = String(body.to ?? '').trim()
  const message = String(body.message ?? '').trim()
  const smsType = String(body.sms_type ?? 'other') as SmsType
  if (!to || !message) {
    return NextResponse.json({ error: 'to and message required' }, { status: 400 })
  }
  if (!VALID_TYPES.includes(smsType)) {
    return NextResponse.json({ error: 'invalid sms_type' }, { status: 400 })
  }

  const result = await sendSMS({
    to, message, clientId, smsType,
    bookingId: typeof body.booking_id === 'string' ? body.booking_id : undefined,
    waitlistId: typeof body.waitlist_id === 'string' ? body.waitlist_id : undefined,
  })
  if (!result.success) {
    return NextResponse.json(result, { status: result.reason === 'plan_starter' || result.reason === 'plan_quota' ? 402 : 500 })
  }
  return NextResponse.json(result)
}
