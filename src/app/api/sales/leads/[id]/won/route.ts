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
import { sendInternalEmail } from '@/lib/alerts'

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireSalesRep(req)
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })
  const { id } = await ctx.params

  const body = (await req.json().catch(() => ({}))) as { plan?: unknown; billing_cycle?: unknown }
  const plan = body.plan
  const billingCycle = isBillingCycle(body.billing_cycle) ? body.billing_cycle : 'monthly'
  if (!isCommissionPlan(plan)) {
    return NextResponse.json({ ok: false, error: 'plan must be starter, growth, or pro' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: lead } = await admin
    .from('leads')
    .select('id, assigned_to, business_name, contact_name, phone, email, status')
    .eq('id', id)
    .maybeSingle()

  if (!lead || lead.assigned_to !== auth.rep.id) {
    return NextResponse.json({ ok: false, error: 'Lead not found' }, { status: 404 })
  }
  if (lead.status === 'won') {
    return NextResponse.json({ ok: false, error: 'This deal has already been submitted as won' }, { status: 409 })
  }

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

  const clawbackEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
  const { error: commErr } = await admin.from('commissions').insert({
    rep_id: auth.rep.id,
    lead_id: id,
    plan,
    commission_amount: baseAmount,
    bonus_amount: bonusAmount,
    policy_version: COMMISSION_POLICY_VERSION,
    status: 'pending',
    clawback_period_ends_at: clawbackEndsAt,
  })
  if (commErr) {
    return NextResponse.json({ ok: false, error: `Commission creation failed: ${commErr.message}` }, { status: 500 })
  }

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

  // Existing notification (Telegram + admin email via Make.com webhook).
  // Fire-and-forget — failures logged in notifier.
  notifyWin({
    repName: auth.rep.full_name,
    businessName: lead.business_name,
    contactName: lead.contact_name,
    contactPhone: lead.phone,
    plan,
    commissionAmount: totalAmount,
  }).catch(() => {})

  // Session 41 additive: rep notification + structured admin email + audit log.
  await admin.from('rep_notifications').insert({
    rep_id: auth.rep.id,
    type: 'commission_updated',
    lead_id: id,
    message: `Commission pending for ${lead.business_name}. Awaiting admin onboarding and approval.`,
  })

  await sendInternalEmail(
    `New deal closed: ${lead.business_name} (${plan} plan)`,
    `
      <h2>New deal closed by ${auth.rep.full_name}</h2>
      <ul>
        <li><strong>Business:</strong> ${escapeHtml(lead.business_name)}</li>
        <li><strong>Plan:</strong> ${plan} (${billingCycle})</li>
        <li><strong>Contact:</strong> ${escapeHtml(lead.contact_name ?? '—')}</li>
        <li><strong>Phone:</strong> ${escapeHtml(lead.phone ?? '—')}</li>
        <li><strong>Email:</strong> ${escapeHtml(lead.email ?? '—')}</li>
        <li><strong>Pending commission:</strong> $${totalAmount}</li>
      </ul>
      <p>This deal is in the Admin Onboarding Queue waiting for setup. Activate the client in the queue to approve commission.</p>
    `,
  )

  await admin.from('admin_audit_log').insert({
    admin_email: auth.user.email ?? 'unknown',
    action: 'deal_closed_by_rep',
    business_name: lead.business_name,
  })

  return NextResponse.json({ ok: true, lead: updated })
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, ch => (
    ch === '&' ? '&amp;' :
    ch === '<' ? '&lt;'  :
    ch === '>' ? '&gt;'  :
    ch === '"' ? '&quot;': '&#39;'
  ))
}
