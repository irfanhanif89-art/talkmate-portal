import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'

const PLAN_PRICE_MAP: Record<string, string | undefined> = {
  starter: process.env.STRIPE_PRICE_STARTER,
  professional: process.env.STRIPE_PRICE_PROFESSIONAL,
  growth: process.env.STRIPE_PRICE_GROWTH,
}

export async function POST(request: NextRequest) {
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: 'Stripe is not configured' }, { status: 500 })
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2026-03-25.dahlia' })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const planName: string = (body.planName ?? '').toLowerCase()
  const priceId = PLAN_PRICE_MAP[planName]

  if (!priceId) {
    return NextResponse.json(
      { error: `Price ID for plan "${planName}" is not configured. Set STRIPE_PRICE_${planName.toUpperCase()} in your environment.` },
      { status: 500 }
    )
  }

  const { data: biz } = await supabase
    .from('businesses')
    .select('id, stripe_customer_id')
    .eq('owner_user_id', user.id)
    .single()

  if (!biz) return NextResponse.json({ error: 'Business not found' }, { status: 404 })

  // Get or create a Stripe customer so the webhook can look up the business
  let customerId: string = (biz as { id: string; stripe_customer_id?: string }).stripe_customer_id ?? ''
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email ?? undefined,
      metadata: { business_id: biz.id, supabase_user_id: user.id },
    })
    customerId = customer.id
    // Save customer ID so the webhook (businesses.stripe_customer_id lookup) can find this business
    await supabase
      .from('businesses')
      .update({ stripe_customer_id: customerId } as Record<string, string>)
      .eq('id', biz.id)
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${appUrl}/onboarding?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/subscribe`,
  })

  return NextResponse.json({ url: session.url })
}
