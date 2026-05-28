import { NextResponse } from 'next/server'
import { requireClient } from '@/lib/portal-auth'
import { wallClockToIso } from '@/lib/scheduler-time'

// =====================================================================
// PATCH /api/portal/bookings/[id]/reschedule
//
// Body:
//   { date: 'YYYY-MM-DD',
//     time: 'HH:MM',
//     duration_mins?: number,
//     force?: boolean }
//
// Server validates the new slot. If another booking on the same driver
// overlaps, returns 409 with conflicts[]. Pass force=true to override
// (the UI shows a confirm dialog).
//
// Date+time arrive in the client's timezone; we compose
// scheduled_start using the scheduler_settings.timezone (default
// Australia/Melbourne) so DST is handled correctly.
//
// Brief alignment: brief §API CONTRACTS PATCH /reschedule. See
// DECISIONS-scheduler.md §D4 for the date+time → scheduled_start
// mapping rationale.
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
  const date = typeof body.date === 'string' ? body.date : null
  const time = typeof body.time === 'string' ? body.time : null
  const durationMinsRaw =
    typeof body.duration_mins === 'number' ? Math.round(body.duration_mins) : null
  const force = body.force === true

  if (!date || !time) {
    return NextResponse.json(
      { ok: false, error: 'date and time required' },
      { status: 400 },
    )
  }

  // Pull the booking + the client's timezone in parallel.
  const [bookingResult, settingsResult] = await Promise.all([
    supabase
      .from('bookings')
      .select(
        'id, client_id, driver_id, scheduled_start, scheduled_end, duration_minutes',
      )
      .eq('id', id)
      .eq('client_id', clientId)
      .maybeSingle(),
    supabase
      .from('scheduler_settings')
      .select('timezone')
      .eq('client_id', clientId)
      .maybeSingle(),
  ])

  if (bookingResult.error) {
    return NextResponse.json(
      { ok: false, error: bookingResult.error.message },
      { status: 500 },
    )
  }
  const booking = bookingResult.data
  if (!booking) {
    return NextResponse.json(
      { ok: false, error: 'booking not found' },
      { status: 404 },
    )
  }

  const timezone =
    (settingsResult.data?.timezone as string | null) ?? 'Australia/Melbourne'
  const newStartIso = wallClockToIso(date, time, timezone)
  if (!newStartIso) {
    return NextResponse.json(
      { ok: false, error: 'invalid date or time' },
      { status: 400 },
    )
  }
  const durationMins =
    durationMinsRaw ?? (booking.duration_minutes as number | null) ?? 60
  if (durationMins < 5 || durationMins > 24 * 60) {
    return NextResponse.json(
      { ok: false, error: 'duration_mins out of range' },
      { status: 400 },
    )
  }
  const newEndIso = new Date(
    new Date(newStartIso).getTime() + durationMins * 60 * 1000,
  ).toISOString()

  // Conflict detection: any other booking on the SAME driver whose
  // window overlaps [newStartIso, newEndIso). Only checks when the
  // booking has a driver assigned — unassigned bookings can be moved
  // freely (conflict surfaces on assignment instead).
  if (booking.driver_id && !force) {
    const { data: conflicts } = await supabase
      .from('bookings')
      .select(
        'id, caller_name, scheduled_start, scheduled_end, duration_minutes',
      )
      .eq('client_id', clientId)
      .eq('driver_id', booking.driver_id)
      .neq('id', id)
      .not('status', 'in', '(cancelled,no_show,declined)')
      .lt('scheduled_start', newEndIso)
      .gte('scheduled_end', newStartIso)
      .limit(5)
    if ((conflicts ?? []).length > 0) {
      return NextResponse.json(
        {
          ok: false,
          error: 'conflict',
          conflicts: conflicts ?? [],
        },
        { status: 409 },
      )
    }
  }

  const { data, error } = await supabase
    .from('bookings')
    .update({
      scheduled_start: newStartIso,
      scheduled_end: newEndIso,
      duration_minutes: durationMins,
    })
    .eq('id', id)
    .eq('client_id', clientId)
    .select('*')
    .single()
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, booking: data })
}
