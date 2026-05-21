import { createAdminClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { sendAdminTelegram } from '@/lib/notifications'
import { sendEmail } from '@/lib/resend'

async function sendWelcomeEmail(email: string, businessName: string, plan: string) {
  const planLabel = plan === 'professional' ? 'Professional' : plan === 'growth' ? 'Growth' : 'Starter'
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
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

  const supabase = createAdminClient()

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

      // Session 27 (H5) — gate portal access on Stripe-side cancellation.
      const customerId = sub.customer as string
      const { data: biz } = await supabase
        .from('businesses')
        .select('id, name, plan, owner_user_id')
        .eq('stripe_customer_id', customerId)
        .maybeSingle()
      if (biz) {
        await supabase.from('businesses').update({ account_status: 'cancelled' }).eq('id', biz.id)

        // Look up owner email separately because users.email is the canonical
        // source (auth.users may have a different one if it was changed).
        const { data: owner } = await supabase.from('users').select('email, full_name').eq('id', biz.owner_user_id).maybeSingle()
        if (owner?.email) {
          const firstName = (owner.full_name ?? '').split(' ')[0] || 'there'
          const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.talkmate.com.au'
          await sendEmail({
            to: owner.email,
            subject: 'Your TalkMate subscription has been cancelled',
            replyTo: 'hello@talkmate.com.au',
            html: `
              <div style="font-family:'Outfit',sans-serif;max-width:560px;margin:0 auto;background:#061322;color:white;padding:40px;border-radius:16px;">
                <h1 style="font-size:24px;font-weight:800;margin:0 0 14px 0;line-height:1.25;">Your TalkMate subscription has been cancelled.</h1>
                <p style="color:rgba(255,255,255,0.75);line-height:1.7;margin:0 0 18px 0;">
                  Hi ${firstName}, your TalkMate subscription has been cancelled. Your AI receptionist will no longer answer calls.
                </p>
                <p style="color:rgba(255,255,255,0.75);line-height:1.7;margin:0 0 24px 0;">
                  If you cancelled by mistake or want to resubscribe, head over to your pricing page.
                </p>
                <a href="${appUrl}/billing" style="display:inline-block;background:#E8622A;color:white;font-size:15px;font-weight:700;padding:14px 28px;border-radius:10px;text-decoration:none;margin-bottom:24px;">
                  Reactivate
                </a>
                <p style="color:rgba(255,255,255,0.5);font-size:13px;margin:18px 0 0 0;">
                  Your data will be kept for 30 days. After that it will be removed in line with our data retention policy.
                </p>
                <p style="color:rgba(255,255,255,0.5);font-size:13px;margin:14px 0 0 0;">
                  Reply to this email if you have any questions.
                </p>
              </div>
            `,
          })
        }

        await sendAdminTelegram(
          `🔴 Subscription cancelled\nClient: ${biz.name ?? '(unknown)'}\nPlan: ${biz.plan ?? 'unknown'}\nStripe customer: ${customerId}`
        )
      }
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
      const invoice = event.data.object as Stripe.Invoice & { customer: string; subscription?: string; amount_due?: number }
      const { data: biz } = await supabase
        .from('businesses')
        .select('id, name, plan, owner_user_id')
        .eq('stripe_customer_id', invoice.customer)
        .maybeSingle()
      if (biz) {
        await supabase.from('notifications').insert({ business_id: biz.id, type: 'payment_failed', message: `❌ Payment failed — please update your billing details` })
        if (invoice.subscription) await supabase.from('subscriptions').update({ status: 'past_due' }).eq('stripe_subscription_id', invoice.subscription)

        // Session 27 (H3) — email client with a Stripe portal link they can
        // use to update their card, and (H4) Telegram the admin.
        const { data: owner } = await supabase.from('users').select('email, full_name').eq('id', biz.owner_user_id).maybeSingle()
        let portalUrl: string | null = null
        try {
          const portalSession = await stripe.billingPortal.sessions.create({
            customer: invoice.customer,
            return_url: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.talkmate.com.au'}/billing`,
          })
          portalUrl = portalSession.url
        } catch (e) {
          console.error('[stripe webhook] billingPortal.sessions.create failed', e)
        }

        if (owner?.email) {
          const firstName = (owner.full_name ?? '').split(' ')[0] || 'there'
          const amount = ((invoice.amount_due ?? 0) / 100).toFixed(2)
          await sendEmail({
            to: owner.email,
            subject: 'Action required — your TalkMate payment failed',
            replyTo: 'hello@talkmate.com.au',
            html: `
              <div style="font-family:'Outfit',sans-serif;max-width:560px;margin:0 auto;background:#061322;color:white;padding:40px;border-radius:16px;">
                <h1 style="font-size:24px;font-weight:800;margin:0 0 14px 0;line-height:1.25;">Your TalkMate payment failed.</h1>
                <p style="color:rgba(255,255,255,0.75);line-height:1.7;margin:0 0 18px 0;">
                  Hi ${firstName}, your recent payment of $${amount} AUD for TalkMate failed to process.
                </p>
                <p style="color:rgba(255,255,255,0.75);line-height:1.7;margin:0 0 24px 0;">
                  Please update your payment method to keep your AI receptionist active:
                </p>
                ${portalUrl ? `<a href="${portalUrl}" style="display:inline-block;background:#E8622A;color:white;font-size:15px;font-weight:700;padding:14px 28px;border-radius:10px;text-decoration:none;margin-bottom:24px;">Update payment method</a>` : ''}
                <p style="color:rgba(255,255,255,0.5);font-size:13px;margin:18px 0 0 0;">
                  If you need help, reply to this email.
                </p>
                <p style="color:rgba(255,255,255,0.75);font-size:13px;margin:18px 0 0 0;">
                  The TalkMate Team
                </p>
              </div>
            `,
          })
        }

        await sendAdminTelegram(
          `💳 Payment failed\nClient: ${biz.name ?? '(unknown)'}\nAmount: $${((invoice.amount_due ?? 0) / 100).toFixed(2)} AUD\nPlan: ${biz.plan ?? 'unknown'}\nStripe customer: ${invoice.customer}`
        )
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
  }

  // transfer.paid / transfer.failed are not in the Stripe event type enum for
  // this API version but are sent in practice for Connect payouts.
  const eventType = event.type as string
  if (eventType === 'transfer.paid') {
    const transfer = (event as unknown as { data: { object: Stripe.Transfer } }).data.object
    await supabase
      .from('partner_payouts')
      .update({ status: 'paid', paid_at: new Date().toISOString() })
      .eq('stripe_transfer_id', transfer.id)
    await supabase
      .from('partners')
      .update({ payout_status: 'paid', last_paid_at: new Date().toISOString(), pending_payout: 0 })
      .eq('stripe_account_id', transfer.destination as string)
  } else if (eventType === 'transfer.failed') {
    const transfer = (event as unknown as { data: { object: Stripe.Transfer & { failure_message?: string } } }).data.object
    await supabase
      .from('partner_payouts')
      .update({ status: 'failed', failure_reason: transfer.failure_message || 'Unknown' })
      .eq('stripe_transfer_id', transfer.id)
    await supabase
      .from('partners')
      .update({ payout_status: 'failed' })
      .eq('stripe_account_id', transfer.destination as string)
  }

  return NextResponse.json({ received: true })
}
