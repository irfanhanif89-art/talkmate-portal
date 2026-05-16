import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin-auth'

const VALID_STATUSES = new Set(['given', 'accepted', 'declined', 'expired'])

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; quoteId: string }> },
) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { id, quoteId } = await params
  const body = (await request.json().catch(() => ({}))) as { status?: string }
  if (!body.status || !VALID_STATUSES.has(body.status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('quotes')
    .update({ status: body.status })
    .eq('id', quoteId)
    .eq('client_id', id)
    .select('id, status')
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Quote not found' }, { status: 404 })

  return NextResponse.json({ id: data.id, status: data.status })
}
