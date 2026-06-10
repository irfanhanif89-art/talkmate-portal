import { NextResponse } from 'next/server'
import { requireSalesRep } from '@/lib/sales-auth'
import { createAdminClient } from '@/lib/supabase/server'
import { PLAN_PRICE_AUD, isAdminPlan } from '@/lib/admin-auth'

// Rep-accessible read-only aggregate. No PII surfaces — just the active
// client count and the monthly recurring revenue.

export const revalidate = 300

export async function GET(req: Request) {
  const auth = await requireSalesRep(req)
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const admin = createAdminClient()
  // Session 77 MRR audit — exclude demo businesses (the demo business is
  // account_status='active', plan='growth', so without this filter it would
  // inflate the platform active-client count and MRR by one Growth seat).
  const { data: rows, error } = await admin
    .from('businesses')
    .select('plan')
    .eq('account_status', 'active')
    .eq('is_demo', false)

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  let active = 0
  let mrr = 0
  for (const r of rows ?? []) {
    active += 1
    if (isAdminPlan(r.plan)) mrr += PLAN_PRICE_AUD[r.plan]
  }

  return NextResponse.json({
    ok: true,
    active_clients: active,
    total_mrr: mrr,
  })
}
