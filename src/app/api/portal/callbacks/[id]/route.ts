import { NextResponse } from 'next/server'
import { requireClient } from '@/lib/portal-auth'

const VALID_STATUSES = new Set(['pending', 'completed', 'cancelled'])

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireClient(request)
  if ('error' in auth) return auth.error
  const { supabase } = auth

  const { id } = await params
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const status = (body.status as string | undefined)?.trim()
  if (!status || !VALID_STATUSES.has(status)) {
    return NextResponse.json({ error: 'Invalid or missing status.' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('callbacks')
    .update({ status })
    .eq('id', id)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ callback: data })
}
