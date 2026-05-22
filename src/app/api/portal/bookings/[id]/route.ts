import { NextResponse } from 'next/server'
import { requireClient } from '@/lib/portal-auth'
import { sendSMS, templateCancellation } from '@/lib/sms'

// Allowed PATCH fields. The scheduler UI uses this endpoint for status
// changes, reschedule, mark complete, cancellation reason, etc.
const ALLOWED_FIELDS = new Set([
  'status', 'caller_name', 'caller_phone',
  'description', 'pickup_address', 'pickup_contact_name', 'pickup_contact_phone',
  'dropoff_address', 'dropoff_contact_name', 'dropoff_contact_phone',
  'truck_type', 'rate_type', 'driver_id', 'estimated_value',
  'scheduled_start', 'scheduled_end', 'actual_start', 'actual_end',
  'no_show', 'cancellation_reason',
  // Removed: booking_type, service_requested, preferred_date, preferred_time, notes (Session 33)
  // sms_confirmation_sent intentionally omitted — add only if admin override needed
])

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireClient()
  if ('error' in auth) return auth.error
  const { supabase, clientId } = auth

  const { id } = await params
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const update: Record<string, unknown> = {}
  for (const k of Object.keys(body)) {
    if (ALLOWED_FIELDS.has(k)) update[k] = body[k]
  }
  if (update.status === 'confirmed' && !update.confirmed_at) {
    update.confirmed_at = new Date().toISOString()
  }
  if (update.status === 'completed' && !update.actual_end) {
    update.actual_end = new Date().toISOString()
  }

  // Capture prior status so we can react after the update.
  const { data: prior } = await supabase
    .from('bookings')
    .select('status, caller_phone, caller_name, scheduled_start, truck_type, pickup_address, dropoff_address')
    .eq('id', id)
    .maybeSingle()

  const { data, error } = await supabase
    .from('bookings')
    .update(update)
    .eq('id', id)
    .select('*')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Side effect: cancellation triggers a cancellation SMS + waitlist offer.
  if (update.status === 'cancelled' && prior?.status !== 'cancelled' && prior?.caller_phone) {
    const { data: biz } = await supabase.from('businesses').select('name, phone_number').eq('id', clientId).maybeSingle()
    const start = prior.scheduled_start ? new Date(prior.scheduled_start as string) : null
    if (start) {
      const message = templateCancellation({
        business_name: biz?.name ?? 'us',
        business_phone: biz?.phone_number ?? '',
        date: start.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' }),
        time: start.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true }),
      })
      await sendSMS({
        to: prior.caller_phone as string,
        message,
        clientId,
        smsType: 'booking_cancellation',
        bookingId: id,
      })
    }
    // Trigger waitlist offer for the now-open slot.
    try {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.talkmate.com.au'
      await fetch(`${appUrl}/api/portal/waitlist/offer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-secret': process.env.INTERNAL_API_SECRET || process.env.VAPI_WEBHOOK_SECRET || '' },
        body: JSON.stringify({ client_id: clientId }),
      })
    } catch (e) { console.error('[bookings/cancel] waitlist offer failed', e) }
  }

  return NextResponse.json({ booking: data })
}
