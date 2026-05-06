import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin-auth'
import { postEmailTrigger } from '@/lib/make-webhook'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const { id } = await params
  if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const reason = body.reason ? String(body.reason).trim() : ''
  const send_pause_offer = body.send_pause_offer === true

  const admin = createAdminClient()

  const { data: business } = await admin.from('businesses')
    .select('id, name, owner_user_id, stripe_customer_id')
    .eq('id', id).single()
  if (!business) return NextResponse.json({ ok: false, error: 'Business not found' }, { status: 404 })

  // Cancel any active Stripe subscription for this business.
  const { data: subs } = await admin.from('subscriptions')
    .select('stripe_subscription_id, status')
    .eq('business_id', id)

  if (process.env.STRIPE_SECRET_KEY) {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2026-03-25.dahlia' })
    for (const sub of subs ?? []) {
      if (sub.status === 'active' || sub.status === 'trialing' || sub.status === 'past_due') {
        try {
          await stripe.subscriptions.cancel(sub.stripe_subscription_id)
          await admin.from('subscriptions').update({ status: 'cancelled' })
            .eq('stripe_subscription_id', sub.stripe_subscription_id)
        } catch (e) {
          // Fall through — even if Stripe fails, mark the business cancelled.
          console.error('Stripe cancel failed', e)
        }
      }
    }
  }

  await admin.from('businesses').update({ account_status: 'cancelled' }).eq('id', id)

  await admin.from('client_admin_notes').insert({
    business_id: id,
    note: `Account cancelled by admin.${reason ? ` Reason: ${reason}` : ''}`,
  })

  if (send_pause_offer) {
    const { data: owner } = await admin.from('users').select('email')
      .eq('id', business.owner_user_id).single()
    if (owner?.email) {
      await postEmailTrigger({
        event: 'subscription_cancelled',
        businessId: id,
        email: owner.email,
        data: {
          type: 'pause_offer',
          business_name: business.name,
          reason,
          from_name: 'Irfan from TalkMate',
          from_email: 'hello@talkmate.com.au',
        },
      }).catch(() => {})
    }
  }

  return NextResponse.json({ ok: true })
}
