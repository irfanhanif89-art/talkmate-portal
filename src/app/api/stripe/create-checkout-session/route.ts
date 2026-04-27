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
  const admin = await createAdminClient()

  // Accept auth via Bearer token (sent by client) OR cookie session
  const authHeader = request.headers.get('authorization') ?? ''
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null

  let user: import('@supabase/supabase-js').User | null = null

  if (bearerToken) {
    const { data } = await admin.auth.getUser(bearerToken)
    user = data.user ?? null
  } else {
    const supabase = await createClient()
    const { data } = await supabase.auth.getUser()
    user = data.user ?? null
  }

  if (!user) {
    console.error('[checkout] No user — unauthorized')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const planName: string = ((body as Record<string, string>).planName ?? '').toLowerCase()
  const priceId = PLAN_PRICE_MAP[planName]

  if (!priceId) {
    return NextResponse.json(
      { error: `Price ID for plan "${planName}" is not configured. Set STRIPE_PRICE_${planName.toUpperCase()} in your environment.` },
      { status: 500 }
    )
  }

  // Fetch business row using admin client (bypasses RLS)
  let { data: biz, error: bizLookupError } = await admin
    .from('businesses')
    .select('id, stripe_customer_id')
    .eq('owner_user_id', user.id)
    .single()

  if (bizLookupError) {
    console.error('[checkout] Business lookup error for user', user.id, ':', bizLookupError)
  }

  // Fallback: business row not returned (lookup error or genuinely missing)
  if (!biz) {
    // Try upsert — if a row already exists (unique constraint on owner_user_id) it returns the existing row
    const defaultName = user.email?.split('@')[0] ?? 'My Business'
    console.info('[checkout] Business lookup returned null for user', user.id, '— upserting:', defaultName)

    const { data: upsertBiz, error: upsertError } = await admin
      .from('businesses')
      .upsert({ name: defaultName, owner_user_id: user.id }, { onConflict: 'owner_user_id', ignoreDuplicates: false })
      .select('id, stripe_customer_id')
      .single()

    if (upsertError || !upsertBiz) {
      // Final fallback: just re-fetch — maybe the row exists and upsert failed due to permissions
      console.error('[checkout] Upsert failed, re-fetching:', upsertError)
      const { data: refetch } = await admin.from('businesses').select('id, stripe_customer_id').eq('owner_user_id', user.id).single()
      if (!refetch) {
        return NextResponse.json(
          { error: 'Business not found and could not be created', detail: upsertError?.message },
          { status: 404 }
        )
      }
      biz = refetch
    } else {
      biz = upsertBiz
    }
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
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${appUrl}/onboarding?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/subscribe`,
  })

  return NextResponse.json({ url: session.url })
}
