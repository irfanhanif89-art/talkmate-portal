import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin-auth'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const { id } = await params
  if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })

  const admin = createAdminClient()
  const { data: business } = await admin.from('businesses')
    .select('id, name, owner_user_id').eq('id', id).single()
  if (!business) return NextResponse.json({ ok: false, error: 'Business not found' }, { status: 404 })

  const { data: owner } = await admin.from('users').select('email')
    .eq('id', business.owner_user_id).single()
  if (!owner?.email) {
    return NextResponse.json({ ok: false, error: 'Client owner has no email on file' }, { status: 400 })
  }

  // Magic link lands the admin on /dashboard. The dashboard banner shows
  // "admin view — impersonating X" because the URL carries ?impersonate=1.
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: owner.email,
    options: {
      redirectTo: `https://app.talkmate.com.au/dashboard?impersonate=1&biz=${business.id}`,
    },
  })
  if (error || !data?.properties?.action_link) {
    return NextResponse.json({ ok: false, error: error?.message ?? 'Failed to mint link' }, { status: 500 })
  }

  await admin.from('client_admin_notes').insert({
    business_id: id,
    note: `Admin impersonation session started by ${auth.user.email}.`,
  })

  // Wrap in /admin/view-as so it signs out the admin session before
  // following the magic link — otherwise the existing admin cookie blocks it.
  const viewAsUrl = `https://app.talkmate.com.au/admin/view-as?url=${encodeURIComponent(data.properties.action_link)}`

  return NextResponse.json({
    ok: true,
    url: viewAsUrl,
    business_name: business.name,
    business_id: business.id,
  })
}
