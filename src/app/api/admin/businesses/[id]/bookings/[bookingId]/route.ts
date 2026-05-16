import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin-auth'

const ALLOWED_FIELDS = new Set([
  'status', 'caller_name', 'caller_phone', 'booking_type',
  'service_requested', 'preferred_date', 'preferred_time', 'notes',
  'description', 'pickup_address', 'pickup_contact_name', 'pickup_contact_phone',
  'dropoff_address', 'dropoff_contact_name', 'dropoff_contact_phone',
  'truck_type', 'rate_type', 'driver_id', 'estimated_value',
  'scheduled_start', 'scheduled_end', 'actual_start', 'actual_end',
  'no_show', 'cancellation_reason',
])

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; bookingId: string }> },
) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const { id, bookingId } = await params
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const update: Record<string, unknown> = {}
  for (const k of Object.keys(body)) if (ALLOWED_FIELDS.has(k)) update[k] = body[k]
  if (update.status === 'confirmed' && !update.confirmed_at) {
    update.confirmed_at = new Date().toISOString()
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('bookings')
    .update(update)
    .eq('id', bookingId)
    .eq('client_id', id)
    .select('*')
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, booking: data })
}
