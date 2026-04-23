import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET /api/partners/payout-due
// Returns all partners with pending_payout > 0 and stripe onboarding complete
// Used by Make.com on the 1st of each month
export async function GET(req: Request) {
  // Simple API key auth for Make.com
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.INTERNAL_API_KEY}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createClient()

  const { data: partners, error } = await supabase
    .from('partners')
    .select(`
      id,
      user_id,
      referral_slug,
      stripe_account_id,
      tier,
      active_referrals,
      pending_payout,
      total_earned
    `)
    .eq('stripe_onboarding_complete', true)
    .gt('pending_payout', 0)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ partners: partners ?? [] })
}
