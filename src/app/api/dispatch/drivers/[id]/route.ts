import { NextResponse } from 'next/server'
import { requireClient } from '@/lib/portal-auth'
import { createAdminClient } from '@/lib/supabase/server'

// PATCH /api/dispatch/drivers/[id]  — edit driver (name, phone,
// truck_type, truck_rego, notes). NOT user_id, NOT email (auth keys).
// DELETE /api/dispatch/drivers/[id] — soft-deactivate (is_active=false).

const EDITABLE = ['name', 'phone', 'truck_type', 'truck_rego', 'notes'] as const

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireClient()
  if ('error' in auth) return auth.error
  const { clientId } = auth
  const { id } = await params

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const update: Record<string, string | null> = {}
  for (const k of EDITABLE) {
    if (k in body) {
      const v = body[k]
      if (v === null || v === '') update[k] = null
      else if (typeof v === 'string') update[k] = v.trim()
    }
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ ok: false, error: 'No editable fields supplied' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('drivers')
    .update(update)
    .eq('id', id)
    .eq('client_id', clientId)
    .select('*')
    .maybeSingle()
  if (error || !data) {
    return NextResponse.json({ ok: false, error: error?.message ?? 'Driver not found' }, { status: 404 })
  }
  return NextResponse.json({ ok: true, driver: data })
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireClient()
  if ('error' in auth) return auth.error
  const { clientId } = auth
  const { id } = await params

  const admin = createAdminClient()
  const { error } = await admin
    .from('drivers')
    .update({ is_active: false, is_online: false, is_available: false })
    .eq('id', id)
    .eq('client_id', clientId)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
