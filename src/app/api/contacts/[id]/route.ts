import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// PATCH/DELETE for individual contacts. RLS scopes everything to the user's
// own business via get_current_client_id() — no need to re-check ownership.

const ALLOWED_PATCH_FIELDS = new Set(['name', 'email', 'notes', 'tags'])

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })

  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const [k, v] of Object.entries(body)) {
    if (ALLOWED_PATCH_FIELDS.has(k)) update[k] = v
  }
  if (Object.keys(update).length === 1) {
    return NextResponse.json({ ok: false, error: 'No valid fields' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('contacts').update(update).eq('id', id).select('*').single()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, contact: data })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })

  const { error } = await supabase.from('contacts').delete().eq('id', id)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
