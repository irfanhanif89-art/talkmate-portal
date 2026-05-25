import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireDriver } from '@/lib/driver-auth'

// GET /api/driver/jobs — list jobs assigned to this driver. Used by
// the dashboard's "incoming" overlay (status=driver_notified) and as
// a generic feed.
// Query params:
//   status — filter to one status
//   limit  — default 20

export async function GET(req: Request) {
  const auth = await requireDriver()
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const url = new URL(req.url)
  const status = url.searchParams.get('status')
  const limit = Math.min(Number(url.searchParams.get('limit') ?? '20'), 100)

  const admin = createAdminClient()
  let query = admin
    .from('dispatch_jobs')
    .select('id, job_number, job_type, status, pickup_address, dropoff_address, customer_name, vehicle_make, vehicle_model, vehicle_rego, payment_type, quoted_amount, response_deadline, special_instructions, notified_at, created_at, updated_at')
    .eq('driver_id', auth.driver.id)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (status) query = query.eq('status', status)

  const { data: jobs, error } = await query
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, jobs: jobs ?? [] })
}
