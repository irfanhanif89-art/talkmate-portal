import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin-auth'

const ALLOWED_FIELDS = new Set([
  'name', 'role', 'department', 'phone', 'extension',
  'is_escalation_contact', 'active', 'sort_order',
])

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; memberId: string }> },
) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const { id, memberId } = await params
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const update: Record<string, unknown> = {}
  for (const k of Object.keys(body)) if (ALLOWED_FIELDS.has(k)) update[k] = body[k]

  const admin = createAdminClient()
  if (update.is_escalation_contact === true) {
    await admin.from('team_members')
      .update({ is_escalation_contact: false })
      .eq('client_id', id).eq('is_escalation_contact', true).neq('id', memberId)
  }

  const { data, error } = await admin
    .from('team_members')
    .update(update)
    .eq('id', memberId)
    .eq('client_id', id)
    .select('*')
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, member: data })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; memberId: string }> },
) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const { id, memberId } = await params
  const admin = createAdminClient()
  const { error } = await admin
    .from('team_members')
    .delete()
    .eq('id', memberId)
    .eq('client_id', id)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
