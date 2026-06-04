// GET  /api/servicem8/status  — read connection config + jobs-this-month
// PATCH /api/servicem8/status  — update default job status
// user auth (or ?adminClientId)

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { resolveBusinessId } from '@/lib/resolve-business'

export const dynamic = 'force-dynamic'

const VALID_STATUS = new Set(['Quote', 'Work Order', 'In Progress'])

export async function GET(request: NextRequest) {
  const adminClientId = request.nextUrl.searchParams.get('adminClientId')
  const auth = await resolveBusinessId(adminClientId, request)
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const admin = createAdminClient()
  const { data: business } = await admin
    .from('businesses')
    .select('servicem8_enabled, servicem8_company_uuid, servicem8_default_job_status')
    .eq('id', auth.businessId)
    .maybeSingle()

  const startOfMonth = new Date()
  startOfMonth.setUTCDate(1)
  startOfMonth.setUTCHours(0, 0, 0, 0)
  const { count } = await admin
    .from('servicem8_push_log')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', auth.businessId)
    .eq('status', 'success')
    .gte('pushed_at', startOfMonth.toISOString())

  return NextResponse.json({
    ok: true,
    enabled: business?.servicem8_enabled === true,
    defaultStatus: (business?.servicem8_default_job_status as string | null) ?? 'Quote',
    jobsThisMonth: count ?? 0,
  })
}

export async function PATCH(request: NextRequest) {
  const adminClientId = request.nextUrl.searchParams.get('adminClientId')
  const auth = await resolveBusinessId(adminClientId, request)
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  let body: { defaultStatus?: string }
  try { body = await request.json() } catch { return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 }) }
  const defaultStatus = (body.defaultStatus ?? '').trim()
  if (!VALID_STATUS.has(defaultStatus)) {
    return NextResponse.json({ ok: false, error: 'invalid_status' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('businesses')
    .update({ servicem8_default_job_status: defaultStatus })
    .eq('id', auth.businessId)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
