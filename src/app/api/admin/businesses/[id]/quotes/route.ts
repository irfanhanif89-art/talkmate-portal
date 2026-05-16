import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin-auth'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { id } = await params

  const url = new URL(request.url)
  const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') ?? '100', 10) || 100))

  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)

  const admin = createAdminClient()
  const [rowsRes, monthStatsRes] = await Promise.all([
    admin
      .from('quotes')
      .select('id, call_id, caller_phone, pickup_address, dropoff_address, distance_km, duration_minutes, truck_type, rate_type, base_price, addons, total_price, is_poa, status, quote_valid_until, created_at')
      .eq('client_id', id)
      .order('created_at', { ascending: false })
      .limit(limit),
    admin
      .from('quotes')
      .select('status, distance_km, is_poa')
      .eq('client_id', id)
      .gte('created_at', startOfMonth.toISOString()),
  ])

  if (rowsRes.error) return NextResponse.json({ error: rowsRes.error.message }, { status: 500 })

  const month = monthStatsRes.data ?? []
  const stats = {
    total: month.length,
    accepted: month.filter(q => q.status === 'accepted').length,
    declined: month.filter(q => q.status === 'declined').length,
    avg_distance_km: month.length === 0
      ? 0
      : Math.round((month.reduce((sum, q) => sum + (Number(q.distance_km) || 0), 0) / month.length) * 10) / 10,
  }

  return NextResponse.json({ quotes: rowsRes.data ?? [], stats })
}
