import { NextResponse } from 'next/server'
import { requireClient } from '@/lib/portal-auth'
import { createAdminClient } from '@/lib/supabase/server'
import { dispatchJobToDriver } from '@/lib/dispatch-runtime'

// PATCH /api/dispatch/jobs/[id]/assign — owner manually assigns or
// reassigns a job to a driver. Body: { driver_id }
//
// If the job is currently 'driver_notified' (offered to a different
// driver) we first reset it to 'created' so dispatchJobToDriver can
// re-offer cleanly.

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireClient()
  if ('error' in auth) return auth.error
  const { clientId } = auth
  const { id } = await params

  const body = (await req.json().catch(() => ({}))) as { driver_id?: unknown }
  const driverId = typeof body.driver_id === 'string' ? body.driver_id : ''
  if (!driverId) {
    return NextResponse.json({ ok: false, error: 'driver_id is required' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Verify the job belongs to this business.
  const { data: job } = await admin
    .from('dispatch_jobs')
    .select('id, status')
    .eq('id', id)
    .eq('client_id', clientId)
    .maybeSingle()
  if (!job) return NextResponse.json({ ok: false, error: 'Job not found' }, { status: 404 })

  // Reset to 'created' so the runtime helper can offer cleanly.
  if (job.status !== 'created') {
    await admin
      .from('dispatch_jobs')
      .update({
        status: 'created',
        driver_id: null,
        notified_at: null,
        response_deadline: null,
      })
      .eq('id', id)
  }

  const result = await dispatchJobToDriver({
    jobId: id,
    clientId,
    preferredDriverId: driverId,
    autoDispatch: false,
  })

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.reason ?? 'Assign failed' }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
