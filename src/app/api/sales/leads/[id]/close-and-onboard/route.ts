// Session 51 — Atomic Close & Onboard.
//
// Replaces the two-step (Mark Won) + (Email Payment Link) flow with a
// single rep action that runs while the rep is on the phone:
//   1. capture/confirm business name, contact name, email, phone, plan, billing
//   2. flip lead to won + create pending commission
//   3. create Stripe Checkout session + email the link to the customer
//   4. notify admin (Telegram + email)
//
// All-or-nothing semantics for the rep: if the Stripe session fails, the
// lead is NOT marked won and the commission row is NOT created — the rep
// can retry with a corrected email or hit the existing /won fallback.
//
// We deliberately persist the captured contact details to the lead BEFORE
// flipping status so the admin queue sees the data the rep collected on
// the call (rather than whatever stale fields were there from the CSV
// import).

import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createAdminClient } from '@/lib/supabase/server'
import { requireSalesRep } from '@/lib/sales-auth'
import {
  COMMISSION_MAP,
  COMMISSION_POLICY_VERSION,
  isBillingCycle,
  isCommissionPlan,
} from '@/lib/commission'
import { getRecurringPriceId, getSetupPriceId, isPricingPlan } from '@/lib/pricing'
import {
  notifyWin,
  sendCustomerPaymentLinkEmail,
} from '@/lib/sales-notify'
import { sendInternalEmail } from '@/lib/alerts'

