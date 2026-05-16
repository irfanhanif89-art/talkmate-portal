import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin-auth'
import { logAdminAction } from '@/lib/audit'

const ALLOWED_FIELDS = new Set([
  'phone', 'name', 'note', 'action', 'transfer_to_member_id', 'active',
])

const VALID_ACTIONS = new Set([
  'transfer_escalation', 'transfer_to_member', 'take_message', 'skip_queue',
])

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; callerId: string }> },
) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const { id, callerId } = await params
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>

  const update: Record<string, unknown> = {}
  for (const k of Object.keys(body)) if (ALLOWED_FIELDS.has(k)) update[k] = body[k]

  if (typeof update.action === 'string' && !VALID_ACTIONS.has(update.action)) {
    return NextResponse.json({ ok: false, error: 'invalid action' }, { status: 400 })
  }
  if (update.action && update.action !== 'transfer_to_member') {
    update.transfer_to_member_id = null
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('vip_callers')
    .update(update)
    .eq('id', callerId)
    .eq('client_id', id)
    .select('*')
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  await logAdminAction({
    adminEmail: auth.user.email ?? 'unknown',
    action: 'vip_caller_updated',
    businessId: id,
    after: { caller_id: callerId, ...update },
    request,
  })

  return NextResponse.json({ ok: true, caller: data })
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; callerId: string }> },
) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const { id, callerId } = await params
  const admin = createAdminClient()

  const { data: before } = await admin
    .from('vip_callers')
    .select('phone, name')
    .eq('id', callerId)
    .eq('client_id', id)
    .maybeSingle()

  const { error } = await admin
    .from('vip_callers')
    .delete()
    .eq('id', callerId)
    .eq('client_id', id)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  await logAdminAction({
    adminEmail: auth.user.email ?? 'unknown',
    action: 'vip_caller_removed',
    businessId: id,
    before: { caller_id: callerId, ...(before ?? {}) },
    request,
  })

  return NextResponse.json({ ok: true })
}
