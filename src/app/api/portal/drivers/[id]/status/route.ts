import { NextResponse } from 'next/server'
import { requireDispatchAccess } from '@/lib/portal-auth'

// Insert a new availability override for the driver. The most recent
// row (by updated_at) wins when other systems read availability.

const VALID_STATUS = new Set(['available', 'on_job', 'unavailable', 'off_shift'])

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireDispatchAccess()
  if ('error' in auth) return auth.error
  const { supabase, clientId } = auth
  const { id } = await params

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const status = String(body.status ?? '').trim()
  if (!VALID_STATUS.has(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('driver_availability')
    .insert({
      client_id: clientId,
      driver_id: id,
      status,
      job_id: (body.job_id as string | undefined) || null,
      override_start: (body.override_start as string | undefined) || null,
      override_end: (body.override_end as string | undefined) || null,
      note: (body.note as string | undefined)?.trim() || null,
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ availability: data })
}
