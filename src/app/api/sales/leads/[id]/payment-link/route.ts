// Session 43 — Per-lead Stripe Checkout Session generator.
//
// Replaces the original brief's reusable-payment-link approach. Each
// won deal gets a unique Stripe Checkout Session with
// client_reference_id = lead.id so the webhook (in /api/webhooks/stripe
// `checkout.session.completed`) can credit the closing rep's commission
// without depending on email matching.
//
// Idempotent on regenerate: if leads.stripe_payment_link is already
// set, we still create a fresh session (customer may have lost the
// link). Stripe sessions live for 24h; both sessions share the same
// client_reference_id so webhook attribution is unaffected.

import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createAdminClient } from '@/lib/supabase/server'
import { requireSalesRep } from '@/lib/sales-auth'
import { getRecurringPriceId, getSetupPriceId, isPricingPlan } from '@/lib/pricing'
import { isBillingCycle } from '@/lib/commission'

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireSalesRep()
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const { id: leadId } = await ctx.params

  const admin = createAdminClient()
  const { data: lead } = await admin
    .from('leads')
    .select('id, assigned_to, business_name, contact_name, email, status, won_plan, won_billing_cycle')
    .eq('id', leadId)
    .maybeSingle()

  if (!lead) {
    return NextResponse.json({ ok: false, error: 'Lead not found' }, { status: 404 })
  }
  if (lead.assigned_to !== auth.rep.id) {
    return NextResponse.json({ ok: false, error: 'Not your lead' }, { status: 403 })
  }
  if (lead.status !== 'won') {
    return NextResponse.json({ ok: false, error: 'Lead must be marked won first' }, { status: 400 })
  }
  if (!isPricingPlan(lead.won_plan)) {
    return NextResponse.json({ ok: false, error: 'Lead has no valid plan' }, { status: 400 })
  }
  const billingCycle = isBillingCycle(lead.won_billing_cycle) ? lead.won_billing_cycle : 'monthly'

  const recurringPriceId = getRecurringPriceId(lead.won_plan, billingCycle)
  const setupPriceId = getSetupPriceId(lead.won_plan)
  if (!recurringPriceId) {
    return NextResponse.json(
      { ok: false, error: `Stripe price ID not configured for ${lead.won_plan} ${billingCycle}` },
      { status: 500 },
    )
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY
  if (!stripeKey) {
    return NextResponse.json({ ok: false, error: 'Stripe not configured' }, { status: 500 })
  }
  const stripe = new Stripe(stripeKey, { apiVersion: '2026-03-25.dahlia' })

  const lineItems: Array<{ price: string; quantity: number }> = [
    { price: recurringPriceId, quantity: 1 },
  ]
  if (setupPriceId) {
    lineItems.push({ price: setupPriceId, quantity: 1 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.talkmate.com.au'

  let session: Stripe.Checkout.Session
  try {
    session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: lineItems,
      client_reference_id: lead.id,
      customer_email: lead.email ?? undefined,
      metadata: {
        lead_id: lead.id,
        rep_id: auth.rep.id,
        plan: lead.won_plan,
        billing_cycle: billingCycle,
      },
      subscription_data: {
        metadata: {
          lead_id: lead.id,
          rep_id: auth.rep.id,
        },
      },
      success_url: `${appUrl}/payment-success?lead=${lead.id}`,
      cancel_url: `${appUrl}/payment-success?lead=${lead.id}&cancelled=1`,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: `Stripe session creation failed: ${msg}` }, { status: 502 })
  }

  if (!session.url) {
    return NextResponse.json({ ok: false, error: 'Stripe returned no checkout URL' }, { status: 502 })
  }

  // Persist the URL on the lead for future reference and re-display.
  await admin
    .from('leads')
    .update({
      stripe_payment_link: session.url,
      stripe_payment_link_created_at: new Date().toISOString(),
    })
    .eq('id', leadId)

  return NextResponse.json({ ok: true, url: session.url })
}
