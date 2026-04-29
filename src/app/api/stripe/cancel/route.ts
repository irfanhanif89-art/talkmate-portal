import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { postEmailTrigger } from '@/lib/make-webhook'

// POST /api/stripe/cancel
// Body: { reason?: string }
// Cancels the user's subscription at period end. Records the reason and
// sends a Make.com email-trigger event so the cancellation confirmation
// email can be sent through the existing email pipeline.
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  const { data: business } = await supabase
    .from('businesses')
    .select('id, name, plan')
    .eq('owner_user_id', user.id)
    .single()
  if (!business) return NextResponse.json({ ok: false, error: 'Business not found' }, { status: 404 })

  const body = await req.json().catch(() => ({})) as { reason?: string }
  const reason = (body.reason ?? '').trim().slice(0, 1000)

  const admin = createAdminClient()
  const { data: sub } = await admin
    .from('subscriptions')
    .select('stripe_subscription_id, stripe_customer_id, status')
    .eq('business_id', business.id)
    .maybeSingle()

  if (!sub?.stripe_subscription_id || !process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ ok: false, error: 'No active Stripe subscription' }, { status: 404 })
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2026-03-25.dahlia' })
  let cancelAt: number | null = null
  try {
    const updated = await stripe.subscriptions.update(sub.stripe_subscription_id, {
      cancel_at_period_end: true,
      cancellation_details: { comment: reason || undefined },
    })
    cancelAt = updated.current_period_end
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }

  await admin.from('subscriptions').update({
    cancel_at_period_end: true,
    cancellation_reason: reason || null,
    cancellation_requested_at: new Date().toISOString(),
  }).eq('business_id', business.id)

  // Fire-and-forget Make webhook so the cancellation confirmation email
  // goes out through the normal email-trigger pipeline.
  postEmailTrigger({
    event: 'subscription_cancelled',
    userId: user.id,
    businessId: business.id,
    email: user.email ?? '',
    data: {
      businessName: business.name,
      plan: business.plan,
      reason,
      effectiveAt: cancelAt ? new Date(cancelAt * 1000).toISOString() : null,
    },
  }).catch(() => {})

  return NextResponse.json({ ok: true, effectiveAt: cancelAt ? new Date(cancelAt * 1000).toISOString() : null })
}
