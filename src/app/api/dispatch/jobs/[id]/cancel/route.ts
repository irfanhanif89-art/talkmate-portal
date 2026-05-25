import { NextResponse } from 'next/server'
import { requireClient } from '@/lib/portal-auth'
import { createAdminClient } from '@/lib/supabase/server'
import { sendAdminTelegram } from '@/lib/notifications'

// PATCH /api/dispatch/jobs/[id]/cancel — owner cancels a job. Refuses
// to cancel a completed/invoiced/paid job.

export async function PATCH(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireClient()
  if ('error' in auth) return auth.error
  const { clientId } = auth
  const { id } = await params

  const admin = createAdminClient()
  const { data: job } = await admin
    .from('dispatch_jobs')
    .select('id, status, job_number, job_type, pickup_address')
    .eq('id', id)
    .eq('client_id', clientId)
    .maybeSingle()
  if (!job) return NextResponse.json({ ok: false, error: 'Job not found' }, { status: 404 })

  if (['completed', 'invoiced', 'paid', 'cancelled'].includes(job.status as string)) {
    return NextResponse.json({ ok: false, error: `Cannot cancel a ${job.status} job` }, { status: 409 })
  }

  const { error } = await admin
    .from('dispatch_jobs')
    .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  void sendAdminTelegram(
    `🚫 Job ${job.job_number ?? id} cancelled (${job.job_type} at ${job.pickup_address})`,
  ).catch(() => {})

  return NextResponse.json({ ok: true })
}
