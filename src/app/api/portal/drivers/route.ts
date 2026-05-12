import { NextResponse } from 'next/server'
import { requireDispatchAccess } from '@/lib/portal-auth'

// GET — list drivers with the latest availability override per driver.
// POST — create a new driver.

export async function GET() {
  const auth = await requireDispatchAccess()
  if ('error' in auth) return auth.error
  const { supabase } = auth

  const { data: drivers, error } = await supabase
    .from('drivers')
    .select('id, name, phone, vehicle_id, license_class, active, created_at, vehicles(id, name, type, capabilities)')
    .order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Pull the most recent availability row per driver in one query and
  // collapse it client-side.
  const { data: availability } = await supabase
    .from('driver_availability')
    .select('driver_id, status, override_start, override_end, note, updated_at')
    .order('updated_at', { ascending: false })

  const latestByDriver = new Map<string, Record<string, unknown>>()
  for (const a of availability ?? []) {
    if (!latestByDriver.has(a.driver_id as string)) latestByDriver.set(a.driver_id as string, a)
  }

  const enriched = (drivers ?? []).map(d => ({
    ...d,
    availability: latestByDriver.get(d.id as string) ?? null,
  }))

  return NextResponse.json({ drivers: enriched })
}

export async function POST(request: Request) {
  const auth = await requireDispatchAccess()
  if ('error' in auth) return auth.error
  const { supabase, clientId } = auth
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const name = String(body.name ?? '').trim()
  const phone = String(body.phone ?? '').trim()
  if (!name || !phone) return NextResponse.json({ error: 'name and phone are required' }, { status: 400 })

  const { data, error } = await supabase
    .from('drivers')
    .insert({
      client_id: clientId,
      name, phone,
      vehicle_id: (body.vehicle_id as string | undefined) || null,
      team_member_id: (body.team_member_id as string | undefined) || null,
      license_class: (body.license_class as string | undefined)?.trim() || null,
      active: body.active === false ? false : true,
    })
    .select('*')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ driver: data })
}
