import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Session 19 — powers the SMS Usage card on /dashboard.
// Returns sms_used_this_month, the plan-derived cap, the reset date, and
// the plan tier so the card can render either the usage bar (Growth/Pro)
// or an upgrade prompt (Starter).

export const dynamic = 'force-dynamic'

const PLAN_LIMITS: Record<string, number> = {
  starter: 0,
  growth: 200,
  pro: 500,
  professional: 500, // legacy alias
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: biz } = await supabase
    .from('businesses')
    .select('plan, sms_used_this_month, sms_reset_at')
    .eq('owner_user_id', user.id)
    .maybeSingle()
  if (!biz) return NextResponse.json({ error: 'No business' }, { status: 404 })

  const plan = ((biz as { plan?: string | null }).plan ?? 'starter') as string
  const cap = PLAN_LIMITS[plan] ?? 0
  const used = ((biz as { sms_used_this_month?: number }).sms_used_this_month ?? 0) as number
  const resetAt = (biz as { sms_reset_at?: string | null }).sms_reset_at ?? null

  return NextResponse.json({ plan, used, cap, resetAt })
}
