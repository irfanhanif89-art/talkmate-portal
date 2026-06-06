import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireDriver } from '@/lib/driver-auth'

// PATCH /api/driver/location — server-side fallback for the location
// broadcast. The primary path is the supabase client write in
// useDriverLocationBroadcast (lower latency, no Vercel function hit).
// This route exists for environments where the client cannot write
// directly (e.g. CSP restrictions, embedded WebViews).

export async function PATCH(req: Request) {
  const auth = await requireDriver()
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const body = (await req.json().catch(() => ({}))) as {
    lat?: unknown
    lng?: unknown
    heading?: unknown
    speed_kmh?: unknown
    accuracy_m?: unknown
    active_job_id?: unknown
  }

  const lat = typeof body.lat === 'number' ? body.lat : NaN
  const lng = typeof body.lng === 'number' ? body.lng : NaN
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ ok: false, error: 'lat and lng (numbers) required' }, { status: 400 })
  }

  const admin = createAdminClient()
  await admin.from('driver_locations').upsert({
    driver_id: auth.driver.id,
    client_id: auth.driver.client_id,
    lat,
    lng,
    heading: typeof body.heading === 'number' ? body.heading : null,
    speed_kmh: typeof body.speed_kmh === 'number' ? body.speed_kmh : null,
    accuracy_m: typeof body.accuracy_m === 'number' ? Math.round(body.accuracy_m) : null,
    updated_at: new Date().toISOString(),
  })

  if (typeof body.active_job_id === 'string' && body.active_job_id) {
    // Only record history against a job that belongs to this driver, so a
    // driver cannot attach their GPS trace to another driver's job id.
    const { data: ownJob } = await admin
      .from('dispatch_jobs')
      .select('id')
      .eq('id', body.active_job_id)
      .eq('driver_id', auth.driver.id)
      .maybeSingle()
    if (ownJob) {
      await admin.from('driver_location_history').insert({
        driver_id: auth.driver.id,
        client_id: auth.driver.client_id,
        dispatch_job_id: body.active_job_id,
        lat,
        lng,
      })
    }
  }

  return NextResponse.json({ ok: true })
}
