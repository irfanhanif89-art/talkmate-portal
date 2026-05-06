import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin-auth'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const { id } = await params
  const admin = createAdminClient()
  const { data, error } = await admin.from('client_comms_log')
    .select('id, note, logged_by, created_at')
    .eq('business_id', id)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, entries: data ?? [] })
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const { id } = await params
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const note = String(body.note ?? '').trim()
  if (!note) return NextResponse.json({ ok: false, error: 'note required' }, { status: 400 })

  const admin = createAdminClient()
  const { data, error } = await admin.from('client_comms_log')
    .insert({ business_id: id, note, logged_by: 'admin' })
    .select('id, note, logged_by, created_at').single()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, entry: data })
}
