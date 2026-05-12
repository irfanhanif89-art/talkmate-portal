import { NextResponse } from 'next/server'
import { requireClient } from '@/lib/portal-auth'

// Assign a driver (and their vehicle) to an existing job. Also flips
// the driver's availability row to on_job so subsequent dispatch
// checks won't double-book them.

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireClient()
  if ('error' in auth) return auth.error
  const { supabase, clientId } = auth
  const { id } = await params

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const driverId = (body.driver_id as string | undefined)?.trim()
  if (!driverId) return NextResponse.json({ error: 'driver_id required' }, { status: 400 })

  const { data: driver, error: drvErr } = await supabase
    .from('drivers')
    .select('id, vehicle_id')
    .eq('id', driverId)
    .single()
  if (drvErr || !driver) return NextResponse.json({ error: 'Driver not found' }, { status: 404 })

  const { data: job, error } = await supabase
    .from('dispatch_jobs')
    .update({
      status: 'assigned',
      assigned_driver_id: driverId,
      assigned_vehicle_id: driver.vehicle_id ?? null,
      assigned_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('*')
    .single()
  if (error || !job) return NextResponse.json({ error: error?.message ?? 'Job not found' }, { status: 500 })

  // Flip driver to on_job (insert latest-wins availability row).
  await supabase.from('driver_availability').insert({
    client_id: clientId,
    driver_id: driverId,
    status: 'on_job',
    job_id: job.id,
  })

  return NextResponse.json({ job })
}
