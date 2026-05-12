import { NextResponse } from 'next/server'
import { requireDispatchAccess } from '@/lib/portal-auth'

const ALLOWED = new Set([
  'status', 'caller_name', 'caller_phone', 'job_type', 'timing',
  'scheduled_at', 'pickup_address', 'dropoff_address',
  'vehicle_description', 'notes',
  'assigned_driver_id', 'assigned_vehicle_id',
])

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireDispatchAccess()
  if ('error' in auth) return auth.error
  const { supabase } = auth
  const { id } = await params

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const update: Record<string, unknown> = {}
  for (const k of Object.keys(body)) if (ALLOWED.has(k)) update[k] = body[k]

  // Status-driven timestamps
  if (update.status === 'assigned' && !update.assigned_at) update.assigned_at = new Date().toISOString()
  if (update.status === 'complete' && !update.completed_at) update.completed_at = new Date().toISOString()

  const { data, error } = await supabase
    .from('dispatch_jobs')
    .update(update)
    .eq('id', id)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ job: data })
}
