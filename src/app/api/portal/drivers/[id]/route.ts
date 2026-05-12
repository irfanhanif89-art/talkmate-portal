import { NextResponse } from 'next/server'
import { requireClient } from '@/lib/portal-auth'

const ALLOWED = new Set(['name', 'phone', 'vehicle_id', 'license_class', 'active', 'team_member_id'])

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireClient()
  if ('error' in auth) return auth.error
  const { supabase } = auth
  const { id } = await params
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const update: Record<string, unknown> = {}
  for (const k of Object.keys(body)) if (ALLOWED.has(k)) update[k] = body[k]
  const { data, error } = await supabase.from('drivers').update(update).eq('id', id).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ driver: data })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireClient()
  if ('error' in auth) return auth.error
  const { supabase } = auth
  const { id } = await params
  const { error } = await supabase.from('drivers').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
