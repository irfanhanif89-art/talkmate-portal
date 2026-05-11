import { NextResponse } from 'next/server'
import { requireClient } from '@/lib/portal-auth'

// GET /api/portal/team — list this business's team members.
// POST /api/portal/team — create a new team member.
//
// RLS scopes both to the caller's client_id automatically.

export async function GET() {
  const auth = await requireClient()
  if ('error' in auth) return auth.error
  const { supabase } = auth

  const { data, error } = await supabase
    .from('team_members')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ team: data ?? [] })
}

export async function POST(request: Request) {
  const auth = await requireClient()
  if ('error' in auth) return auth.error
  const { supabase, clientId } = auth

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const name = String(body.name ?? '').trim()
  const role = String(body.role ?? '').trim()
  const phone = String(body.phone ?? '').trim()

  if (!name) return NextResponse.json({ error: 'Name is required.' }, { status: 400 })
  if (!role) return NextResponse.json({ error: 'Role is required.' }, { status: 400 })
  if (!phone) return NextResponse.json({ error: 'Phone is required.' }, { status: 400 })

  const isEsc = !!body.is_escalation_contact
  // If we're flagging this row as escalation, clear the flag on any
  // existing row first so the partial unique index doesn't conflict.
  if (isEsc) {
    await supabase
      .from('team_members')
      .update({ is_escalation_contact: false })
      .eq('client_id', clientId)
      .eq('is_escalation_contact', true)
  }

  const { data, error } = await supabase
    .from('team_members')
    .insert({
      client_id: clientId,
      name,
      role,
      department: (body.department as string | undefined)?.trim() || null,
      phone,
      extension: (body.extension as string | undefined)?.trim() || null,
      is_escalation_contact: isEsc,
      active: body.active === false ? false : true,
      sort_order: typeof body.sort_order === 'number' ? body.sort_order : 0,
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ member: data })
}
