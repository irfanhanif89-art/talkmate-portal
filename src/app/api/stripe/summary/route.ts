import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@/lib/supabase/server'

// GET /api/stripe/summary
// Returns plan, payment method, and last 6 invoices for the current user.
// Pulls from Stripe live mode if available; degrades gracefully when there
// is no customer record yet (returns empty fields instead of failing).
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  const { data: business } = await supabase.from('businesses').select('id, plan').eq('owner_user_id', user.id).single()
  if (!business) return NextResponse.json({ ok: false, error: 'Business not found' }, { status: 404 })

  const { data: sub } = await supabase
    .from('subscriptions')
    .select('stripe_customer_id, stripe_subscription_id, status, plan, current_period_end, cancel_at_period_end')
    .eq('business_id', business.id)
    .maybeSingle()

  if (!sub?.stripe_customer_id || !process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({
      ok: true,
      hasStripe: false,
      plan: business.plan ?? 'starter',
      paymentMethod: null,
      invoices: [],
      subscription: null,
    })
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2026-03-25.dahlia' })

  let paymentMethod: { last4: string; brand: string; exp_month: number; exp_year: number } | null = null
  try {
    const customer = await stripe.customers.retrieve(sub.stripe_customer_id, { expand: ['invoice_settings.default_payment_method'] }) as Stripe.Customer & {
      invoice_settings?: { default_payment_method?: Stripe.PaymentMethod | null | string }
    }
    const pm = customer.invoice_settings?.default_payment_method
    if (pm && typeof pm !== 'string' && pm.card) {
      paymentMethod = { last4: pm.card.last4, brand: pm.card.brand, exp_month: pm.card.exp_month, exp_year: pm.card.exp_year }
    }
  } catch (e) {
    console.error('[stripe summary] customer fetch', e)
  }

  let invoices: Array<{ id: string; amount: number; currency: string; status: string; created: number; hosted_invoice_url: string | null; invoice_pdf: string | null; description: string | null }> = []
  try {
    const list = await stripe.invoices.list({ customer: sub.stripe_customer_id, limit: 6 })
    invoices = list.data.map(inv => ({
      id: inv.id ?? '',
      amount: (inv.amount_paid ?? inv.amount_due ?? 0) / 100,
      currency: inv.currency,
      status: inv.status ?? 'unknown',
      created: inv.created,
      hosted_invoice_url: inv.hosted_invoice_url,
      invoice_pdf: inv.invoice_pdf,
      description: inv.lines?.data?.[0]?.description ?? null,
    }))
  } catch (e) {
    console.error('[stripe summary] invoices fetch', e)
  }

  return NextResponse.json({
    ok: true,
    hasStripe: true,
    plan: sub.plan ?? business.plan ?? 'starter',
    paymentMethod,
    invoices,
    subscription: {
      id: sub.stripe_subscription_id,
      status: sub.status,
      current_period_end: sub.current_period_end,
      cancel_at_period_end: sub.cancel_at_period_end ?? false,
    },
  })
}
