import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createAdminClient } from '@/lib/supabase/server'
import { isAdminPlan, PLAN_PRICE_AUD, requireAdmin } from '@/lib/admin-auth'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ ok: false, error: 'STRIPE_SECRET_KEY not configured' }, { status: 500 })
  }

  const { id } = await params
  if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const overridePlan = body.plan ? String(body.plan).toLowerCase() : null

  const admin = createAdminClient()
  const { data: business } = await admin.from('businesses')
    .select('id, name, plan').eq('id', id).single()
  if (!business) return NextResponse.json({ ok: false, error: 'Business not found' }, { status: 404 })

  const planRaw = overridePlan ?? business.plan
  // Normalise legacy 'professional' → 'pro' so the price map matches.
  const plan = planRaw === 'professional' ? 'pro' : planRaw
  if (!isAdminPlan(plan)) {
    return NextResponse.json({ ok: false, error: `Unknown plan: ${planRaw}` }, { status: 400 })
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2026-03-25.dahlia' })

  // Create a one-shot recurring price + payment link. Embedding the
  // business id in metadata so the webhook can find the business when the
  // payment link is paid (we also persist the URL onto the business row).
  const price = await stripe.prices.create({
    currency: 'aud',
    unit_amount: PLAN_PRICE_AUD[plan] * 100,
    recurring: { interval: 'month' },
    product_data: { name: `TalkMate ${plan.charAt(0).toUpperCase() + plan.slice(1)} — ${business.name}` },
    nickname: plan,
    metadata: { business_id: business.id, plan },
  })

  const link = await stripe.paymentLinks.create({
    line_items: [{ price: price.id, quantity: 1 }],
    metadata: { business_id: business.id, plan },
    after_completion: {
      type: 'redirect',
      redirect: { url: 'https://app.talkmate.com.au/login?payment=success' },
    },
  })

  await admin.from('businesses').update({
    stripe_payment_link: link.url,
    stripe_payment_link_id: link.id,
    plan,
  }).eq('id', id)

  await admin.from('client_admin_notes').insert({
    business_id: id,
    note: `Payment link generated for ${plan} plan ($${PLAN_PRICE_AUD[plan]} AUD/mo).`,
  })

  return NextResponse.json({ ok: true, url: link.url, id: link.id })
}
