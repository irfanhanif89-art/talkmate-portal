// Session 4B Phase C — current business referral link + stats.
// GET, cookie/admin/Bearer auth.
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { resolveBusinessId } from '@/lib/resolve-business'
import { getOrCreateReferralCode } from '@/lib/referral'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const resolved = await resolveBusinessId(url.searchParams.get('adminClientId'), req)
  if (!resolved.ok) return NextResponse.json({ ok: false, error: resolved.error }, { status: resolved.status })

  const admin = createAdminClient()
  const code = await getOrCreateReferralCode(resolved.businessId, admin)

  const [{ count: referred }, { count: credits }] = await Promise.all([
    admin.from('businesses').select('id', { count: 'exact', head: true }).eq('referred_by', resolved.businessId),
    admin.from('referral_codes').select('id', { count: 'exact', head: true })
      .eq('business_id', resolved.businessId).eq('credit_applied', true),
  ])

  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.talkmate.com.au'
  return NextResponse.json({
    ok: true,
    code,
    link: `${base}/refer/${code}`,
    referredCount: referred ?? 0,
    creditsEarned: credits ?? 0,
  })
}
