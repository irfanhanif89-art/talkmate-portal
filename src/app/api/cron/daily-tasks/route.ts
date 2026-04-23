import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Vercel cron: runs daily at 2pm UTC = midnight AEST
// Schedule defined in vercel.json: "0 14 * * *"
// Vercel calls this with a special header — validate it
export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const results = { activated: 0, bonusPaid: 0, earningsAccrued: 0, errors: [] as string[] }

  // ── Step 1: Activate pending referrals (30+ days + 10+ calls) ──────────────
  const { data: pendingReferrals } = await supabase
    .from('referrals')
    .select('*, partners(id, active_referrals, pending_payout, tier_rate, total_referrals)')
    .eq('status', 'pending')

  for (const referral of pendingReferrals ?? []) {
    try {
      const daysSince = Math.floor((Date.now() - new Date(referral.created_at).getTime()) / 86400000)

      // Get call count for referred business
      const { data: biz } = await supabase
        .from('businesses')
        .select('id')
        .eq('owner_user_id', referral.referred_user_id)
        .single()

      const { count: callCount } = await supabase
        .from('calls')
        .select('id', { count: 'exact', head: true })
        .eq('business_id', biz?.id ?? '')

      if (daysSince >= 30 && (callCount ?? 0) >= 10) {
        await supabase.from('referrals').update({
          status: 'active',
          activated_at: new Date().toISOString(),
        }).eq('id', referral.id)

        const partner = referral.partners
        const newActiveCount = (partner.active_referrals || 0) + 1
        let tier = 'starter', tier_rate = 0.15
        if (newActiveCount >= 10) { tier = 'gold'; tier_rate = 0.25 }
        else if (newActiveCount >= 3) { tier = 'silver'; tier_rate = 0.20 }

        await supabase.from('partners').update({
          active_referrals: newActiveCount,
          tier,
          tier_rate,
        }).eq('id', partner.id)

        results.activated++

        // $100 signup bonus
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

  // ── Step 2: Accrue daily earnings for active referrals ──────────────────────
  const { data: activeReferrals } = await supabase
    .from('referrals')
    .select('id, partner_id, monthly_earning')
    .eq('status', 'active')

  // Batch: group by partner to minimise DB writes
  const partnerEarnings: Record<string, number> = {}
  for (const r of activeReferrals ?? []) {
    partnerEarnings[r.partner_id] = (partnerEarnings[r.partner_id] || 0) + (r.monthly_earning || 0) / 30
  }

  for (const [partnerId, dailyEarning] of Object.entries(partnerEarnings)) {
    try {
      const { data: partner } = await supabase
        .from('partners')
        .select('pending_payout')
        .eq('id', partnerId)
        .single()

      if (partner) {
        await supabase.from('partners').update({
          pending_payout: (partner.pending_payout || 0) + dailyEarning,
        }).eq('id', partnerId)
        results.earningsAccrued++
      }
    } catch (e) {
      results.errors.push(`Accrual ${partnerId}: ${String(e)}`)
    }
  }

  console.log('[cron/daily-tasks]', results)
  return NextResponse.json({ success: true, ...results, timestamp: new Date().toISOString() })
}
