import { NextResponse } from 'next/server'
import { requireClient } from '@/lib/portal-auth'

const ALLOWED_FIELDS = new Set([
  'phone', 'name', 'note', 'action', 'transfer_to_member_id', 'active',
])

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireClient()
  if ('error' in auth) return auth.error
  const { supabase } = auth

  const { id } = await params
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const update: Record<string, unknown> = {}
  for (const k of Object.keys(body)) {
    if (ALLOWED_FIELDS.has(k)) update[k] = body[k]
  }

  const { data, error } = await supabase
    .from('vip_callers')
    .update(update)
    .eq('id', id)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ caller: data })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireClient()
  if ('error' in auth) return auth.error
  const { supabase } = auth

  const { id } = await params
  const { error } = await supabase.from('vip_callers').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
