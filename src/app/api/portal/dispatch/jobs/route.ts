import { NextResponse } from 'next/server'
import { requireClient } from '@/lib/portal-auth'

const VALID_STATUS = new Set(['pending', 'assigned', 'in_progress', 'complete', 'cancelled', 'declined'])

export async function GET(request: Request) {
  const auth = await requireClient()
  if ('error' in auth) return auth.error
  const { supabase } = auth

  const { searchParams } = new URL(request.url)
  const statusFilter = searchParams.get('status')
  const fromDate = searchParams.get('from')

  let q = supabase
    .from('dispatch_jobs')
    .select('*')
    .order('created_at', { ascending: false })

  if (statusFilter && VALID_STATUS.has(statusFilter)) q = q.eq('status', statusFilter)
  if (fromDate) q = q.gte('created_at', fromDate)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ jobs: data ?? [] })
}

export async function POST(request: Request) {
  const auth = await requireClient()
  if ('error' in auth) return auth.error
  const { supabase, clientId } = auth

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const callerPhone = String(body.caller_phone ?? '').trim()
  const jobType = String(body.job_type ?? '').trim()
  if (!callerPhone || !jobType) {
    return NextResponse.json({ error: 'caller_phone and job_type are required' }, { status: 400 })
  }

  // Job number: count existing rows for this client + 1, padded.
  // (For the agent's create_dispatch_job path we use a global sequence
  // in /api/vapi/functions; for manual creation a per-client counter
  // is fine and avoids burning sequence values on UI clicks.)
  const { count } = await supabase
    .from('dispatch_jobs')
    .select('id', { count: 'exact', head: true })
  const jobNumber = `JOB-${String((count ?? 0) + 1).padStart(4, '0')}`

  const { data, error } = await supabase
    .from('dispatch_jobs')
    .insert({
      client_id: clientId,
      job_number: jobNumber,
      job_type: jobType,
      timing: (body.timing as string | undefined) ?? 'now',
      scheduled_at: (body.scheduled_at as string | undefined) || null,
      caller_name: (body.caller_name as string | undefined)?.trim() || null,
      caller_phone: callerPhone,
      pickup_address: (body.pickup_address as string | undefined)?.trim() || null,
      dropoff_address: (body.dropoff_address as string | undefined)?.trim() || null,
      vehicle_description: (body.vehicle_description as string | undefined)?.trim() || null,
      notes: (body.notes as string | undefined)?.trim() || null,
      status: 'pending',
    })
    .select('*')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ job: data })
}
