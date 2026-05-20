import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireSalesRep } from '@/lib/sales-auth'
import {
  COMMISSION_MAP,
  COMMISSION_POLICY_VERSION,
  isBillingCycle,
  isCommissionPlan,
} from '@/lib/commission'
import { notifyWin } from '@/lib/sales-notify'

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireSalesRep()
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })
  const { id } = await ctx.params

  const body = (await req.json().catch(() => ({}))) as { plan?: unknown; billing_cycle?: unknown }
  const plan = body.plan
  // Default to 'monthly' for back-compat with any old client that still
  // omits billing_cycle.
  const billingCycle = isBillingCycle(body.billing_cycle) ? body.billing_cycle : 'monthly'
  if (!isCommissionPlan(plan)) {
    return NextResponse.json({ ok: false, error: 'plan must be starter, growth, or pro' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: lead } = await admin
    .from('leads')
    .select('id, assigned_to, business_name, contact_name, phone, status')
    .eq('id', id)
    .maybeSingle()

  if (!lead || lead.assigned_to !== auth.rep.id) {
    return NextResponse.json({ ok: false, error: 'Lead not found' }, { status: 404 })
  }
  if (lead.status === 'won') {
    return NextResponse.json({ ok: false, error: 'This deal has already been submitted as won' }, { status: 409 })
  }

  // Commission split: base goes in commission_amount, annual uplift
  // (if any) goes in bonus_amount. Both come from the server-side map.
  const baseAmount = COMMISSION_MAP[plan].base
  const bonusAmount = billingCycle === 'annual' ? COMMISSION_MAP[plan].annual_bonus : 0
  const totalAmount = baseAmount + bonusAmount
  const now = new Date().toISOString()

  const { data: updated, error: updateErr } = await admin
    .from('leads')
    .update({
      status: 'won',
      won_at: now,
      won_plan: plan,
      won_billing_cycle: billingCycle,
      approval_status: 'pending',
    })
    .eq('id', id)
    .select(`
      id, business_name, contact_name, phone, email, industry, suburb, state,
      website, source, notes, status, approval_status, won_plan, won_at,
      lost_reason, bad_lead_reason, business_id, created_at, updated_at
    `)
    .single()

  if (updateErr || !updated) {
    return NextResponse.json({ ok: false, error: updateErr?.message ?? 'Could not mark as won' }, { status: 500 })
  }

  // Create the pending commission row. Amounts are server-side from
  // the COMMISSION_MAP — never trust client input.
  const { error: commErr } = await admin.from('commissions').insert({
    rep_id: auth.rep.id,
    lead_id: id,
    plan,
    commission_amount: baseAmount,
    bonus_amount: bonusAmount,
    policy_version: COMMISSION_POLICY_VERSION,
    status: 'pending',
  })
  if (commErr) {
    return NextResponse.json({ ok: false, error: `Commission creation failed: ${commErr.message}` }, { status: 500 })
  }

  // Audit + system activity entries.
  await admin.from('lead_activities').insert([
    {
      lead_id: id,
      rep_id: auth.rep.id,
      activity_type: 'status_change',
      title: `Marked as won (${plan}, ${billingCycle})`,
      old_status: lead.status,
      new_status: 'won',
    },
    {
      lead_id: id,
      rep_id: auth.rep.id,
      activity_type: 'system',
      title: 'Deal submitted for approval',
      body: bonusAmount > 0
        ? `Pending commission: $${baseAmount} base + $${bonusAmount} annual bonus = $${totalAmount}`
        : `Pending commission: $${baseAmount}`,
    },
  ])

  // Fire-and-forget notification (don't block on failures).
  notifyWin({
    repName: auth.rep.full_name,
    businessName: lead.business_name,
    contactName: lead.contact_name,
    contactPhone: lead.phone,
    plan,
    commissionAmount: totalAmount,
  }).catch(() => { /* logged in notifier */ })

  return NextResponse.json({ ok: true, lead: updated })
}
