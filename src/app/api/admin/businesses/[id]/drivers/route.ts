import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin-auth'

// Admin-scoped list of drivers for a specific client. Read-only so far —
// driver CRUD continues to go through the client portal endpoints
// (the admin portal can use "Open as client" for those flows).

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { id } = await params

  const admin = createAdminClient()
  // Sessions 36-37 — migration 048: vehicle_id removed; `active` is
  // now `is_active`; truck_type + truck_rego replace the vehicle FK.
  const { data, error } = await admin
    .from('drivers')
    .select('id, name, phone, truck_type, truck_rego, is_active')
    .eq('client_id', id)
    .order('name', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ drivers: data ?? [] })
}
