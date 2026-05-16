import { NextResponse } from 'next/server'
import { requireClient } from '@/lib/portal-auth'

const VALID_STATUSES = new Set(['given', 'accepted', 'declined', 'expired'])

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireClient()
  if ('error' in auth) return auth.error
  const { supabase, clientId } = auth

  const { id } = await params
  const body = (await request.json().catch(() => ({}))) as { status?: string }
  if (!body.status || !VALID_STATUSES.has(body.status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('quotes')
    .update({ status: body.status })
    .eq('id', id)
    .eq('client_id', clientId)
    .select('id, status')
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Quote not found' }, { status: 404 })

  return NextResponse.json({ id: data.id, status: data.status })
}
