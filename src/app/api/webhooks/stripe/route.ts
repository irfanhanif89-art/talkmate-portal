import { createAdminClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'

async function sendWelcomeEmail(email: string, businessName: string, plan: string) {
  const planLabel = plan === 'professional' ? 'Professional' : plan === 'growth' ? 'Growth' : 'Starter'
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY || 're_hH6pbyrr_BgLjFBZyiHwaErEyibPgtVpm'}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'TalkMate <hello@talkmate.com.au>',
        to: email,
        subject: `Welcome to TalkMate — let's get ${businessName} live`,
        html: `
          <div style="font-family: 'Outfit', sans-serif; max-width: 560px; margin: 0 auto; background: #061322; color: white; padding: 40px; border-radius: 16px;">
            <div style="margin-bottom: 28px;">
              <span style="font-size: 28px; font-weight: 800; color: white;">Talk</span><span style="font-size: 18px; font-weight: 300; color: #4A9FE8; letter-spacing: 4px;">Mate</span>
            </div>
            <h1 style="font-size: 28px; font-weight: 800; color: white; margin-bottom: 12px; line-height: 1.2;">You're in. Let's get you live.</h1>
            <p style="font-size: 16px; color: rgba(255,255,255,0.7); line-height: 1.7; margin-bottom: 8px;">
              Welcome to TalkMate ${planLabel}, <strong style="color: white;">${businessName}</strong>.
            </p>
            <p style="font-size: 16px; color: rgba(255,255,255,0.7); line-height: 1.7; margin-bottom: 32px;">
              Your AI receptionist is ready to be configured. Complete your setup in the portal and you can be live answering calls within 24 hours.
            </p>
            <a href="https://app.talkmate.com.au/onboarding" style="display: inline-block; background: #E8622A; color: white; font-size: 16px; font-weight: 700; padding: 16px 32px; border-radius: 10px; text-decoration: none; margin-bottom: 32px;">
              Complete Your Setup →
            </a>
            <div style="background: rgba(255,255,255,0.05); border-radius: 12px; padding: 24px; margin-bottom: 28px;">
              <p style="font-size: 14px; font-weight: 700; color: white; margin-bottom: 12px;">What happens next:</p>
              <div style="font-size: 14px; color: rgba(255,255,255,0.65); line-height: 2;">
                ✓ Complete your business setup (5 minutes)<br/>
                ✓ We configure your AI agent with your menu &amp; details<br/>
                ✓ Set up call forwarding on your existing number<br/>
                ✓ Go live — every call answered from that moment on
              </div>
            </div>
            <p style="font-size: 13px; color: rgba(255,255,255,0.35);">
              Questions? Reply to this email — we're a real team on the Gold Coast and we actually respond.
            </p>
          </div>
        `,
      }),
    })
  } catch (e) {
    console.error('Welcome email failed:', e)
  }
}

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
          const planName = (sub.items.data[0]?.price.nickname || 'starter').toLowerCase()
          await supabase.from('businesses').update({ plan: planName }).eq('id', biz.id)
          // Send welcome email
          const { data: owner } = await supabase.from('users').select('email').eq('id',
            (await supabase.from('businesses').select('owner_user_id').eq('id', biz.id).single()).data?.owner_user_id
          ).single()
          const { data: bizDetails } = await supabase.from('businesses').select('name').eq('id', biz.id).single()
          if (owner?.email && bizDetails?.name) {
            await sendWelcomeEmail(owner.email, bizDetails.name, planName)
          }
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
