import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin-auth'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const { id } = await params
  const { searchParams } = new URL(request.url)
  const statusFilter = searchParams.get('status')

  const admin = createAdminClient()
  let q = admin.from('bookings').select('*').eq('client_id', id)
    .order('created_at', { ascending: false })
  if (statusFilter) q = q.eq('status', statusFilter)

  const { data, error } = await q
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  // Also fetch callbacks for the admin tab — same business id, separate
  // list, returned alongside so the modal can render both.
  const { data: callbacks } = await admin
    .from('callbacks')
    .select('*')
    .eq('client_id', id)
    .order('created_at', { ascending: false })

  return NextResponse.json({ ok: true, bookings: data ?? [], callbacks: callbacks ?? [] })
}
