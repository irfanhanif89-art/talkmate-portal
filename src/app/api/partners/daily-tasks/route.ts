import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// POST /api/partners/daily-tasks
// Called by Make.com daily at midnight AEST
// 1. Activates pending referrals (30+ days + 10+ calls)
// 2. Accrues daily earnings for all active referrals
// 3. Pays $100 signup bonus for newly activated referrals

export async function POST(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.INTERNAL_API_KEY}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const results = { activated: 0, bonusPaid: 0, earningsAccrued: 0, errors: [] as string[] }

  // ── Step 1: Activate pending referrals ──────────────────────────────────────
  const { data: pendingReferrals } = await supabase
    .from('referrals')
    .select('*, partners(id, active_referrals, pending_payout, tier_rate, total_referrals)')
    .eq('status', 'pending')

  for (const referral of pendingReferrals ?? []) {
    try {
      const createdAt = new Date(referral.created_at)
      const daysSince = Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24))

      // Check call count for referred user
      const { count: callCount } = await supabase
        .from('calls')
        .select('id', { count: 'exact', head: true })
        .eq('business_id', referral.referred_user_id) // may need join via businesses table

      const calls = callCount ?? 0

      if (daysSince >= 30 && calls >= 10) {
        // Activate referral
        await supabase.from('referrals').update({
          status: 'active',
          activated_at: new Date().toISOString(),
        }).eq('id', referral.id)

        // Update partner active count
        const partner = referral.partners
        await supabase.from('partners').update({
          active_referrals: (partner.active_referrals || 0) + 1,
          total_referrals: (partner.total_referrals || 0),
        }).eq('id', partner.id)

        // Recalculate tier
        const newActiveCount = (partner.active_referrals || 0) + 1
        let tier = 'starter', tier_rate = 0.15
        if (newActiveCount >= 10) { tier = 'gold'; tier_rate = 0.25 }
        else if (newActiveCount >= 3) { tier = 'silver'; tier_rate = 0.20 }
        await supabase.from('partners').update({ tier, tier_rate }).eq('id', partner.id)

        results.activated++

        // Pay $100 signup bonus if not already paid
        if (!referral.signup_bonus_paid) {
          await supabase.from('partners').update({
            pending_payout: (partner.pending_payout || 0) + 100,
          }).eq('id', partner.id)

          await supabase.from('referrals').update({
            signup_bonus_paid: true,
            signup_bonus_paid_at: new Date().toISOString(),
          }).eq('id', referral.id)

          results.bonusPaid++
        }
      }
    } catch (e) {
      results.errors.push(`Referral ${referral.id}: ${String(e)}`)
    }
  }

  // ── Step 2: Accrue daily earnings for active referrals ─────────────────────
  const { data: activeReferrals } = await supabase
    .from('referrals')
    .select('id, partner_id, monthly_earning')
    .eq('status', 'active')

  for (const referral of activeReferrals ?? []) {
    try {
      const dailyEarning = (referral.monthly_earning || 0) / 30

      // Increment partner pending_payout
      const { data: partner } = await supabase
        .from('partners')
        .select('pending_payout')
        .eq('id', referral.partner_id)
        .single()

      if (partner) {
        await supabase.from('partners').update({
          pending_payout: (partner.pending_payout || 0) + dailyEarning,
        }).eq('id', referral.partner_id)

        results.earningsAccrued++
      }
    } catch (e) {
      results.errors.push(`Accrual for referral ${referral.id}: ${String(e)}`)
    }
  }

  return NextResponse.json({
    success: true,
    ...results,
    timestamp: new Date().toISOString(),
  })
}
