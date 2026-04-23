import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET /api/partners/me — returns current user's partner record + referrals + payouts
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: partner } = await supabase
    .from('partners')
    .select('*')
    .eq('user_id', user.id)
    .single()

  if (!partner) return NextResponse.json({ partner: null })

  const { data: referrals } = await supabase
    .from('referrals')
    .select('*')
    .eq('partner_id', partner.id)
    .order('created_at', { ascending: false })

  const { data: payouts } = await supabase
    .from('partner_payouts')
    .select('*')
    .eq('partner_id', partner.id)
    .order('created_at', { ascending: false })
    .limit(12)

  // Leaderboard — top 10 partners by pending_payout this month
  const { data: leaderboard } = await supabase
    .from('partners')
    .select('id, referral_slug, active_referrals, pending_payout, tier')
    .eq('stripe_onboarding_complete', true)
    .order('pending_payout', { ascending: false })
    .limit(10)

  return NextResponse.json({ partner, referrals: referrals ?? [], payouts: payouts ?? [], leaderboard: leaderboard ?? [] })
}
