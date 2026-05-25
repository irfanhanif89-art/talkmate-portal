import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireDriver } from '@/lib/driver-auth'

// GET /api/driver/me — returns driver profile, business name, and
// today's at-a-glance stats. Used by /driver/dashboard.

export async function GET() {
  const auth = await requireDriver()
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })
  const admin = createAdminClient()

  const { data: business } = await admin
    .from('businesses')
    .select('name, phone, dispatch_response_timeout_mins, customer_sms_on_accept, customer_sms_on_enroute, customer_sms_on_complete')
    .eq('id', auth.driver.client_id)
    .maybeSingle()

  // Today defined as the local Australian day. For stats this is a
  // fine approximation — we use server UTC bounded to ±12h. For exact
  // local-day boundaries the front-end can re-bound by businesses.timezone
  // later.
  const dayStart = new Date()
  dayStart.setHours(0, 0, 0, 0)

  const { data: completedToday } = await admin
    .from('dispatch_jobs')
    .select('id, final_amount, actual_distance_km, completed_at, payment_collected')
    .eq('driver_id', auth.driver.id)
    .eq('status', 'completed')
    .gte('completed_at', dayStart.toISOString())

  const jobsToday = completedToday?.length ?? 0
  const distanceToday = (completedToday ?? []).reduce(
    (sum, j) => sum + Number(j.actual_distance_km ?? 0),
    0,
  )
  const earningsToday = (completedToday ?? [])
    .filter((j) => j.payment_collected)
    .reduce((sum, j) => sum + Number(j.final_amount ?? 0), 0)

  // Hours online today: sum the durations between availability log
  // toggles since dayStart, capped at "now" for any still-open period.
  const { data: log } = await admin
    .from('driver_availability_log')
    .select('is_online, changed_at')
    .eq('driver_id', auth.driver.id)
    .gte('changed_at', dayStart.toISOString())
    .order('changed_at', { ascending: true })

  let hoursOnline = 0
  if (log && log.length) {
    let onSince: number | null = null
    for (const row of log) {
      const t = new Date(row.changed_at).getTime()
      if (row.is_online && onSince == null) onSince = t
      else if (!row.is_online && onSince != null) {
        hoursOnline += (t - onSince) / 1000 / 3600
        onSince = null
      }
    }
    if (onSince != null) hoursOnline += (Date.now() - onSince) / 1000 / 3600
  } else if (auth.driver.is_online) {
    // No toggles today but currently online — assume started at dayStart.
    hoursOnline = (Date.now() - dayStart.getTime()) / 1000 / 3600
  }

  return NextResponse.json({
    ok: true,
    driver: auth.driver,
    business: {
      name: business?.name ?? '',
      phone: business?.phone ?? null,
    },
    stats: {
      jobs_today: jobsToday,
      hours_online: Math.round(hoursOnline * 10) / 10,
      distance_today_km: Math.round(distanceToday * 10) / 10,
      earnings_today: Math.round(earningsToday * 100) / 100,
    },
  })
}

// PATCH /api/driver/me — edit-yourself fields plus the one-time
// location-consent flag. Email is never editable here (it's the auth
// identity); business assignment is owner-only.

const EDITABLE = ['name', 'phone', 'truck_type', 'truck_rego'] as const
type EditableField = (typeof EDITABLE)[number]

export async function PATCH(req: Request) {
  const auth = await requireDriver()
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const update: Record<string, string | null> = {}
  for (const key of EDITABLE) {
    if (key in body) {
      const v = body[key]
      if (v === null) update[key] = null
      else if (typeof v === 'string') update[key] = v.trim()
    }
  }
  if ('location_consent' in body && body.location_consent === true) {
    update['location_consent_at'] = new Date().toISOString()
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ ok: false, error: 'No fields to update' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: updated, error } = await admin
    .from('drivers')
    .update(update)
    .eq('id', auth.driver.id)
    .select('id, user_id, client_id, name, phone, email, truck_type, truck_rego, licence_number, is_available, is_online, is_active, notes, avatar_url, location_consent_at')
    .maybeSingle()

  if (error || !updated) {
    return NextResponse.json({ ok: false, error: error?.message ?? 'Update failed' }, { status: 500 })
  }
  return NextResponse.json({ ok: true, driver: updated })
}
