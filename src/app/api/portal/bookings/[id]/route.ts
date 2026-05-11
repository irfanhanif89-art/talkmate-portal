import { NextResponse } from 'next/server'
import { requireClient } from '@/lib/portal-auth'

const ALLOWED_FIELDS = new Set([
  'status', 'caller_name', 'caller_phone', 'booking_type',
  'service_requested', 'preferred_date', 'preferred_time', 'notes',
])

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireClient()
  if ('error' in auth) return auth.error
  const { supabase } = auth

  const { id } = await params
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const update: Record<string, unknown> = {}
  for (const k of Object.keys(body)) {
    if (ALLOWED_FIELDS.has(k)) update[k] = body[k]
  }
  if (update.status === 'confirmed' && !update.confirmed_at) {
    update.confirmed_at = new Date().toISOString()
  }

  const { data, error } = await supabase
    .from('bookings')
    .update(update)
    .eq('id', id)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ booking: data })
}