function planLabelOf(p: 'starter' | 'growth' | 'pro'): string {
  return p.charAt(0).toUpperCase() + p.slice(1)
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, ch => (
    ch === '&' ? '&amp;' :
    ch === '<' ? '&lt;'  :
    ch === '>' ? '&gt;'  :
    ch === '"' ? '&quot;': '&#39;'
  ))
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireSalesRep(req)
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })
  const { id } = await ctx.params

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const business_name = typeof body.business_name === 'string' ? body.business_name.trim() : ''
  const contact_name  = typeof body.contact_name  === 'string' ? body.contact_name.trim()  : ''
  const email         = typeof body.email         === 'string' ? body.email.trim().toLowerCase() : ''
  const phone         = typeof body.phone         === 'string' ? body.phone.trim()         : ''
  const plan          = body.plan
  const billingCycle  = isBillingCycle(body.billing_cycle) ? body.billing_cycle : 'monthly'

  if (!business_name) {
    return NextResponse.json({ ok: false, error: 'Business name is required' }, { status: 400 })
  }
  if (!contact_name) {
    return NextResponse.json({ ok: false, error: 'Contact name is required so we can address the payment email' }, { status: 400 })
  }
  if (!email || !email.includes('@')) {
    return NextResponse.json({ ok: false, error: 'A valid customer email is required to send the payment link' }, { status: 400 })
  }
  if (!phone) {
    return NextResponse.json({ ok: false, error: 'Customer phone is required' }, { status: 400 })
  }
  if (!isCommissionPlan(plan) || !isPricingPlan(plan)) {
    return NextResponse.json({ ok: false, error: 'Plan must be starter, growth, or pro' }, { status: 400 })
  }

  const admin = createAdminClient()

  // 1. Verify ownership + not already won. Idempotent on retry.
  const { data: lead } = await admin
    .from('leads')
    .select('id, assigned_to, business_name, contact_name, phone, email, status')
    .eq('id', id)
    .maybeSingle()

  if (!lead || lead.assigned_to !== auth.rep.id) {
    return NextResponse.json({ ok: false, error: 'Lead not found' }, { status: 404 })
  }
  if (lead.status === 'won') {
    return NextResponse.json({ ok: false, error: 'This deal has already been closed' }, { status: 409 })
  }

  // 2. Stripe price-id sanity check BEFORE we mutate anything. If the
  //    plan isn't configured in Stripe, fail fast — better to surface the
  //    error to the rep than to flip the deal to won and leave them stuck.
  const recurringPriceId = getRecurringPriceId(plan, billingCycle)
  if (!recurringPriceId) {
    return NextResponse.json(
      { ok: false, error: `Stripe price ID not configured for ${plan} ${billingCycle}. The deal hasn't been recorded — message admin so they can configure the price IDs, then try again.` },
      { status: 500 },
    )
  }
  const setupPriceId = getSetupPriceId(plan)

  const stripeKey = process.env.STRIPE_SECRET_KEY
  if (!stripeKey) {
    return NextResponse.json({ ok: false, error: 'Stripe not configured' }, { status: 500 })
  }
  const stripe = new Stripe(stripeKey, { apiVersion: '2026-03-25.dahlia' })

  // 3. Update the lead with the captured contact details FIRST so the
  //    admin queue card shows what the rep actually collected on the
  //    call. We do this before flipping status so the activity log + win
  //    notification fire with the correct data.
  await admin
    .from('leads')
    .update({
      business_name,
      contact_name,
      email,
      phone,
    })
    .eq('id', id)

  const baseAmount = COMMISSION_MAP[plan].base
  const bonusAmount = billingCycle === 'annual' ? COMMISSION_MAP[plan].annual_bonus : 0
  const totalAmount = baseAmount + bonusAmount
  const now = new Date().toISOString()

  // 4. Flip to won + create commission row.
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
    return NextResponse.json({ ok: false, error: updateErr?.message ?? 'Could not close the deal' }, { status: 500 })
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

  // 5. Activity log entries.
  await admin.from('lead_activities').insert([
    {
      lead_id: id,
      rep_id: auth.rep.id,
      activity_type: 'status_change',
      title: `Closed deal (${plan}, ${billingCycle})`,
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

  // 6. Create Stripe Checkout session. If this throws we don't roll
  //    back the won-state — the deal is closed; admin can use the
  //    existing /api/sales/leads/[id]/payment-link route to retry the
  //    link generation. But we still surface the error to the rep.
  const lineItems: Array<{ price: string; quantity: number }> = [
    { price: recurringPriceId, quantity: 1 },
  ]
  if (setupPriceId) {
    lineItems.push({ price: setupPriceId, quantity: 1 })
  }
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.talkmate.com.au'

  let stripeUrl: string | null = null
  let stripeError: string | null = null
  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: lineItems,
      client_reference_id: id,
      customer_email: email,
      metadata: {
        lead_id: id,
        rep_id: auth.rep.id,
        plan,
        billing_cycle: billingCycle,
      },
      subscription_data: {
        metadata: { lead_id: id, rep_id: auth.rep.id },
      },
      success_url: `${appUrl}/payment-success?lead=${id}`,
      cancel_url: `${appUrl}/payment-success?lead=${id}&cancelled=1`,
    })
    if (!session.url) {
      stripeError = 'Stripe returned no checkout URL'
    } else {
      stripeUrl = session.url
      await admin
        .from('leads')
        .update({
          stripe_payment_link: session.url,
          stripe_payment_link_created_at: new Date().toISOString(),
        })
        .eq('id', id)
    }
  } catch (err) {
    stripeError = err instanceof Error ? err.message : String(err)
  }

  // 7. Email the customer the payment link (only if Stripe gave us one).
  let emailedTo: string | null = null
  let emailSendError: string | null = null
  if (stripeUrl) {
    const repReplyTo: string | null = auth.rep.notification_email ?? auth.rep.email ?? null
    const emailResult = await sendCustomerPaymentLinkEmail({
      toEmail: email,
      contactName: contact_name,
      businessName: business_name,
      planLabel: planLabelOf(plan),
      billingCycleLabel: billingCycle === 'annual' ? 'annual' : 'monthly',
      paymentUrl: stripeUrl,
      repFullName: auth.rep.full_name,
      repPhone: auth.rep.phone,
      repReplyToEmail: repReplyTo,
    })
    const emailedOk = emailResult && (emailResult as { ok?: boolean }).ok !== false
    if (emailedOk) {
      emailedTo = email
    } else {
      emailSendError = (emailResult as { error?: string })?.error ?? 'Email send failed'
    }
  }

  // 8. Notify admin (fire-and-forget — failures logged internally).
  notifyWin({
    repName: auth.rep.full_name,
    businessName: business_name,
    contactName: contact_name,
    contactPhone: phone,
    plan,
    commissionAmount: totalAmount,
  }).catch(() => {})

  await admin.from('rep_notifications').insert({
    rep_id: auth.rep.id,
    type: 'commission_updated',
    lead_id: id,
    message: `Commission pending for ${business_name}. Payment link sent to ${email}; admin will activate once paid.`,
  })

  await sendInternalEmail(
    `New deal closed: ${business_name} (${plan} plan)`,
    `
      <h2>New deal closed by ${auth.rep.full_name}</h2>
      <ul>
        <li><strong>Business:</strong> ${escapeHtml(business_name)}</li>
        <li><strong>Plan:</strong> ${plan} (${billingCycle})</li>
        <li><strong>Contact:</strong> ${escapeHtml(contact_name)}</li>
        <li><strong>Phone:</strong> ${escapeHtml(phone)}</li>
        <li><strong>Email:</strong> ${escapeHtml(email)}</li>
        <li><strong>Pending commission:</strong> $${totalAmount}</li>
        <li><strong>Payment link:</strong> ${stripeUrl ? `<a href="${stripeUrl}">${stripeUrl}</a>` : '<em>Not generated — Stripe error</em>'}</li>
        <li><strong>Customer emailed:</strong> ${emailedTo ?? '<em>No — admin to follow up</em>'}</li>
      </ul>
      <p>This deal is in the Admin Onboarding Queue. Activate the client there once payment lands.</p>
    `,
  )

  await admin.from('admin_audit_log').insert({
    admin_email: auth.user.email ?? 'unknown',
    action: 'deal_closed_by_rep',
    business_name,
  })

  return NextResponse.json({
    ok: true,
    lead: updated,
    stripe_url: stripeUrl,
    stripe_error: stripeError,
    emailed_to: emailedTo,
    email_send_error: emailSendError,
  })
}
