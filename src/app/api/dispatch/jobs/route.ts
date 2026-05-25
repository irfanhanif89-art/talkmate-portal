import { NextResponse } from 'next/server'
import { requireClient } from '@/lib/portal-auth'
import { createAdminClient } from '@/lib/supabase/server'
import { dispatchJobToDriver } from '@/lib/dispatch-runtime'

// GET  /api/dispatch/jobs — filtered + paginated job list (Jobs tab).
// POST /api/dispatch/jobs — owner creates a new job. If driver_id is
// provided OR auto_dispatch=true, the job is also offered to a driver
// in the same request via dispatchJobToDriver.

const VALID_JOB_TYPES = new Set([
  'tow', 'roadside', 'accident_recovery', 'impound_release', 'winch',
  'battery_jump', 'tyre_change', 'fuel_delivery', 'lockout', 'other',
])
const VALID_PAYMENT_TYPES = new Set([
  'cash', 'card', 'account', 'insurance', 'motor_club', 'other',
])

export async function GET(req: Request) {
  const auth = await requireClient()
  if ('error' in auth) return auth.error
  const { supabase, clientId } = auth

  const url = new URL(req.url)
  const status = url.searchParams.get('status')
  const driverId = url.searchParams.get('driver_id')
  const dateFrom = url.searchParams.get('date_from')
  const dateTo = url.searchParams.get('date_to')
  const jobType = url.searchParams.get('job_type')
  const paymentType = url.searchParams.get('payment_type')
  const search = (url.searchParams.get('search') ?? '').trim()
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10))
  const pageSize = Math.min(100, parseInt(url.searchParams.get('page_size') ?? '50', 10))

  let q = supabase
    .from('dispatch_jobs')
    .select('id, job_number, job_type, status, pickup_address, dropoff_address, customer_name, customer_phone, driver_id, payment_type, final_amount, quoted_amount, created_at, completed_at', { count: 'exact' })
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })

  if (status) q = q.eq('status', status)
  if (driverId) q = q.eq('driver_id', driverId)
  if (jobType) q = q.eq('job_type', jobType)
  if (paymentType) q = q.eq('payment_type', paymentType)
  if (dateFrom) q = q.gte('created_at', dateFrom)
  if (dateTo) q = q.lte('created_at', dateTo)
  if (search) {
    q = q.or(`job_number.ilike.%${search}%,customer_name.ilike.%${search}%,pickup_address.ilike.%${search}%,vehicle_rego.ilike.%${search}%`)
  }

  const from = (page - 1) * pageSize
  const to = from + pageSize - 1
  q = q.range(from, to)

  const { data, count, error } = await q
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({
    ok: true,
    jobs: data ?? [],
    total: count ?? 0,
    page,
    page_size: pageSize,
  })
}

export async function POST(req: Request) {
  const auth = await requireClient()
  if ('error' in auth) return auth.error
  const { supabase, clientId, userId } = auth

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>

  const jobType = String(body.job_type ?? '').toLowerCase()
  const pickupAddress = String(body.pickup_address ?? '').trim()
  if (!VALID_JOB_TYPES.has(jobType)) {
    return NextResponse.json({ ok: false, error: 'job_type is required' }, { status: 400 })
  }
  if (!pickupAddress) {
    return NextResponse.json({ ok: false, error: 'pickup_address is required' }, { status: 400 })
  }

  const paymentType = typeof body.payment_type === 'string' ? body.payment_type.toLowerCase() : null
  if (paymentType && !VALID_PAYMENT_TYPES.has(paymentType)) {
    return NextResponse.json({ ok: false, error: 'Invalid payment_type' }, { status: 400 })
  }

  const driverIdRaw = typeof body.driver_id === 'string' ? body.driver_id : null
  const autoDispatch = body.auto_dispatch === true

  // Insert the job. job_number is auto-set by the migration-048 trigger.
  const admin = createAdminClient()
  const { data: created, error: insErr } = await admin
    .from('dispatch_jobs')
    .insert({
      client_id: clientId,
      job_type: jobType,
      pickup_address: pickupAddress,
      pickup_notes: nullable(body.pickup_notes),
      dropoff_address: nullable(body.dropoff_address),
      dropoff_notes: nullable(body.dropoff_notes),
      customer_name: nullable(body.customer_name),
      customer_phone: nullable(body.customer_phone),
      customer_email: nullable(body.customer_email),
      vehicle_make: nullable(body.vehicle_make),
      vehicle_model: nullable(body.vehicle_model),
      vehicle_year: nullable(body.vehicle_year),
      vehicle_colour: nullable(body.vehicle_colour),
      vehicle_rego: nullable(body.vehicle_rego),
      vehicle_condition: nullable(body.vehicle_condition),
      special_instructions: nullable(body.special_instructions),
      truck_type_required: nullable(body.truck_type_required),
      distance_km: numericNullable(body.distance_km),
      estimated_duration_mins: integerNullable(body.estimated_duration_mins),
      payment_type: paymentType,
      insurance_claim_number: nullable(body.insurance_claim_number),
      motor_club_job_number: nullable(body.motor_club_job_number),
      quoted_amount: numericNullable(body.quoted_amount),
      status: 'created',
      created_by_user_id: userId,
    })
    .select('*')
    .maybeSingle()

  if (insErr || !created) {
    return NextResponse.json({ ok: false, error: insErr?.message ?? 'Insert failed' }, { status: 500 })
  }

  // Try to dispatch to a driver if requested.
  if (driverIdRaw || autoDispatch) {
    await dispatchJobToDriver({
      jobId: created.id as string,
      clientId,
      preferredDriverId: driverIdRaw,
      autoDispatch,
    })
  }

  return NextResponse.json({ ok: true, job: created })
}

function nullable(v: unknown): string | null {
  if (v == null) return null
  if (typeof v !== 'string') return null
  const trimmed = v.trim()
  return trimmed === '' ? null : trimmed
}

function numericNullable(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : parseFloat(String(v))
  return Number.isFinite(n) ? n : null
}

function integerNullable(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : parseInt(String(v), 10)
  return Number.isFinite(n) ? n : null
}
