import { NextResponse } from 'next/server'
import { requireClient } from '@/lib/portal-auth'

const VALID_ACTIONS = new Set([
  'transfer_escalation', 'transfer_to_member', 'take_message', 'skip_queue',
])

export async function GET() {
  const auth = await requireClient()
  if ('error' in auth) return auth.error
  const { supabase } = auth

  const { data, error } = await supabase
    .from('vip_callers')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ callers: data ?? [] })
}

export async function POST(request: Request) {
  const auth = await requireClient()
  if ('error' in auth) return auth.error
  const { supabase, clientId } = auth

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const phone = String(body.phone ?? '').trim()
  if (!phone) return NextResponse.json({ error: 'Phone is required.' }, { status: 400 })

  const action = String(body.action ?? 'transfer_escalation').trim()
  if (!VALID_ACTIONS.has(action)) {
    return NextResponse.json({ error: 'Invalid action.' }, { status: 400 })
  }
  if (action === 'transfer_to_member' && !body.transfer_to_member_id) {
    return NextResponse.json({ error: 'transfer_to_member_id is required when action is transfer_to_member.' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('vip_callers')
    .insert({
      client_id: clientId,
      phone,
      name: (body.name as string | undefined)?.trim() || null,
      note: (body.note as string | undefined)?.trim() || null,
      action,
      transfer_to_member_id: action === 'transfer_to_member'
        ? (body.transfer_to_member_id as string)
        : null,
      active: body.active === false ? false : true,
    })
    .select('*')
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'This phone number is already in your VIP list.' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ caller: data })
}
