// GET /api/admin/audit-log — Session 11.
//
// Admin-only listing endpoint backing /admin/audit-log. The
// admin_audit_log table is service-role-only (no RLS), so we gate via
// requireAdmin() and read with createAdminClient.
//
// Query params (all optional):
//   business — case-insensitive substring match on business_name
//   action   — exact match on action
//   from     — ISO date (YYYY-MM-DD), filters created_at >= start of day
//   to       — ISO date (YYYY-MM-DD), filters created_at <= end of day
//   limit    — max rows (default 50, capped at 500)

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin-auth'

export async function GET(req: Request) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const url = new URL(req.url)
  const business = url.searchParams.get('business')?.trim()
  const action = url.searchParams.get('action')?.trim()
  const from = url.searchParams.get('from')?.trim()
  const to = url.searchParams.get('to')?.trim()
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 50) || 50, 500)

  const admin = createAdminClient()
  let q = admin
    .from('admin_audit_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (business) q = q.ilike('business_name', `%${business}%`)
  if (action) q = q.eq('action', action)
  if (from) q = q.gte('created_at', new Date(`${from}T00:00:00Z`).toISOString())
  if (to) q = q.lte('created_at', new Date(`${to}T23:59:59Z`).toISOString())

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ rows: data ?? [] })
}
