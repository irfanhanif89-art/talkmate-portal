import { NextResponse } from 'next/server'
import { requireClient } from '@/lib/portal-auth'

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireClient()
  if ('error' in auth) return auth.error
  const { supabase, clientId } = auth
  const { id } = await params

  const { data: job, error } = await supabase
    .from('dispatch_jobs')
    .update({
      status: 'complete',
      completed_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('id, assigned_driver_id')
    .single()
  if (error || !job) return NextResponse.json({ error: error?.message ?? 'Job not found' }, { status: 500 })

  // Free the driver back up.
  if (job.assigned_driver_id) {
    await supabase.from('driver_availability').insert({
      client_id: clientId,
      driver_id: job.assigned_driver_id,
      status: 'available',
    })
  }

  return NextResponse.json({ ok: true })
}
