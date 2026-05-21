import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Session 27 (H1) — onboarding wizard polls this after Stripe redirects
// back from embedded checkout. Returns whether the business's account
// is no longer in 'pending_payment' (i.e. the webhook has fired and
// upgraded them). The wizard polls every 2s for up to 30s.
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const { data: biz } = await supabase
    .from('businesses')
    .select('id, account_status')
    .eq('owner_user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!biz) {
    return NextResponse.json({ ok: false, error: 'Business not found' }, { status: 404 })
  }

  const status = (biz.account_status ?? '').toLowerCase()
  // 'active' is the win state; 'trial' is acceptable for clients who land
  // here without going through pay-now. 'pending_payment' means we're
  // still waiting on the Stripe webhook.
  const paid = status === 'active' || status === 'trial'

  return NextResponse.json({
    ok: true,
    account_status: status,
    paid,
  })
}
