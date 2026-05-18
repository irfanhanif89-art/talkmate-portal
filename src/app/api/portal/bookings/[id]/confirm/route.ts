import { NextResponse } from 'next/server'
import { requireClient } from '@/lib/portal-auth'
import { createAdminClient } from '@/lib/supabase/server'
import { sendSMS, templateBookingConfirmation } from '@/lib/sms'

// POST /api/portal/bookings/[id]/confirm
//
// Flips the booking to 'confirmed', stamps confirmed_at, and sends the
// confirmation SMS via /lib/sms.ts (direct Twilio). Session 17B retired
// the Make.com MAKE_BOOKING_WEBHOOK path here -- direct Twilio is the
// canonical SMS pipeline.

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireClient()
  if ('error' in auth) return auth.error
  const { supabase, clientId } = auth

  const { id } = await params

  const { data: booking, error } = await supabase
    .from('bookings')
    .update({
      status: 'confirmed',
      confirmed_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('*')
    .single()

  if (error || !booking) {
    return NextResponse.json({ error: error?.message ?? 'Booking not found' }, { status: 404 })
  }

  // Pull business + notification config for the SMS template.
  const admin = createAdminClient()
  const { data: biz } = await admin
    .from('businesses')
    .select('name, notifications_config')
    .eq('id', clientId)
    .maybeSingle()
  const notif = (biz?.notifications_config ?? {}) as Record<string, unknown>
  const businessPhone = (notif.live_transfer_number as string | undefined)
    || (notif.phone_number as string | undefined)
    || undefined

  let smsSent = false
  let smsReason: string | undefined
  const callerPhone = (booking as { caller_phone?: string | null }).caller_phone
  const scheduledStart = (booking as { scheduled_start?: string | null }).scheduled_start
  if (callerPhone && scheduledStart) {
    const date = new Date(scheduledStart).toLocaleDateString('en-AU', {
      weekday: 'short', day: 'numeric', month: 'short',
    })
    const time = new Date(scheduledStart).toLocaleTimeString('en-AU', {
      hour: 'numeric', minute: '2-digit', hour12: true,
    })
    const message = templateBookingConfirmation({
      caller_name: (booking as { caller_name?: string | null }).caller_name ?? undefined,
      business_name: (biz?.name as string | undefined) ?? undefined,
      business_phone: businessPhone,
      truck_type: (booking as { truck_type?: string | null }).truck_type ?? null,
      date,
      time,
      pickup_address: (booking as { pickup_address?: string | null }).pickup_address ?? null,
      dropoff_address: (booking as { dropoff_address?: string | null }).dropoff_address ?? null,
    })
    const result = await sendSMS({
      to: callerPhone,
      message,
      clientId,
      smsType: 'booking_confirmation',
      bookingId: (booking as { id: string }).id,
    })
    smsSent = result.success
    if (!result.success) smsReason = result.reason ?? result.error

    if (smsSent) {
      await supabase
        .from('bookings')
        .update({ sms_confirmation_sent: true })
        .eq('id', id)
    }
  }

  return NextResponse.json({
    booking,
    sms: smsSent ? 'sent' : (smsReason ? `skipped:${smsReason}` : 'skipped'),
  })
}
