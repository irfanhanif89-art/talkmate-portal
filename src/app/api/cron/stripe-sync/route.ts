import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createAdminClient } from '@/lib/supabase/server'
import { verifyCron } from '@/lib/cron-auth'
import { sendInternalAlert } from '@/lib/alerts'
import { planFromStripePriceNickname } from '@/lib/plan'

// Brief Part 12. Runs every 15 minutes (vercel.json).
// Reconciles Stripe subscriptions with Supabase — protects against missed webhooks.
export async function GET(req: Request) {
  const guard = verifyCron(req); if (guard) return guard
  if (!process.env.STRIPE_SECRET_KEY) return NextResponse.json({ ok: false, error: 'STRIPE_SECRET_KEY missing' }, { status: 500 })

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2026-03-25.dahlia' as Stripe.LatestApiVersion })
  const supabase = createAdminClient()
  const stats = { reviewed: 0, activated: 0, planFixed: 0, errors: [] as string[] }

  try {
    const subs = await stripe.subscriptions.list({ status: 'active', limit: 100 })
    for (const sub of subs.data) {
      stats.reviewed++
      try {
        const customerId = sub.customer as string
        const { data: business } = await supabase.from('businesses').select('id, plan, onboarding_completed').eq('stripe_customer_id', customerId).maybeSingle()
        if (!business) continue

        // Has a sub row?
        const { data: existingSub } = await supabase.from('subscriptions').select('id, status, plan').eq('stripe_subscription_id', sub.id).maybeSingle()
        if (!existingSub) {
          await supabase.from('subscriptions').insert({
            business_id: business.id,
            stripe_subscription_id: sub.id,
            stripe_customer_id: customerId,
            plan: planFromStripePriceNickname(sub.items.data[0]?.price.nickname),
            status: sub.status,
            current_period_end: new Date((sub as unknown as { current_period_end: number }).current_period_end * 1000).toISOString(),
          })
          stats.activated++
          await sendInternalAlert(supabase, {
            type: 'stripe_sync_mismatch',
            businessId: business.id,
            severity: 'warning',
            message: `Auto-activated subscription for business ${business.id} (webhook missed)`,
          })
        }

        // Reconcile plan name
        const planFromStripe = planFromStripePriceNickname(sub.items.data[0]?.price.nickname)
        if (planFromStripe && planFromStripe !== business.plan) {
          await supabase.from('businesses').update({ plan: planFromStripe }).eq('id', business.id)
          stats.planFixed++
        }
      } catch (e) {
        stats.errors.push(`${sub.id}: ${(e as Error).message}`)
      }
    }
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, ...stats, ranAt: new Date().toISOString() })
}
