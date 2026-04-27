import { createAdminClient, createClient } from '@/lib/supabase/server'
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

  // Use the cookie-based client only to verify the session; use the admin client
  // (service role) for all DB reads/writes so RLS never blocks the lookup.
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

  const admin = await createAdminClient()

  let { data: biz } = await admin
    .from('businesses')
    .select('id, stripe_customer_id')
    .eq('owner_user_id', user.id)
    .single()

  // Fallback: business row missing (e.g. register failed mid-flight). Auto-create
  // it from whatever auth metadata we have so the user isn't permanently stuck.
  if (!biz) {
    const meta = (user.user_metadata ?? {}) as Record<string, string>
    const defaultName = meta.business_name
      ?? (meta.first_name ? `${meta.first_name}'s Business` : (user.email?.split('@')[0] ?? 'My Business'))

    const { data: newBiz, error: createError } = await admin
      .from('businesses')
      .insert({
        name: defaultName,
        business_type: meta.business_type ?? 'other',
        owner_user_id: user.id,
      })
      .select('id, stripe_customer_id')
      .single()

    if (createError || !newBiz) {
      return NextResponse.json({ error: 'Business not found and could not be created' }, { status: 404 })
    }

    biz = newBiz
  }

  // Get or create a Stripe customer so the webhook can look up the business
  let customerId: string = (biz as { id: string; stripe_customer_id?: string }).stripe_customer_id ?? ''
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email ?? undefined,
      metadata: { business_id: biz.id, supabase_user_id: user.id },
    })
    customerId = customer.id
    // Save customer ID so the webhook (businesses.stripe_customer_id lookup) can find this business
    await admin
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
