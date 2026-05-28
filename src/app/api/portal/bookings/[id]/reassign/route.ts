import { NextResponse } from 'next/server'
import { requireClient } from '@/lib/portal-auth'

// =====================================================================
// PATCH /api/portal/bookings/[id]/reassign
//
// Body:
//   { driver_id: string | null,  // null = unassign
//     force?: boolean }
//
// Validates that the driver belongs to the same client (RLS would
// catch this too but we surface a friendly error). Returns 409 with
// conflicts[] if the new driver has another booking overlapping
// this booking's window. Pass force=true to override.
//
// Brief alignment: brief §API CONTRACTS PATCH /reassign. See
// DECISIONS-scheduler.md §D5.
// =====================================================================

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireClient()
  if ('error' in auth) return auth.error
  const { supabase, clientId } = auth
  const { id } = await params

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const force = body.force === true
  const driverIdRaw = body.driver_id
  // Accept string | null. Anything else is an error.
  if (driverIdRaw !== null && typeof driverIdRaw !== 'string') {
    return NextResponse.json(
      { ok: false, error: 'driver_id must be a string or null' },
      { status: 400 },
    )
  }
  const driverId = driverIdRaw === '' ? null : (driverIdRaw as string | null)

  const { data: booking, error: bookingErr } = await supabase
    .from('bookings')
    .select('id, client_id, driver_id, scheduled_start, scheduled_end, status')
    .eq('id', id)
    .eq('client_id', clientId)
    .maybeSingle()
  if (bookingErr) {
    return NextResponse.json(
      { ok: false, error: bookingErr.message },
      { status: 500 },
    )
  }
  if (!booking) {
    return NextResponse.json(
      { ok: false, error: 'booking not found' },
      { status: 404 },
    )
  }

  if (driverId) {
    // Verify the driver belongs to this client (defence in depth alongside RLS).
    const { data: driver } = await supabase
      .from('drivers')
      .select('id, active')
      .eq('id', driverId)
      .eq('client_id', clientId)
      .maybeSingle()
    if (!driver) {
      return NextResponse.json(
        { ok: false, error: 'driver not found' },
        { status: 404 },
      )
    }
    if (!driver.active) {
      return NextResponse.json(
        { ok: false, error: 'driver is inactive' },
        { status: 400 },
      )
    }

    // Conflict detection: does the new driver already have a booking
    // overlapping this booking's [start, end) window? Skip if the
    // booking has no scheduled time yet, or if force=true.
    if (booking.scheduled_start && booking.scheduled_end && !force) {
      const { data: conflicts } = await supabase
        .from('bookings')
        .select(
          'id, caller_name, scheduled_start, scheduled_end, duration_minutes',
        )
        .eq('client_id', clientId)
        .eq('driver_id', driverId)
        .neq('id', id)
        .not('status', 'in', '(cancelled,no_show,declined)')
        .lt('scheduled_start', booking.scheduled_end as string)
        .gte('scheduled_end', booking.scheduled_start as string)
        .limit(5)
      if ((conflicts ?? []).length > 0) {
        return NextResponse.json(
          { ok: false, error: 'conflict', conflicts: conflicts ?? [] },
          { status: 409 },
        )
      }
    }
  }

  // Move pending → confirmed when assigning a driver to a previously
  // unassigned booking. (Matches the brief's "If a driver is selected,
  // status = confirmed" semantic.)
  const update: Record<string, unknown> = { driver_id: driverId }
  if (
    driverId &&
    booking.driver_id === null &&
    booking.status === 'pending'
  ) {
    update.status = 'confirmed'
    update.confirmed_at = new Date().toISOString()
  }

  const { data, error } = await supabase
    .from('bookings')
    .update(update)
    .eq('id', id)
    .eq('client_id', clientId)
    .select('*')
    .single()
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, booking: data })
}
