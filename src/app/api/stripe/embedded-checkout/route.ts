import { createAdminClient, createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import {
  getRecurringPriceId, getSetupPriceId, isBillingCycle, isPricingPlan,
} from '@/lib/pricing'

export async function POST(request: NextRequest) {
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: 'Stripe is not configured' }, { status: 500 })
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2026-03-25.dahlia' })
  const admin = createAdminClient()

  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  const user = data.user ?? null

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const rawPlan = String((body as Record<string, string>).planKey ?? '').toLowerCase()
  const planKey = isPricingPlan(rawPlan) ? rawPlan : null
  // Default to monthly if cycle missing or unknown.
  const billingCycle = isBillingCycle((body as Record<string, string>).billingCycle)
    ? (body as Record<string, string>).billingCycle as 'monthly' | 'annual'
    : 'monthly'

  if (!planKey) {
    return NextResponse.json({ error: 'planKey must be starter, growth, or pro' }, { status: 400 })
  }

  const recurringPriceId = getRecurringPriceId(planKey, billingCycle)
  if (!recurringPriceId) {
    const envVar = billingCycle === 'annual'
      ? `STRIPE_${planKey.toUpperCase()}_ANNUAL_PRICE_ID`
      : `STRIPE_PRICE_${planKey.toUpperCase()}`
    return NextResponse.json(
      { error: `Stripe price ID for ${planKey} ${billingCycle} is not configured. Set ${envVar}.` },
      { status: 500 }
    )
  }

  // Find business — needed for setup-fee waiver lookup.
  const { data: biz } = await admin
    .from('businesses')
    .select('id, stripe_customer_id, setup_fee_waived')
    .eq('owner_user_id', user.id)
    .limit(1)
    .maybeSingle()

  if (!biz) {
    return NextResponse.json({ error: 'Business not found' }, { status: 404 })
  }

  // Get or create Stripe customer
  let customerId: string = (biz as { id: string; stripe_customer_id?: string }).stripe_customer_id ?? ''
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email ?? undefined,
      metadata: { business_id: biz.id, supabase_user_id: user.id },
    })
    customerId = customer.id
    await admin
      .from('businesses')
      .update({ stripe_customer_id: customerId })
      .eq('id', biz.id)
  }

  // Persist the chosen cycle on the business row now so the dashboard
  // can show the right state even before Stripe's webhook fires.
  await admin
    .from('businesses')
    .update({ billing_cycle: billingCycle })
    .eq('id', biz.id)

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.talkmate.com.au'

  // Build line items: recurring subscription + (optional) one-off setup fee.
  // Setup fee is skipped when the admin has flagged setup_fee_waived = true.
  const lineItems: NonNullable<Stripe.Checkout.SessionCreateParams['line_items']> = [
    { price: recurringPriceId, quantity: 1 },
  ]

  const setupPriceId = getSetupPriceId(planKey)
  if (!biz.setup_fee_waived && setupPriceId) {
    lineItems.push({ price: setupPriceId, quantity: 1 })
  }

  const session = await stripe.checkout.sessions.create({
    ui_mode: 'embedded_page',
    mode: 'subscription',
    customer: customerId,
    line_items: lineItems,
    metadata: {
      business_id: biz.id,
      plan: planKey,
      billing_cycle: billingCycle,
      setup_fee_charged: biz.setup_fee_waived ? 'false' : (setupPriceId ? 'true' : 'unconfigured'),
    },
    return_url: `${appUrl}/dashboard?checkout=success`,
  })

  if (!session.client_secret) {
    return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 })
  }

  return NextResponse.json({ clientSecret: session.client_secret })
}
