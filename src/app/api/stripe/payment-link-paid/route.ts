import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createAdminClient } from '@/lib/supabase/server'
import { postEmailTrigger } from '@/lib/make-webhook'

// Stripe webhook for the admin-generated payment links. Wired to
// /api/stripe/payment-link-paid in the Stripe dashboard, listening for
// checkout.session.completed. The signing secret is intentionally
// separate from STRIPE_WEBHOOK_SECRET so the existing /api/webhooks/stripe
// endpoint and this one can each verify their own deliveries.
export async function POST(request: NextRequest) {
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 500 })
  }
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2026-03-25.dahlia' })

  const sig = request.headers.get('stripe-signature') || ''
  const body = await request.text()
  const secret = process.env.STRIPE_PAYMENT_LINK_WEBHOOK_SECRET

  let event: Stripe.Event
  try {
    if (!secret) throw new Error('STRIPE_PAYMENT_LINK_WEBHOOK_SECRET missing')
    event = stripe.webhooks.constructEvent(body, sig, secret)
  } catch (e) {
    return NextResponse.json({ error: `Invalid signature: ${(e as Error).message}` }, { status: 400 })
  }

  if (event.type !== 'checkout.session.completed') {
    return NextResponse.json({ received: true, ignored: event.type })
  }

  const session = event.data.object as Stripe.Checkout.Session
  if (!session.payment_link) {
    return NextResponse.json({ received: true, ignored: 'no payment_link on session' })
  }

  const supabase = createAdminClient()

  // Lookup by either the payment link id we stashed at generate time, or by
  // payment_link metadata business_id, or by the URL we cached.
  const linkMetadataBusinessId = (session.metadata?.business_id ?? null) as string | null
  let businessId: string | null = linkMetadataBusinessId

  if (!businessId) {
    try {
      const link = await stripe.paymentLinks.retrieve(session.payment_link as string)
      businessId = (link.metadata?.business_id as string | undefined) ?? null
    } catch {}
  }

  if (!businessId) {
    const { data: byId } = await supabase.from('businesses')
      .select('id').eq('stripe_payment_link_id', session.payment_link).maybeSingle()
    businessId = byId?.id ?? null
  }

  if (!businessId) {
    return NextResponse.json({ received: true, error: 'business not found for payment link' }, { status: 200 })
  }

  const { data: business } = await supabase.from('businesses')
    .select('id, name, plan, owner_user_id, welcome_email_sent, stripe_customer_id')
    .eq('id', businessId).single()
  if (!business) {
    return NextResponse.json({ received: true, error: 'business row missing' }, { status: 200 })
  }

  // Activate, persist customer id, and record the subscription if present.
  const customerId = (session.customer as string | null) ?? null
  await supabase.from('businesses').update({
    account_status: 'active',
    ...(customerId ? { stripe_customer_id: customerId } : {}),
  }).eq('id', businessId)

  if (session.subscription && customerId) {
    try {
      const sub = await stripe.subscriptions.retrieve(session.subscription as string)
      const periodEnd = (sub as unknown as { current_period_end?: number }).current_period_end
      await supabase.from('subscriptions').upsert({
        business_id: businessId,
        stripe_subscription_id: sub.id,
        stripe_customer_id: customerId,
        plan: (sub.items.data[0]?.price.nickname || business.plan || 'starter').toLowerCase(),
        status: sub.status,
        current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      }, { onConflict: 'stripe_subscription_id' })
    } catch (e) {
      console.error('subscription upsert failed', e)
    }
  }

  // Welcome email if not already sent — same Make.com route as the create flow.
  if (!business.welcome_email_sent) {
    const { data: owner } = await supabase.from('users').select('email')
      .eq('id', business.owner_user_id).single()
    if (owner?.email) {
      await postEmailTrigger({
        event: 'welcome_post_payment',
        businessId,
        email: owner.email,
        data: {
          type: 'welcome_admin_created',
          to: owner.email,
          business_name: business.name,
          plan: business.plan,
          login_url: 'https://app.talkmate.com.au/login',
          accept_terms_url: 'https://app.talkmate.com.au/accept-terms',
          from_name: 'Irfan from TalkMate',
          from_email: 'hello@talkmate.com.au',
        },
      }).catch(() => {})
      await supabase.from('businesses').update({ welcome_email_sent: true }).eq('id', businessId)
    }
  }

  await supabase.from('client_admin_notes').insert({
    business_id: businessId,
    note: 'Payment received. Account auto-activated.',
  })

  return NextResponse.json({ received: true, businessId })
}
