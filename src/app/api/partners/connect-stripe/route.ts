import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import Stripe from 'stripe'

export async function POST() {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2025-01-27.acacia' })
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Get partner record
    const { data: partner } = await supabase
      .from('partners')
      .select('id, stripe_account_id, stripe_onboarding_complete')
      .eq('user_id', user.id)
      .single()

    if (!partner) return NextResponse.json({ error: 'Partner record not found' }, { status: 404 })

    // If already has a Stripe account, create a new onboarding link (for refresh)
    let accountId = partner.stripe_account_id

    if (!accountId) {
      // Create a new Stripe Express account
      const account = await stripe.accounts.create({
        type: 'express',
        country: 'AU',
        capabilities: {
          transfers: { requested: true },
        },
      })
      accountId = account.id

      // Save account ID
      await supabase
        .from('partners')
        .update({ stripe_account_id: accountId })
        .eq('id', partner.id)
    }

    // Create onboarding link
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `https://app.talkmate.com.au/refer-and-earn?stripe=refresh`,
      return_url: `https://app.talkmate.com.au/refer-and-earn?stripe=complete`,
      type: 'account_onboarding',
    })

    return NextResponse.json({ url: accountLink.url })
  } catch (err) {
    console.error('Stripe connect error:', err)
    return NextResponse.json({ error: 'Failed to create Stripe onboarding link' }, { status: 500 })
  }
}
