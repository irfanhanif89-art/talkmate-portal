// Session 4B Phase B — contextual plan-upgrade prompt. Shows only when the
// estimated monthly ROI consistently dwarfs the plan cost. Prices come from
// src/lib/pricing.ts (never hardcoded). GET + POST(dismiss).
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { resolveBusinessId } from '@/lib/resolve-business'
import { computeRoiForBusiness } from '@/lib/roi'
import { getPlanPrice, isPricingPlan } from '@/lib/pricing'

export const dynamic = 'force-dynamic'

const NEXT_PLAN: Record<string, 'growth' | 'pro' | null> = { starter: 'growth', growth: 'pro', pro: null }
const ADDED_FEATURES: Record<'growth' | 'pro', string[]> = {
  growth: ['Two-way SMS inbox', 'Website chatbot', 'Quote follow-up'],
  pro: ['Outbound quote follow-up', 'Advanced analytics', 'Priority support'],
}

function daysSince(iso: string | null | undefined): number {
  if (!iso) return Infinity
  return (Date.now() - Date.parse(iso)) / 86_400_000
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const resolved = await resolveBusinessId(url.searchParams.get('adminClientId'), req)
  if (!resolved.ok) return NextResponse.json({ ok: false, error: resolved.error }, { status: resolved.status })

  const supabase = createAdminClient()
  const { data: business } = await supabase
    .from('businesses')
    .select('plan, upgrade_prompt_last_shown_at, upgrade_prompt_dismissed_count')
    .eq('id', resolved.businessId)
    .maybeSingle()
  if (!business) return NextResponse.json({ ok: true, show: false })

  const plan = (business.plan as string | null) ?? 'starter'
  const nextPlan = NEXT_PLAN[plan] ?? null
  if (!nextPlan || !isPricingPlan(plan)) return NextResponse.json({ ok: true, show: false })

  // Throttle: not shown in last 7 days; if previously dismissed, not in last 30.
  const lastShown = business.upgrade_prompt_last_shown_at as string | null
  const dismissedCount = (business.upgrade_prompt_dismissed_count as number | null) ?? 0
  if (daysSince(lastShown) < 7) return NextResponse.json({ ok: true, show: false })
  if (dismissedCount > 0 && daysSince(lastShown) < 30) return NextResponse.json({ ok: true, show: false })

  const planCost = getPlanPrice(plan, 'monthly')
  // Use last full month's recovered-revenue estimate as the monthly proxy.
  const roi = await computeRoiForBusiness(supabase, resolved.businessId, 'last_month')
  const monthlyRoi = roi.totalEstimatedRevenue

  if (monthlyRoi <= planCost * 10) return NextResponse.json({ ok: true, show: false })

  return NextResponse.json({
    ok: true,
    show: true,
    currentPlan: plan,
    nextPlan,
    nextPlanCost: getPlanPrice(nextPlan, 'monthly'),
    avgMonthlyRoi: Math.round(monthlyRoi),
    roiMultiple: Math.round(monthlyRoi / planCost),
    additionalFeatures: ADDED_FEATURES[nextPlan],
    upgradeUrl: '/settings/billing',
  })
}

export async function POST(req: Request) {
  const url = new URL(req.url)
  const resolved = await resolveBusinessId(url.searchParams.get('adminClientId'), req)
  if (!resolved.ok) return NextResponse.json({ ok: false, error: resolved.error }, { status: resolved.status })

  const supabase = createAdminClient()
  const { data: cur } = await supabase
    .from('businesses')
    .select('upgrade_prompt_dismissed_count')
    .eq('id', resolved.businessId)
    .maybeSingle()
  const count = ((cur?.upgrade_prompt_dismissed_count as number | null) ?? 0) + 1
  await supabase
    .from('businesses')
    .update({ upgrade_prompt_last_shown_at: new Date().toISOString(), upgrade_prompt_dismissed_count: count })
    .eq('id', resolved.businessId)
  return NextResponse.json({ ok: true })
}
