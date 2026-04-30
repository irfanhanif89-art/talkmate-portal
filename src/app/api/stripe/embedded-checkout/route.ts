import { createAdminClient, createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'

const PLAN_PRICE_MAP: Record<string, string | undefined> = {
  starter: process.env.STRIPE_PRICE_STARTER,
  growth: process.env.STRIPE_PRICE_GROWTH,
  pro: process.env.STRIPE_PRICE_PROFESSIONAL,
}

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
  const planKey: string = ((body as Record<string, string>).planKey ?? '').toLowerCase()
  const priceId = PLAN_PRICE_MAP[planKey]

  if (!priceId) {
    return NextResponse.json(
      { error: `Price ID for plan "${planKey}" is not configured. Set STRIPE_PRICE_${planKey.toUpperCase()} in your environment.` },
      { status: 400 }
    )
  }

  // Find business using admin client (bypasses RLS); user may have multiple, take the first
  const { data: biz } = await admin
    .from('businesses')
    .select('id, stripe_customer_id')
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

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.talkmate.com.au'

  const session = await stripe.checkout.sessions.create({
    ui_mode: 'embedded_page',
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    return_url: `${appUrl}/dashboard?checkout=success`,
  })

  if (!session.client_secret) {
    return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 })
  }

  return NextResponse.json({ clientSecret: session.client_secret })
}
