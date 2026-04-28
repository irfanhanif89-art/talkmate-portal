import { NextResponse } from 'next/server'
import { verifyCron } from '@/lib/cron-auth'
import { createAdminClient } from '@/lib/supabase/server'
import { postEmailTrigger } from '@/lib/make-webhook'

// Brief Part 14 — fan out time-based email triggers to Make.com.
// Hourly. Each event has its own dedupe rule so we don't spam.
export async function GET(req: Request) {
  const guard = verifyCron(req); if (guard) return guard

  const supabase = createAdminClient()
  const now = Date.now()
  const HR = 60 * 60 * 1000
  const D = 24 * HR

  function ago(ms: number) { return new Date(now - ms).toISOString() }

  // Helper: businesses signed up in [start, end)
  async function inWindow(startMs: number, endMs: number) {
    return supabase.from('businesses')
      .select('id, name, owner_user_id, plan, onboarding_completed, signup_at, stripe_customer_id')
      .gte('signup_at', ago(endMs)).lt('signup_at', ago(startMs))
  }

  const stats: Record<string, number> = {}

  // 24h abandoned cart — created 24-25h ago, no stripe customer
  const { data: cart24 } = await inWindow(24 * HR, 25 * HR)
  for (const b of (cart24 ?? []).filter(b => !b.stripe_customer_id)) {
    const { data: u } = await supabase.from('users').select('email').eq('id', b.owner_user_id).single()
    if (!u?.email) continue
    await postEmailTrigger({ event: 'abandoned_cart_24h', userId: b.owner_user_id, businessId: b.id, email: u.email, data: { businessName: b.name } })
    stats.abandoned_cart_24h = (stats.abandoned_cart_24h ?? 0) + 1
  }

  // 72h abandoned cart
  const { data: cart72 } = await inWindow(72 * HR, 73 * HR)
  for (const b of (cart72 ?? []).filter(b => !b.stripe_customer_id)) {
    const { data: u } = await supabase.from('users').select('email').eq('id', b.owner_user_id).single()
    if (!u?.email) continue
    await postEmailTrigger({ event: 'abandoned_cart_72h', userId: b.owner_user_id, businessId: b.id, email: u.email, data: { businessName: b.name } })
    stats.abandoned_cart_72h = (stats.abandoned_cart_72h ?? 0) + 1
  }

  // 2h onboarding incomplete (paid, but didn't finish)
  const { data: onb2 } = await inWindow(2 * HR, 3 * HR)
  for (const b of (onb2 ?? []).filter(b => b.stripe_customer_id && !b.onboarding_completed)) {
    const { data: u } = await supabase.from('users').select('email').eq('id', b.owner_user_id).single()
    if (!u?.email) continue
    await postEmailTrigger({ event: 'onboarding_incomplete_2h', userId: b.owner_user_id, businessId: b.id, email: u.email, data: { businessName: b.name } })
    stats.onboarding_incomplete_2h = (stats.onboarding_incomplete_2h ?? 0) + 1
  }

  // Day 7 weekly summary (paid customers with calls)
  const { data: day7 } = await inWindow(7 * D, 7 * D + HR)
  for (const b of day7 ?? []) {
    if (!b.stripe_customer_id) continue
    const { data: u } = await supabase.from('users').select('email').eq('id', b.owner_user_id).single()
    if (!u?.email) continue
    const { count } = await supabase.from('calls').select('id', { count: 'exact', head: true }).eq('business_id', b.id)
    await postEmailTrigger({ event: 'weekly_summary_day7', userId: b.owner_user_id, businessId: b.id, email: u.email, data: { totalCalls: count ?? 0, businessName: b.name } })
    stats.weekly_summary_day7 = (stats.weekly_summary_day7 ?? 0) + 1
  }

  // Day 10 pre-churn signal
  const { data: day10 } = await inWindow(10 * D, 10 * D + HR)
  for (const b of day10 ?? []) {
    if (!b.stripe_customer_id) continue
    const { data: u } = await supabase.from('users').select('email').eq('id', b.owner_user_id).single()
    if (!u?.email) continue
    const { count } = await supabase.from('calls').select('id', { count: 'exact', head: true }).eq('business_id', b.id)
    await postEmailTrigger({ event: 'pre_churn_day10', userId: b.owner_user_id, businessId: b.id, email: u.email, data: { totalCalls: count ?? 0 } })
    stats.pre_churn_day10 = (stats.pre_churn_day10 ?? 0) + 1
  }

  // Day 13 — guarantee expiry
  const { data: day13 } = await inWindow(13 * D, 13 * D + HR)
  for (const b of day13 ?? []) {
    if (!b.stripe_customer_id) continue
    const { data: u } = await supabase.from('users').select('email').eq('id', b.owner_user_id).single()
    if (!u?.email) continue
    await postEmailTrigger({ event: 'guarantee_expiry_day13', userId: b.owner_user_id, businessId: b.id, email: u.email })
    stats.guarantee_expiry_day13 = (stats.guarantee_expiry_day13 ?? 0) + 1
  }

  // Day 30 — month-1 milestone
  const { data: day30 } = await inWindow(30 * D, 30 * D + HR)
  for (const b of day30 ?? []) {
    if (!b.stripe_customer_id) continue
    const { data: u } = await supabase.from('users').select('email').eq('id', b.owner_user_id).single()
    if (!u?.email) continue
    const { count } = await supabase.from('calls').select('id', { count: 'exact', head: true }).eq('business_id', b.id)
    await postEmailTrigger({ event: 'month_1_milestone', userId: b.owner_user_id, businessId: b.id, email: u.email, data: { totalCalls: count ?? 0 } })
    stats.month_1_milestone = (stats.month_1_milestone ?? 0) + 1
  }

  return NextResponse.json({ ok: true, ...stats })
}
