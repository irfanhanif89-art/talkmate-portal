import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'

// Vercel cron: runs 1st of month at 11pm UTC = 9am AEST
// Schedule defined in vercel.json: "0 23 1 * *"
export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2025-01-27.acacia' })

  const month = new Date().toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })
  const results = { processed: 0, skipped: 0, failed: 0, total: 0, errors: [] as string[] }

  // Get all partners due for payout
  const { data: partners } = await supabase
    .from('partners')
    .select('*')
    .eq('stripe_onboarding_complete', true)
    .gt('pending_payout', 0)

  results.total = partners?.length ?? 0

  for (const partner of partners ?? []) {
    try {
      const amount = Math.round(partner.pending_payout * 100) // cents

      if (amount < 100) { // Skip payouts under $1
        results.skipped++
        continue
      }

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

      // Log payout record
      await supabase.from('partner_payouts').insert({
        partner_id: partner.id,
        amount: partner.pending_payout,
        stripe_transfer_id: transfer.id,
        status: 'processing',
        payout_month: month,
      })

      // Update partner
      await supabase.from('partners').update({
        payout_status: 'processing',
        last_paid_amount: partner.pending_payout,
        total_earned: (partner.total_earned || 0) + partner.pending_payout,
        pending_payout: 0,
        last_paid_at: new Date().toISOString(),
      }).eq('id', partner.id)

      results.processed++
    } catch (e) {
      results.failed++
      results.errors.push(`Partner ${partner.id}: ${String(e)}`)

      // Mark as failed
      await supabase.from('partners').update({
        payout_status: 'failed',
      }).eq('id', partner.id)
    }
  }

  console.log('[cron/monthly-payouts]', results)
  return NextResponse.json({ success: true, month, ...results, timestamp: new Date().toISOString() })
}
