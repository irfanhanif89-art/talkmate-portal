import { createAdminClient, createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'

const PLAN_PRICE_MAP: Record<string, string | undefined> = {
  starter: process.env.STRIPE_PRICE_STARTER,
  professional: process.env.STRIPE_PRICE_PROFESSIONAL,
  growth: process.env.STRIPE_PRICE_GROWTH,
}

export async function GET(request: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.talkmate.com.au'

  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.redirect(`${appUrl}/subscribe?error=stripe_not_configured`)
  }

  const planName = (request.nextUrl.searchParams.get('plan') ?? '').toLowerCase()
  const priceId = PLAN_PRICE_MAP[planName]
  if (!priceId) {
    return NextResponse.redirect(`${appUrl}/subscribe?error=invalid_plan`)
  }

  // Auth via cookie — this is a server-side GET request, cookies are always available
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.redirect(`${appUrl}/login`)
  }

  const admin = await createAdminClient()

  // Fetch business row
  let { data: biz } = await admin
    .from('businesses')
    .select('id, stripe_customer_id')
    .eq('owner_user_id', user.id)
    .single()

  if (!biz) {
    const defaultName = user.email?.split('@')[0] ?? 'My Business'
    const { data: newBiz } = await admin
      .from('businesses')
      .upsert({ name: defaultName, owner_user_id: user.id }, { onConflict: 'owner_user_id' })
      .select('id, stripe_customer_id')
      .single()
    if (!newBiz) return NextResponse.redirect(`${appUrl}/subscribe?error=business_error`)
    biz = newBiz
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2026-03-25.dahlia' })

  // Get or create Stripe customer
  let customerId: string = (biz as { id: string; stripe_customer_id?: string }).stripe_customer_id ?? ''
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email ?? undefined,
      metadata: { business_id: biz.id, supabase_user_id: user.id },
    })
    customerId = customer.id
    await admin.from('businesses').update({ stripe_customer_id: customerId }).eq('id', biz.id)
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${appUrl}/onboarding?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/subscribe`,
  })

  return NextResponse.redirect(session.url!)
}
