import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin-auth'

const VALID_ACTIONS = new Set([
  'transfer_escalation', 'transfer_to_member', 'take_message', 'skip_queue',
])

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const { id } = await params
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('vip_callers')
    .select('*')
    .eq('client_id', id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, callers: data ?? [] })
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const { id } = await params
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const phone = String(body.phone ?? '').trim()
  if (!phone) return NextResponse.json({ ok: false, error: 'phone required' }, { status: 400 })

  const action = String(body.action ?? 'transfer_escalation').trim()
  if (!VALID_ACTIONS.has(action)) {
    return NextResponse.json({ ok: false, error: 'invalid action' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('vip_callers')
    .insert({
      client_id: id,
      phone,
      name: (body.name as string | undefined)?.trim() || null,
      note: (body.note as string | undefined)?.trim() || null,
      action,
      transfer_to_member_id: action === 'transfer_to_member' ? (body.transfer_to_member_id as string) : null,
      active: body.active === false ? false : true,
    })
    .select('*')
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ ok: false, error: 'Phone already in VIP list.' }, { status: 409 })
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, caller: data })
}
