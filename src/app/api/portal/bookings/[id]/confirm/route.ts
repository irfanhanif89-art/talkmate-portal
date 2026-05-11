import { NextResponse } from 'next/server'
import { requireClient } from '@/lib/portal-auth'
import { createAdminClient } from '@/lib/supabase/server'

// POST /api/portal/bookings/[id]/confirm
// Flips the booking to 'confirmed', stamps confirmed_at, and fires
// MAKE_BOOKING_WEBHOOK so Donna's Make.com scenario can send the
// confirmation SMS via Twilio. The webhook is best-effort.

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
      confirmation_sms_sent: true,
    })
    .eq('id', id)
    .select('*')
    .single()

  if (error || !booking) {
    return NextResponse.json({ error: error?.message ?? 'Booking not found' }, { status: 404 })
  }

  // Look up the business name (for the SMS template) via the admin
  // client — RLS doesn't matter, we're just enriching the webhook.
  const admin = createAdminClient()
  const { data: biz } = await admin
    .from('businesses')
    .select('name, phone_number')
    .eq('id', clientId)
    .single()

  if (process.env.MAKE_BOOKING_WEBHOOK) {
    try {
      await fetch(process.env.MAKE_BOOKING_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trigger: 'booking_confirmed',
          timestamp: new Date().toISOString(),
          business: {
            id: clientId,
            business_name: biz?.name ?? '',
            phone: biz?.phone_number ?? '',
          },
          booking,
        }),
      })
    } catch (e) {
      console.error('[bookings/confirm] webhook failed', e)
    }
  }

  return NextResponse.json({ booking, webhook: process.env.MAKE_BOOKING_WEBHOOK ? 'fired' : 'skipped_no_url' })
}
