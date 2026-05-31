// ROI dashboard summary for the signed-in business (or admin-as-client via
// ?adminClientId=<uuid>). Thin wrapper over src/lib/roi.ts so the calculation
// (after-hours bucketing in Australia/Brisbane time, win-back de-duplication,
// conversion-rate maths) lives in exactly one place and the admin pages and
// this route can never drift apart.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { resolveBusinessId } from '@/lib/resolve-business'
import { computeRoiForBusiness, type RoiPeriod } from '@/lib/roi'

export const dynamic = 'force-dynamic'

const VALID_PERIODS = new Set(['this_month', 'last_month', 'all_time'])

export async function GET(request: NextRequest) {
  const adminClientId = request.nextUrl.searchParams.get('adminClientId')
  const auth = await resolveBusinessId(adminClientId)
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const periodParam = request.nextUrl.searchParams.get('period') || 'this_month'
  const period: RoiPeriod = (VALID_PERIODS.has(periodParam) ? periodParam : 'this_month') as RoiPeriod

  const admin = createAdminClient()
  const now = new Date()

  const summary = await computeRoiForBusiness(admin, auth.businessId, period, now)

  // Previous comparable period, for the % change indicator. Shift `now` back a
  // month and ask lib for "last_month" to get the period before last.
  let previousPeriod: { totalEstimatedRevenue: number } | null = null
  if (period === 'this_month') {
    const prev = await computeRoiForBusiness(admin, auth.businessId, 'last_month', now)
    previousPeriod = { totalEstimatedRevenue: prev.totalEstimatedRevenue }
  } else if (period === 'last_month') {
    const prevNow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15, 0, 0, 0, 0))
    const prev = await computeRoiForBusiness(admin, auth.businessId, 'last_month', prevNow)
    previousPeriod = { totalEstimatedRevenue: prev.totalEstimatedRevenue }
  }

  // Surface the current conversion-rate assumptions so the dashboard can show
  // and edit them (transparency for the estimated figure).
  const { data: rates } = await admin
    .from('businesses')
    .select('roi_conversion_rate_calls, roi_conversion_rate_chat, roi_conversion_rate_winback')
    .eq('id', auth.businessId)
    .maybeSingle()
  const conversionRates = {
    calls: rates?.roi_conversion_rate_calls != null ? Number(rates.roi_conversion_rate_calls) : 40,
    chat: rates?.roi_conversion_rate_chat != null ? Number(rates.roi_conversion_rate_chat) : 20,
    winback: rates?.roi_conversion_rate_winback != null ? Number(rates.roi_conversion_rate_winback) : 30,
  }

  return NextResponse.json({ ok: true, period, ...summary, previousPeriod, conversionRates })
}

// Edit the ROI assumptions: average job value and the three conversion rates.
// Making these visible and editable is what keeps the headline figure an honest
// estimate rather than a black box.
export async function PATCH(request: NextRequest) {
  const adminClientId = request.nextUrl.searchParams.get('adminClientId')
  const auth = await resolveBusinessId(adminClientId)
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  let body: {
    avgJobValue?: number
    conversionRateCalls?: number
    conversionRateChat?: number
    conversionRateWinback?: number
  }
  try { body = await request.json() as typeof body }
  catch { return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 }) }

  const patch: Record<string, number> = {}
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

  const ajv = num(body.avgJobValue)
  if (ajv != null) {
    if (ajv < 0 || ajv > 1_000_000) return NextResponse.json({ ok: false, error: 'avg_job_value_out_of_range' }, { status: 400 })
    patch.avg_job_value = ajv
  }
  const rate = (key: string, v: unknown) => {
    const n = num(v)
    if (n == null) return true
    if (n < 0 || n > 100) return false
    patch[key] = n
    return true
  }
  if (!rate('roi_conversion_rate_calls', body.conversionRateCalls)) return NextResponse.json({ ok: false, error: 'rate_out_of_range' }, { status: 400 })
  if (!rate('roi_conversion_rate_chat', body.conversionRateChat)) return NextResponse.json({ ok: false, error: 'rate_out_of_range' }, { status: 400 })
  if (!rate('roi_conversion_rate_winback', body.conversionRateWinback)) return NextResponse.json({ ok: false, error: 'rate_out_of_range' }, { status: 400 })

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: false, error: 'nothing_to_update' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error } = await admin.from('businesses').update(patch).eq('id', auth.businessId)
  if (error) {
    console.error('[dashboard/roi] settings update failed', error.message)
    return NextResponse.json({ ok: false, error: 'update_failed' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
