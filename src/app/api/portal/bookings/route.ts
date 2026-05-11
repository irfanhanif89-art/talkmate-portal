import { NextResponse } from 'next/server'
import { requireClient } from '@/lib/portal-auth'

const VALID_STATUSES = new Set(['pending', 'confirmed', 'cancelled', 'completed', 'no_show'])

export async function GET(request: Request) {
  const auth = await requireClient()
  if ('error' in auth) return auth.error
  const { supabase } = auth

  const { searchParams } = new URL(request.url)
  const statusFilter = searchParams.get('status')

  let q = supabase
    .from('bookings')
    .select('*')
    .order('created_at', { ascending: false })

  if (statusFilter && VALID_STATUSES.has(statusFilter)) {
    q = q.eq('status', statusFilter)
  }

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ bookings: data ?? [] })
}
