import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2025-01-27.acacia' })

export async function POST() {
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
