import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin-auth'
import { logAdminAction } from '@/lib/audit'

// Admin team-directory list + create for a specific business.
// Service-role client bypasses RLS; scope is enforced via the path's
// :id parameter.

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const { id } = await params
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('team_members')
    .select('*')
    .eq('client_id', id)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, team: data ?? [] })
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const { id } = await params
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const name = String(body.name ?? '').trim()
  const role = String(body.role ?? '').trim()
  const phone = String(body.phone ?? '').trim()
  if (!name || !role || !phone) {
    return NextResponse.json({ ok: false, error: 'name, role and phone are required.' }, { status: 400 })
  }

  const admin = createAdminClient()
  const isEsc = !!body.is_escalation_contact
  if (isEsc) {
    await admin.from('team_members')
      .update({ is_escalation_contact: false })
      .eq('client_id', id).eq('is_escalation_contact', true)
  }

  const { data, error } = await admin
    .from('team_members')
    .insert({
      client_id: id,
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

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  await logAdminAction({
    adminEmail: auth.user.email ?? 'unknown',
    action: 'team_member_added',
    businessId: id,
    after: { name: data?.name, role: data?.role, phone: data?.phone, member_id: data?.id },
    request,
  })

  return NextResponse.json({ ok: true, member: data })
}
