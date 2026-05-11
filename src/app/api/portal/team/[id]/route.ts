import { NextResponse } from 'next/server'
import { requireClient } from '@/lib/portal-auth'

// PATCH and DELETE for a single team member. RLS already scopes both to
// the caller's client_id, so we only need to filter on the member id.

const ALLOWED_FIELDS = new Set([
  'name', 'role', 'department', 'phone', 'extension',
  'is_escalation_contact', 'active', 'sort_order',
])

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireClient()
  if ('error' in auth) return auth.error
  const { supabase, clientId } = auth

  const { id } = await params
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>

  const update: Record<string, unknown> = {}
  for (const k of Object.keys(body)) {
    if (ALLOWED_FIELDS.has(k)) update[k] = body[k]
  }

  // If we're promoting this row to escalation contact, clear the flag
  // on whoever currently holds it (only one allowed per client_id, per
  // the partial unique index).
  if (update.is_escalation_contact === true) {
    await supabase
      .from('team_members')
      .update({ is_escalation_contact: false })
      .eq('client_id', clientId)
      .eq('is_escalation_contact', true)
      .neq('id', id)
  }

  const { data, error } = await supabase
    .from('team_members')
    .update(update)
    .eq('id', id)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ member: data })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireClient()
  if ('error' in auth) return auth.error
  const { supabase } = auth

  const { id } = await params
  const { error } = await supabase.from('team_members').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
