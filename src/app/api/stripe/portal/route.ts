import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import Stripe from 'stripe'

export async function POST() {
  // STRIPE_SECRET_KEY is required. The previous `|| 'sk_placeholder'`
  // fallback let the module construct a Stripe client with a junk
  // secret, which then 401'd against Stripe with a confusing error.
  // Fail loudly instead so the operator sees the missing env.
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: 'STRIPE_SECRET_KEY not configured' }, { status: 500 })
  }
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2026-03-25.dahlia' })
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: biz } = await supabase.from('businesses').select('id').eq('owner_user_id', user.id).single()
  if (!biz) return NextResponse.json({ error: 'Business not found' }, { status: 404 })

  const { data: sub } = await supabase.from('subscriptions').select('stripe_customer_id').eq('business_id', biz.id).single()
  if (!sub?.stripe_customer_id) return NextResponse.json({ error: 'No Stripe customer found' }, { status: 404 })

  const session = await stripe.billingPortal.sessions.create({
    customer: sub.stripe_customer_id,
    return_url: `${process.env.NEXT_PUBLIC_APP_URL}/billing`,
  })

  return NextResponse.json({ url: session.url })
}
