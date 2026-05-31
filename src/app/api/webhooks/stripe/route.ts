import { createAdminClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { sendAdminTelegram } from '@/lib/notifications'
import { sendEmail } from '@/lib/resend'
import { planFromStripePriceNickname } from '@/lib/plan'
import { unassignVapiPhone, reassignVapiPhone } from '@/lib/vapi-phone'

async function sendWelcomeEmail(email: string, businessName: string, plan: string) {
  // Session 42 (H10) — plan now flows through planFromStripePriceNickname
  // so the canonical values are 'starter' | 'growth' | 'pro'. Keep the
  // legacy 'professional' branch defensive for any in-flight email from
  // an older write path, but treat 'pro' as the primary modern value.
  const planLabel =
    plan === 'pro' || plan === 'professional' ? 'Pro' :
    plan === 'growth' ? 'Growth' :
    'Starter'
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

  // Session 42 — Stripe webhook idempotency. Stripe retries any event
  // that doesn't return 2xx. Without dedup, every retry re-fires every
  // case in this switch (double cancel emails, plan-sync thrash, multiple
  // Vapi PATCH calls). Atomic insert with PK conflict acts as a lock:
  // first writer wins, retries no-op via the maybeSingle check.
  const { data: alreadyProcessed } = await supabase
    .from('stripe_webhook_events')
    .select('event_id')
    .eq('event_id', event.id)
    .maybeSingle()

  if (alreadyProcessed) {
    return NextResponse.json({ received: true, deduped: true })
  }

  await supabase
    .from('stripe_webhook_events')
    .insert({ event_id: event.id, event_type: event.type })

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session

      // Session 43 — Closed Won payment path. The per-lead Checkout
      // Session generated by /api/sales/leads/[id]/close-and-onboard (or
      // legacy /payment-link) carries client_reference_id = lead.id, so
      // we can attribute payment without email-matching guesswork.
      //
      // Session 51 — payment confirmation NO LONGER auto-approves the
      // rep's commission. Commission stays 'pending' until the admin
      // clicks "Approve & Go Live" on the agent (post full onboarding).
      // We still stamp payment_confirmed_at so the admin queue can show
      // a "Paid — ready for onboarding" badge, and Telegram the admin
      // so they know to action it.
      if (session.client_reference_id) {
        const { data: paidLead } = await supabase
          .from('leads')
          .select('id, business_name, assigned_to')
          .eq('id', session.client_reference_id)
          .maybeSingle()
        if (paidLead) {
          await supabase
            .from('leads')
            .update({ payment_confirmed_at: new Date().toISOString() })
            .eq('id', paidLead.id)
          await supabase.from('lead_activities').insert({
            lead_id: paidLead.id,
            rep_id: paidLead.assigned_to,
            activity_type: 'system',
            title: 'Payment confirmed',
            body: `Customer paid via Stripe Checkout (session ${session.id}). Ready for admin to finish onboarding.`,
          })
          if (paidLead.assigned_to) {
            await supabase.from('rep_notifications').insert({
              rep_id: paidLead.assigned_to,
              type: 'commission_updated',
              lead_id: paidLead.id,
              message: `Payment received for ${paidLead.business_name}. Commission stays pending until admin marks the client live.`,
            })
          }
          await sendAdminTelegram(
            `Payment received: ${paidLead.business_name}. Ready for full onboarding in /admin/onboarding-queue.`,
          ).catch(() => {})
        }
      }

      if (session.subscription) {
        const sub = await stripe.subscriptions.retrieve(session.subscription as string)
        const customerId = session.customer as string
        const { data: biz } = await supabase.from('businesses').select('id').eq('stripe_customer_id', customerId).single()
        if (biz) {
          // Session 42 (H10) — use the canonical mapper instead of
          // raw nickname.toLowerCase(), which lets through anything an
          // admin typed into Stripe (e.g. 'Professional' → drift).
          const planName = planFromStripePriceNickname(sub.items.data[0]?.price.nickname)
          await supabase.from('subscriptions').upsert({
            business_id: biz.id,
            stripe_subscription_id: sub.id,
            stripe_customer_id: customerId,
            plan: planName,
            status: sub.status,
            current_period_end: new Date((sub as unknown as { current_period_end: number }).current_period_end * 1000).toISOString(),
          }, { onConflict: 'stripe_subscription_id' })
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
      const newPlan = planFromStripePriceNickname(sub.items.data[0]?.price.nickname)
      const customerId = sub.customer as string

      // 1. subscriptions row tracks period_end which changes every renewal,
      //    so always write here even if the plan didn't change.
      await supabase.from('subscriptions').update({
        status: sub.status,
        plan: newPlan,
        current_period_end: new Date(subData.current_period_end * 1000).toISOString(),
      }).eq('stripe_subscription_id', sub.id)

      // 2. Session 42 (H10) — compare-and-update businesses.plan. Stripe
      //    fires customer.subscription.updated on every billing-cycle
      //    renewal, so we only Telegram + notify the client when the plan
      //    actually changed. Without this gate, monthly renewals would
      //    spam admin alerts and accumulate noise notification rows.
      const { data: biz } = await supabase
        .from('businesses')
        .select('id, name, plan, vapi_phone_unassigned_at')
        .eq('stripe_customer_id', customerId)
        .maybeSingle()

      if (biz && biz.plan !== newPlan) {
        // Sprint Session 2 — the AI chatbot is a Growth/Pro entitlement. A
        // downgrade to Starter must switch it off so the public widget stops
        // serving (the widget route also enforces plan at read time, this is
        // the belt to that suspenders).
        const planPatch: Record<string, unknown> = { plan: newPlan }
        if (newPlan === 'starter') planPatch.chatbot_enabled = false
        await supabase.from('businesses').update(planPatch).eq('id', biz.id)
        await sendAdminTelegram(
          `Plan change: ${biz.name ?? 'Unknown'} moved from ${biz.plan} to ${newPlan} via Stripe.`,
        ).catch(() => {})
        await supabase.from('notifications').insert({
          business_id: biz.id,
          type: 'plan_changed',
          message: `Your plan has been updated to ${newPlan.charAt(0).toUpperCase() + newPlan.slice(1)}.`,
        })
      }

      // 3. Session 42 (H8) — if subscription is now active and the phone
      //    was previously unassigned (cancel → reactivate path), re-bind
      //    it and flip account_status back to active.
      if (sub.status === 'active' && biz?.vapi_phone_unassigned_at) {
        await reassignVapiPhone(biz.id)
        await supabase
          .from('businesses')
          .update({ account_status: 'active' })
          .eq('id', biz.id)
      }

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

        // Session 42 (H8) — unbind the Vapi phoneNumber so the assistant
        // can no longer answer calls. The assistant body is never touched
        // (no model/voice/tools mutation), so reactivation is a single
        // PATCH back to assistantId via reassignVapiPhone().
        await unassignVapiPhone(biz.id, 'cancelled')

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

  // Session 42 — stamp processed_at so the dedup table doubles as an
  // audit trail of which events finished cleanly.
  await supabase
    .from('stripe_webhook_events')
    .update({ processed_at: new Date().toISOString() })
    .eq('event_id', event.id)

  return NextResponse.json({ received: true })
}
