import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createAdminClient } from '@/lib/supabase/server'
import {
  sendSMS,
  templateBookingConfirmed,
  templateBookingDeclined,
} from '@/lib/sms'

// Session 29 — Twilio SMS reply webhook for the Hayden confirmation
// loop. Twilio POSTs here when a dispatcher replies to a
// dispatcher_job_notification (or dispatcher_reminder) SMS on
// +61 480 847 945 (TWILIO_CONFIRMATION_NUMBER).
//
// Flow:
//   1. Verify the request really came from Twilio via HMAC-SHA1 of
//      (full webhook URL + sorted POST params concatenated) using
//      TWILIO_AUTH_TOKEN as the key. The `twilio` npm package is
//      deliberately NOT installed — we implement the algorithm with
//      Node's built-in `crypto`.
//   2. Parse the body for a YES / NO word.
//   3. Match the dispatcher's From phone to a business via
//      businesses.notifications_config->>dispatcher_number.
//   4. Find that business's most recent pending booking with
//      dispatcher_notified_at set within the last 2 hours.
//   5. Flip the booking to confirmed/declined, stamp confirmed_at
//      and confirmed_by_phone, and fire the appropriate caller SMS.
//   6. Always return 200 with empty TwiML — Twilio retries on
//      anything else, and "no booking found" / "unrecognised reply"
//      are operational no-ops, not failures.

function validateTwilioSignature(
  authToken: string,
  signature: string,
  url: string,
  params: Record<string, string>,
): boolean {
  // Twilio's algorithm: concatenate full URL + sorted POST params as
  // key+value pairs (no separator), HMAC-SHA1 with the auth token,
  // base64-encode, compare to the x-twilio-signature header.
  const sortedParams = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], '')
  const expected = crypto
    .createHmac('sha1', authToken)
    .update(url + sortedParams)
    .digest('base64')
  return expected === signature
}

const TWIML_EMPTY = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>'

function twimlResponse() {
  return new NextResponse(TWIML_EMPTY, {
    status: 200,
    headers: { 'Content-Type': 'text/xml' },
  })
}

// Accepted YES/NO synonyms. Kept narrow on purpose — we never want
// to flip a booking on an ambiguous reply.
const YES_WORDS = ['YES', 'Y', 'CONFIRM', 'OK', 'YEP', 'YEAH']
const NO_WORDS = ['NO', 'N', 'DECLINE', 'NOPE', 'CANT', "CAN'T"]

export async function POST(request: NextRequest) {
  const authToken = process.env.TWILIO_AUTH_TOKEN
  if (!authToken) {
    console.error('[sms-reply] TWILIO_AUTH_TOKEN not set — refusing to serve')
    return new NextResponse('Server misconfiguration', { status: 500 })
  }

  const signature = request.headers.get('x-twilio-signature') ?? ''
  const url = `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.talkmate.com.au'}/api/twilio/sms-reply`
  const bodyText = await request.text()
  const params = Object.fromEntries(new URLSearchParams(bodyText)) as Record<string, string>

  if (!validateTwilioSignature(authToken, signature, url, params)) {
    return new NextResponse('Forbidden', { status: 403 })
  }

  const fromPhone = params.From ?? ''
  const messageSid = params.MessageSid ?? ''
  const replyBody = (params.Body ?? '').trim().toUpperCase()

  const isYes = YES_WORDS.includes(replyBody)
  const isNo = NO_WORDS.includes(replyBody)

  if (!isYes && !isNo) {
    console.log(`[sms-reply] Unrecognised reply from ${fromPhone}: "${replyBody}" (SID: ${messageSid})`)
    return twimlResponse()
  }

  const supabase = createAdminClient()

  // Find the business whose dispatcher_number matches the From phone.
  // We pull up to 5 in case a misconfiguration sets the same number
  // on multiple clients — we use the first match and warn.
  const { data: businesses } = await supabase
    .from('businesses')
    .select('id, name, phone_number, notifications_config')
    .filter('notifications_config->>dispatcher_number', 'eq', fromPhone)
    .limit(5)

  if (!businesses || businesses.length === 0) {
    console.log(`[sms-reply] No business found with dispatcher_number ${fromPhone}`)
    return twimlResponse()
  }
  if (businesses.length > 1) {
    console.warn(`[sms-reply] Multiple businesses share dispatcher_number ${fromPhone} — using first match`)
  }
  const business = businesses[0]
  // businesses.phone_number is the caller-facing contact (NOT
  // escalation_number, NOT notifications_config.* — per Session 29
  // production verification).
  const businessPhone = (business.phone_number as string | null) ?? ''
  const businessName = (business.name as string | null) ?? 'us'

  // Most recent pending booking, dispatcher_notified_at within 2h.
  // Limiting to 2h prevents a stale YES from confirming an old
  // booking the dispatcher already forgot about.
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
  const { data: booking } = await supabase
    .from('bookings')
    .select('id, caller_name, caller_phone, pickup_address, dropoff_address, truck_type, scheduled_start, confirmation_ref, client_id')
    .eq('client_id', business.id)
    .eq('status', 'pending')
    .not('dispatcher_notified_at', 'is', null)
    .gte('dispatcher_notified_at', twoHoursAgo)
    .order('dispatcher_notified_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!booking) {
    console.log(`[sms-reply] No pending booking found for business ${business.id} from ${fromPhone}`)
    return twimlResponse()
  }

  const now = new Date().toISOString()
  const newStatus = isYes ? 'confirmed' : 'declined'

  const { error: updateErr } = await supabase
    .from('bookings')
    .update({
      status: newStatus,
      confirmed_by_phone: fromPhone,
      confirmed_at: now,
    })
    .eq('id', booking.id)
  if (updateErr) {
    console.error('[sms-reply] booking status update failed', {
      bookingId: booking.id, newStatus, error: updateErr.message,
    })
    // Still return 200 — Twilio will retry on anything else, which
    // would multi-send to the caller.
    return twimlResponse()
  }

  // Format the scheduled date/time for the caller SMS. AU locale so
  // the dispatcher and caller see the same format on either side.
  const scheduled = booking.scheduled_start ? new Date(booking.scheduled_start as string) : null
  const scheduledDate = scheduled
    ? scheduled.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })
    : 'your scheduled time'
  const scheduledTime = scheduled
    ? scheduled.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })
    : ''

  const callerPhone = (booking.caller_phone as string | null) ?? ''
  if (!callerPhone) {
    // No caller phone on file — log and return. The booking was
    // still flipped above so the dispatcher's reply isn't lost.
    console.warn('[sms-reply] booking has no caller_phone — skipping follow-up SMS', { bookingId: booking.id })
    return twimlResponse()
  }

  if (isYes) {
    await sendSMS({
      to: callerPhone,
      message: templateBookingConfirmed({
        callerName: (booking.caller_name as string | null) ?? 'there',
        truckType: (booking.truck_type as string | null) ?? 'truck',
        businessName,
        scheduledDate,
        scheduledTime,
        pickupAddress: (booking.pickup_address as string | null) ?? '',
        dropoffAddress: (booking.dropoff_address as string | null) ?? '',
        businessPhone,
      }),
      clientId: business.id as string,
      smsType: 'booking_confirmed',
      bookingId: booking.id as string,
    })
  } else {
    await sendSMS({
      to: callerPhone,
      message: templateBookingDeclined({
        callerName: (booking.caller_name as string | null) ?? 'there',
        businessPhone,
      }),
      clientId: business.id as string,
      smsType: 'booking_declined',
      bookingId: booking.id as string,
    })
  }

  return twimlResponse()
}
