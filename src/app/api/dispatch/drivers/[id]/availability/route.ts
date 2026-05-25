import { NextResponse } from 'next/server'
import { requireClient } from '@/lib/portal-auth'
import { createAdminClient } from '@/lib/supabase/server'

// PATCH /api/dispatch/drivers/[id]/availability — owner force-toggles
// a driver online/offline. Logs to driver_availability_log with
// changed_by='owner'.

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireClient()
  if ('error' in auth) return auth.error
  const { clientId } = auth
  const { id } = await params

  const body = (await req.json().catch(() => ({}))) as { is_online?: unknown }
  if (typeof body.is_online !== 'boolean') {
    return NextResponse.json({ ok: false, error: 'is_online (boolean) required' }, { status: 400 })
  }
  const target = body.is_online

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('drivers')
    .update({ is_online: target, is_available: target })
    .eq('id', id)
    .eq('client_id', clientId)
    .select('*')
    .maybeSingle()
  if (error || !data) {
    return NextResponse.json({ ok: false, error: error?.message ?? 'Driver not found' }, { status: 404 })
  }

  void admin.from('driver_availability_log').insert({
    driver_id: id,
    client_id: clientId,
    is_online: target,
    changed_by: 'owner',
  }).then(() => {})

  return NextResponse.json({ ok: true, driver: data })
}
