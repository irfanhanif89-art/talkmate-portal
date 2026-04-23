import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import Stripe from 'stripe'

function getCurrentMonth() {
  return new Date().toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })
}

// POST /api/partners/process-payout
// Called by Make.com for each partner on the 1st of month
export async function POST(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.INTERNAL_API_KEY}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createClient()
  const { partner_id } = await req.json()

  const { data: partner, error: partnerErr } = await supabase
    .from('partners')
    .select('*, auth.users!user_id(email)')
    .eq('id', partner_id)
    .single()

  if (partnerErr || !partner) {
    return NextResponse.json({ error: 'Partner not found' }, { status: 404 })
  }

  if (!partner.stripe_account_id || !partner.stripe_onboarding_complete) {
    return NextResponse.json({ error: 'Partner Stripe account not ready' }, { status: 400 })
  }

  if (partner.pending_payout <= 0) {
    return NextResponse.json({ error: 'No pending payout' }, { status: 400 })
  }

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2025-01-27.acacia' })
    const amount = Math.round(partner.pending_payout * 100) // cents
    const month = getCurrentMonth()

    const transfer = await stripe.transfers.create({
      amount,
      currency: 'aud',
      destination: partner.stripe_account_id,
      description: `TalkMate Partner Payout — ${month}`,
      metadata: {
        partner_id: partner.id,
        payout_month: month,
        referral_count: String(partner.active_referrals),
      },
    })

    // Log the payout
    await supabase.from('partner_payouts').insert({
      partner_id: partner.id,
      amount: partner.pending_payout,
      stripe_transfer_id: transfer.id,
      status: 'processing',
      payout_month: month,
    })

    // Update partner record
    await supabase.from('partners').update({
      payout_status: 'processing',
      last_paid_amount: partner.pending_payout,
      total_earned: (partner.total_earned || 0) + partner.pending_payout,
      pending_payout: 0,
      last_paid_at: new Date().toISOString(),
    }).eq('id', partner.id)

    return NextResponse.json({ success: true, transfer_id: transfer.id, amount: partner.pending_payout, month })
  } catch (err) {
    console.error('Payout error:', err)
    return NextResponse.json({ error: 'Stripe transfer failed', detail: String(err) }, { status: 500 })
  }
}
