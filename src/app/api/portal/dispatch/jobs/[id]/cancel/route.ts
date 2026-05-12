import { NextResponse } from 'next/server'
import { requireDispatchAccess } from '@/lib/portal-auth'

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireDispatchAccess()
  if ('error' in auth) return auth.error
  const { supabase, clientId } = auth
  const { id } = await params

  const { data: job, error } = await supabase
    .from('dispatch_jobs')
    .update({ status: 'cancelled' })
    .eq('id', id)
    .select('id, assigned_driver_id')
    .single()
  if (error || !job) return NextResponse.json({ error: error?.message ?? 'Job not found' }, { status: 500 })

  if (job.assigned_driver_id) {
    await supabase.from('driver_availability').insert({
      client_id: clientId,
      driver_id: job.assigned_driver_id,
      status: 'available',
    })
  }
  return NextResponse.json({ ok: true })
}
