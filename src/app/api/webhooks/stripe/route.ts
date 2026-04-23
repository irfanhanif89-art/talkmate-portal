import { createAdminClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'

export async function POST(request: NextRequest) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_placeholder', { apiVersion: '2026-03-25.dahlia' })
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
            current_period_end: new Date((sub as unknown as { current_period_end: number }).current_period_end * 1000).toISOString(),
          }, { onConflict: 'stripe_subscription_id' })
          await supabase.from('businesses').update({ plan: (sub.items.data[0]?.price.nickname || 'starter').toLowerCase() }).eq('id', biz.id)
        }
      }
      break
    }
    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription
      const subData = sub as unknown as { current_period_end: number }
      await supabase.from('subscriptions').update({
        status: sub.status,
        plan: (sub.items.data[0]?.price.nickname || 'starter').toLowerCase(),
        current_period_end: new Date(subData.current_period_end * 1000).toISOString(),
      }).eq('stripe_subscription_id', sub.id)
      break
    }
    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription
      await supabase.from('subscriptions').update({ status: 'cancelled' }).eq('stripe_subscription_id', sub.id)
      break
    }
    case 'invoice.payment_succeeded': {
      const invoice = event.data.object as Stripe.Invoice & { customer: string; amount_paid: number; subscription?: string }
      const { data: biz } = await supabase.from('businesses').select('id').eq('stripe_customer_id', invoice.customer).single()
      if (biz) {
        await supabase.from('notifications').insert({ business_id: biz.id, type: 'payment_success', message: `✅ Payment successful: $${((invoice.amount_paid || 0) / 100).toFixed(2)} AUD` })
      }
      break
    }
    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice & { customer: string; subscription?: string }
      const { data: biz } = await supabase.from('businesses').select('id').eq('stripe_customer_id', invoice.customer).single()
      if (biz) {
        await supabase.from('notifications').insert({ business_id: biz.id, type: 'payment_failed', message: `❌ Payment failed — please update your billing details` })
        if (invoice.subscription) await supabase.from('subscriptions').update({ status: 'past_due' }).eq('stripe_subscription_id', invoice.subscription)
      }
      break
    }

    // ── Partner / Connect events ──────────────────────────────────────────────
    case 'account.updated': {
      const account = event.data.object as Stripe.Account
      if (account.details_submitted && account.charges_enabled) {
        await supabase
          .from('partners')
          .update({ stripe_onboarding_complete: true, bank_verified: true })
          .eq('stripe_account_id', account.id)
      }
      break
    }
    case 'transfer.created': {
      const transfer = event.data.object as Stripe.Transfer
      await supabase
        .from('partner_payouts')
        .update({ status: 'processing' })
        .eq('stripe_transfer_id', transfer.id)
      break
    }
    case 'transfer.paid': {
      const transfer = event.data.object as Stripe.Transfer
      await supabase
        .from('partner_payouts')
        .update({ status: 'paid', paid_at: new Date().toISOString() })
        .eq('stripe_transfer_id', transfer.id)
      await supabase
        .from('partners')
        .update({ payout_status: 'paid', last_paid_at: new Date().toISOString(), pending_payout: 0 })
        .eq('stripe_account_id', transfer.destination as string)
      break
    }
    case 'transfer.failed': {
      const transfer = event.data.object as Stripe.Transfer & { failure_message?: string }
      await supabase
        .from('partner_payouts')
        .update({ status: 'failed', failure_reason: transfer.failure_message || 'Unknown' })
        .eq('stripe_transfer_id', transfer.id)
      await supabase
        .from('partners')
        .update({ payout_status: 'failed' })
        .eq('stripe_account_id', transfer.destination as string)
      break
    }
  }

  return NextResponse.json({ received: true })
}
