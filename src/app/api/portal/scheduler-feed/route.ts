import { NextResponse } from 'next/server'
import { requireClient } from '@/lib/portal-auth'

// =====================================================================
// GET /api/portal/scheduler-feed?from=ISO&to=ISO
//
// Single-round-trip aggregate for the Bizzow-style scheduler grid.
// Returns:
//   - bookings[] in the window (joined with driver name/initials)
//   - drivers[] active for this client
//   - all_day_events[] (public holidays for the client's state +
//     any custom closures we surface later)
//   - settings (the scheduler_settings row, lazy-defaults if missing)
//
// Auth: requireClient — client_id resolved from session.
// Errors: 401 if no auth, 400 if invalid date range, 500 on DB error.
//
// Brief alignment: this is the /api/scheduler/bookings response shape
// from the brief, served from the portal namespace per DECISIONS-
// scheduler.md §D5.
// =====================================================================

interface DriverRow {
  id: string
  name: string | null
  phone: string | null
  active: boolean | null
}

function initialsFromName(name: string | null): string {
  if (!name) return '??'
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '??'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export async function GET(request: Request) {
  const auth = await requireClient()
  if ('error' in auth) return auth.error
  const { supabase, clientId } = auth

  const { searchParams } = new URL(request.url)
  const fromIso = searchParams.get('from')
  const toIso = searchParams.get('to')
  if (!fromIso || !toIso) {
    return NextResponse.json(
      { error: 'from and to are required ISO date-times' },
      { status: 400 },
    )
  }
  const fromDate = new Date(fromIso)
  const toDate = new Date(toIso)
  if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
    return NextResponse.json({ error: 'invalid date format' }, { status: 400 })
  }
  if (fromDate >= toDate) {
    return NextResponse.json({ error: 'from must be before to' }, { status: 400 })
  }
  // Cap the window to 90 days so a malformed request can't pull the
  // entire bookings table.
  const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000
  if (toDate.getTime() - fromDate.getTime() > ninetyDaysMs) {
    return NextResponse.json(
      { error: 'window exceeds 90 days' },
      { status: 400 },
    )
  }

  // Run the four queries in parallel.
  const [bookingsResult, driversResult, settingsResult] = await Promise.all([
    supabase
      .from('bookings')
      .select(
        // Only the columns the grid actually renders. Avoids depending
        // on migration-044 SMS-loop columns (confirmation_ref,
        // dispatcher_notified_at, reminder_sent_at, confirmed_by_phone)
        // which aren't present on every env. Driver name is resolved
        // client-side from the drivers list returned alongside.
        `id, client_id, caller_name, caller_phone, description,
         pickup_address, pickup_lat, pickup_lng,
         pickup_contact_name, pickup_contact_phone,
         dropoff_address, dropoff_lat, dropoff_lng,
         dropoff_contact_name, dropoff_contact_phone,
         truck_type, rate_type, driver_id, booking_source,
         estimated_value, scheduled_start, scheduled_end,
         actual_start, actual_end, duration_minutes,
         status, payment_method, color_hex,
         notes, created_at, confirmed_at`,
      )
      .eq('client_id', clientId)
      .gte('scheduled_start', fromDate.toISOString())
      .lt('scheduled_start', toDate.toISOString())
      .order('scheduled_start', { ascending: true, nullsFirst: false }),
    supabase
      .from('drivers')
      .select('id, name, phone, active')
      .eq('client_id', clientId)
      .eq('active', true)
      .order('name', { ascending: true }),
    supabase
      .from('scheduler_settings')
      .select('*')
      .eq('client_id', clientId)
      .maybeSingle(),
  ])

  if (bookingsResult.error) {
    return NextResponse.json(
      { error: bookingsResult.error.message },
      { status: 500 },
    )
  }
  if (driversResult.error) {
    return NextResponse.json(
      { error: driversResult.error.message },
      { status: 500 },
    )
  }
  if (settingsResult.error) {
    return NextResponse.json(
      { error: settingsResult.error.message },
      { status: 500 },
    )
  }

  const drivers: DriverRow[] = (driversResult.data ?? []) as DriverRow[]
  const driversShaped = drivers.map((d) => ({
    id: d.id,
    name: d.name ?? 'Driver',
    phone: d.phone ?? null,
    initials: initialsFromName(d.name),
    // status is computed at render time from on-shift / current job. The
    // mobile DispatchScreen has the same approach — keep it simple here.
    status: 'available' as const,
  }))

  // Public holidays for the client's state, filtered to the window.
  const state =
    ((settingsResult.data?.state as string | null | undefined) ?? 'VIC').toUpperCase()
  const fromDateOnly = fromDate.toISOString().slice(0, 10)
  const toDateOnly = toDate.toISOString().slice(0, 10)
  const { data: holidays } = await supabase
    .from('public_holidays')
    .select('holiday_name, holiday_date, is_national')
    .eq('state', state)
    .gte('holiday_date', fromDateOnly)
    .lt('holiday_date', toDateOnly)
    .order('holiday_date', { ascending: true })

  const allDayEvents = (holidays ?? []).map(
    (h: { holiday_name: string | null; holiday_date: string }) => ({
      date: h.holiday_date,
      label: h.holiday_name ?? 'Public holiday',
      type: 'holiday' as const,
    }),
  )

  return NextResponse.json({
    bookings: bookingsResult.data ?? [],
    drivers: driversShaped,
    all_day_events: allDayEvents,
    settings: settingsResult.data ?? null,
  })
}
