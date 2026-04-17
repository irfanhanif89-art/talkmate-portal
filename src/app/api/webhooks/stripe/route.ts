import { createAdminClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2025-01-27.acacia' })

export async function POST(request: NextRequest) {
  const body = await request.text()
  const sig = request.headers.get('stripe-signature') || ''

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET || '')
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const supabase = await createAdminClient()

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      if (session.subscription) {
        const sub = await stripe.subscriptions.retrieve(session.subscription as string)
        const customerId = session.customer as string
        const { data: biz } = await supabase.from('businesses').select('id').eq('stripe_customer_id', customerId).single()
        if (biz) {
          await supabase.from('subscriptions').upsert({
            business_id: biz.id,
            stripe_subscription_id: sub.id,
            stripe_customer_id: customerId,
            plan: (sub.items.data[0]?.price.nickname || 'starter').toLowerCase(),
            status: sub.status,
            current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
          }, { onConflict: 'stripe_subscription_id' })
          await supabase.from('businesses').update({ plan: (sub.items.data[0]?.price.nickname || 'starter').toLowerCase() }).eq('id', biz.id)
        }
      }
      break
    }
    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription
      await supabase.from('subscriptions').update({
        status: sub.status,
        plan: (sub.items.data[0]?.price.nickname || 'starter').toLowerCase(),
        current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
      }).eq('stripe_subscription_id', sub.id)
      break
    }
    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription
      await supabase.from('subscriptions').update({ status: 'cancelled' }).eq('stripe_subscription_id', sub.id)
      break
    }
    case 'invoice.payment_succeeded': {
      const invoice = event.data.object as Stripe.Invoice
      const customerId = invoice.customer as string
      const { data: biz } = await supabase.from('businesses').select('id').eq('stripe_customer_id', customerId).single()
      if (biz) {
        await supabase.from('notifications').insert({ business_id: biz.id, type: 'payment_success', message: `✅ Payment successful: $${((invoice.amount_paid || 0) / 100).toFixed(2)} AUD` })
      }
      break
    }
    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice
      const customerId = invoice.customer as string
      const { data: biz } = await supabase.from('businesses').select('id').eq('stripe_customer_id', customerId).single()
      if (biz) {
        await supabase.from('notifications').insert({ business_id: biz.id, type: 'payment_failed', message: `❌ Payment failed — please update your billing details` })
        if (invoice.subscription) await supabase.from('subscriptions').update({ status: 'past_due' }).eq('stripe_subscription_id', invoice.subscription as string)
      }
      break
    }
  }

  return NextResponse.json({ received: true })
}
