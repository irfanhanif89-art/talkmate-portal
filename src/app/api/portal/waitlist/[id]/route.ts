import { NextResponse } from 'next/server'
import { requireClient } from '@/lib/portal-auth'

const VALID_STATUSES = new Set(['waiting', 'offered', 'claimed', 'expired', 'cancelled'])

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireClient()
  if ('error' in auth) return auth.error
  const { supabase } = auth
  const { id } = await params

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const status = typeof body.status === 'string' ? body.status : null
  if (status && !VALID_STATUSES.has(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const update: Record<string, unknown> = {}
  if (status) update.status = status
  if (status === 'claimed') update.claimed_at = new Date().toISOString()

  const { data, error } = await supabase
    .from('waitlist')
    .update(update)
    .eq('id', id)
    .select('*')
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ entry: data })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireClient()
  if ('error' in auth) return auth.error
  const { supabase } = auth
  const { id } = await params

  const { error } = await supabase
    .from('waitlist')
    .update({ status: 'cancelled' })
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
