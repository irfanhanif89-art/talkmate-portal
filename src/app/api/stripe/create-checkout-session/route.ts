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

  const admin = createAdminClient()

  // Use select('*') — selecting named columns fails if a column doesn't yet exist
  // in the database (PostgREST returns a column-not-found error, silently setting
  // data to null and triggering the fallback unnecessarily).
  let { data: biz, error: bizLookupError } = await admin
    .from('businesses')
    .select('*')
    .eq('owner_user_id', user.id)
    .single()

  if (bizLookupError) {
    console.error('[create-checkout-session] Business lookup error for user', user.id, ':', bizLookupError)
  }

  // Fallback: business row missing (e.g. register failed mid-flight). Auto-create
  // using ONLY user.id and email — no user_metadata dependency.
  if (!biz) {
    const defaultName = user.email?.split('@')[0] ?? 'My Business'

    console.info('[create-checkout-session] No business row for user', user.id, '— auto-creating with name:', defaultName)

    const { data: newBiz, error: createError } = await admin
      .from('businesses')
      .insert({
        name: defaultName,
        owner_user_id: user.id,
      })
      .select('*')
      .single()

    if (createError || !newBiz) {
      console.error('[create-checkout-session] Business auto-create failed for user', user.id, ':', createError)
      return NextResponse.json(
        { error: 'Business not found and could not be created', detail: createError?.message },
        { status: 404 }
      )
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
