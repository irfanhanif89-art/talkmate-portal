import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin-auth'
import { logAdminAction } from '@/lib/audit'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const { id } = await params
  if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })

  const admin = createAdminClient()
  const { data: before } = await admin
    .from('businesses')
    .select('name, account_status')
    .eq('id', id)
    .maybeSingle()

  const { error } = await admin.from('businesses').update({ account_status: 'suspended' }).eq('id', id)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  await admin.from('client_admin_notes').insert({
    business_id: id,
    note: 'Account suspended by admin.',
  })

  await logAdminAction({
    adminEmail: auth.user.email ?? 'unknown',
    action: 'account_status_changed',
    businessId: id,
    businessName: before?.name ?? null,
    before: { account_status: before?.account_status ?? null },
    after: { account_status: 'suspended' },
    request: req,
  })

  return NextResponse.json({ ok: true })
}
