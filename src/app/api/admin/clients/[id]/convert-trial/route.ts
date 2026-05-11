import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin-auth'

const VALID_PLANS = new Set(['starter', 'growth', 'pro'])

// Marks a trial as converted to paid. Stripe checkout is handled out of
// band — Irfan forwards the payment link manually.
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

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('businesses')
    .update({
      account_status: 'active',
      trial_converted_at: new Date().toISOString(),
      plan,
    })
    .eq('id', id)
    .select('id, name, plan, account_status, trial_converted_at')
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  await admin.from('client_comms_log').insert({
    business_id: id,
    note: `Trial converted to paid on the ${plan} plan.`,
  })

  return NextResponse.json({ ok: true, business: data })
}
