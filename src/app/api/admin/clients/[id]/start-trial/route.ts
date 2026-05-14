import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin-auth'
import { logAdminAction } from '@/lib/audit'

const TRIAL_DAYS = 7

const VALID_PLANS = new Set(['starter', 'growth', 'pro'])

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const { id } = await params
  if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })

  const body = await req.json().catch(() => ({})) as { plan?: string }
  const plan = (body.plan ?? '').toLowerCase()
  if (!VALID_PLANS.has(plan)) {
    return NextResponse.json({ ok: false, error: "plan must be one of 'starter', 'growth', 'pro'" }, { status: 400 })
  }

  const start = new Date()
  const end = new Date(start.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000)

  const admin = createAdminClient()
  const { data: before } = await admin
    .from('businesses')
    .select('plan, account_status')
    .eq('id', id)
    .maybeSingle()

  const { data, error } = await admin
    .from('businesses')
    .update({
      account_status: 'trial',
      trial_start_date: start.toISOString(),
      trial_end_date: end.toISOString(),
      trial_converted_at: null,
      plan,
    })
    .eq('id', id)
    .select('id, name, plan, account_status, trial_start_date, trial_end_date')
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  await admin.from('client_comms_log').insert({
    business_id: id,
    note: `Started ${TRIAL_DAYS}-day free trial on the ${plan} plan. Ends ${end.toISOString().slice(0, 10)}.`,
  })

  await logAdminAction({
    adminEmail: auth.user.email ?? 'unknown',
    action: 'trial_started',
    businessId: id,
    businessName: data?.name ?? null,
    before: { plan: before?.plan ?? null, account_status: before?.account_status ?? null },
    after: { plan, account_status: 'trial', trial_end_date: end.toISOString() },
    request: req,
  })

  return NextResponse.json({ ok: true, business: data })
}
