import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { DashboardClient } from './dashboard-client'
import { estimateRevenueProtected, daysActiveThisMonth, getBenchmark } from '@/lib/roi'
import { getPlan } from '@/lib/plan'
import { pendingDocsForBusiness } from '@/lib/legal-docs'

export const metadata: Metadata = { title: 'Dashboard' }

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: business } = await supabase
    .from('businesses')
    .select('id, name, onboarding_completed, business_type, plan, signup_at, agent_name, talkmate_number, escalation_number, address, website, opening_hours, industry, tos_accepted_version, privacy_accepted_version, dpa_accepted_version')
    .eq('owner_user_id', user.id)
    .single()

  if (!business) redirect('/login')

  // This month's stats
  const startOfMonth = new Date()
  startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0)

  const { data: monthCalls } = await supabase
    .from('calls')
    .select('id, outcome, transferred, duration_seconds, created_at, caller_number')
    .eq('business_id', business.id)
    .gte('created_at', startOfMonth.toISOString())

  const all = monthCalls ?? []
  const totalMonth = all.length
  const transferredMonth = all.filter(c => c.transferred).length
  const missedMonth = all.filter(c => !c.outcome || c.outcome === 'Missed').length
  const resolvedByAI = all.filter(c => c.outcome && c.outcome !== 'Missed' && !c.transferred).length
  const aiResolutionRate = totalMonth > 0 ? Math.round((resolvedByAI / totalMonth) * 100) : 0

  // Calls answered today
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
  const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999)
  const callsAnsweredToday = all.filter(c => {
    const d = new Date(c.created_at)
    return d >= todayStart && d <= todayEnd && c.outcome && c.outcome !== 'Missed'
  }).length

  // Revenue captured this month — fall back to a per-call estimate.
  let revenueRecoveredThisMonth = 0
  let revenueIsEstimate = false
  try {
    const { data: jobs, error } = await supabase
      .from('jobs').select('job_value')
      .eq('business_id', business.id).gte('created_at', startOfMonth.toISOString())
    if (error || !jobs || jobs.length === 0) {
      revenueRecoveredThisMonth = totalMonth * 85
      revenueIsEstimate = true
    } else {
      const total = jobs.reduce((sum: number, j: { job_value?: number | null }) => sum + (j.job_value || 0), 0)
      if (total === 0) { revenueRecoveredThisMonth = totalMonth * 85; revenueIsEstimate = true }
      else revenueRecoveredThisMonth = total
    }
  } catch {
    revenueRecoveredThisMonth = totalMonth * 85
    revenueIsEstimate = true
  }

  // vs last month
  const lastMonthStart = new Date(); lastMonthStart.setDate(1); lastMonthStart.setHours(0, 0, 0, 0); lastMonthStart.setMonth(lastMonthStart.getMonth() - 1)
  const lastMonthEnd = new Date(startOfMonth.getTime() - 1)
  const { data: lastMonthCalls } = await supabase
    .from('calls').select('id').eq('business_id', business.id)
    .gte('created_at', lastMonthStart.toISOString()).lte('created_at', lastMonthEnd.toISOString())
  const lastMonth = lastMonthCalls?.length ?? 0
  const vsLastMonthPercent = Math.round(((totalMonth - lastMonth) / Math.max(lastMonth, 1)) * 100)

  // 14-day chart data
  const dayMap: Record<string, number> = {}
  for (let i = 13; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i)
    dayMap[d.toISOString().split('T')[0]] = 0
  }
  const fourteenAgo = new Date(); fourteenAgo.setDate(fourteenAgo.getDate() - 14)
  const { data: chartCalls } = await supabase
    .from('calls').select('created_at').eq('business_id', business.id).gte('created_at', fourteenAgo.toISOString())
  chartCalls?.forEach(c => {
    const day = c.created_at.split('T')[0]
    if (dayMap[day] !== undefined) dayMap[day]++
  })
  const chartData = Object.entries(dayMap).map(([date, count]) => ({ date, count }))

  // Recent calls
  const { data: recentCalls } = await supabase
    .from('calls').select('*').eq('business_id', business.id)
    .order('created_at', { ascending: false }).limit(5)

  // Onboarding progress — derived from existing onboarding_responses + businesses fields.
  const { data: onboardingRow } = await supabase
    .from('onboarding_responses').select('responses, completed_at').eq('business_id', business.id).maybeSingle()
  const responses = (onboardingRow?.responses ?? {}) as Record<string, unknown>
  const onboardingSteps = [
    { key: 'business', label: 'Business details', done: !!business.address || !!responses.businessName, href: '/onboarding' },
    { key: 'hours', label: 'Operating hours', done: !!business.opening_hours && Object.keys(business.opening_hours as object).length > 0, href: '/onboarding' },
    { key: 'menu', label: 'Services & menu', done: !!responses.catalog || !!responses.catalogItems, href: '/catalog' },
    { key: 'handling', label: 'Call handling', done: !!business.escalation_number || !!responses.escalationRules, href: '/onboarding' },
    { key: 'connect', label: 'Connect your number', done: !!business.talkmate_number, href: '/onboarding' },
  ]

  // Welcome message: prefer the auth user's first name, then fall back to the
  // business name. We deliberately ignore the email-local-part fallback —
  // "irfanhanif89" is a worse greeting than the business name.
  const userFirstName = (() => {
    const fullName = (user.user_metadata?.full_name as string) || (user.user_metadata?.name as string) || ''
    if (fullName && !fullName.includes('@')) {
      const first = fullName.trim().split(/\s+/)[0]
      if (first) return first
    }
    if (business.name) {
      const first = business.name.trim().split(/\s+/)[0]
      if (first) return first
    }
    return ''
  })()

  // ROI estimate
  const daysActive = daysActiveThisMonth(business.signup_at)
  const revenueProtected = estimateRevenueProtected({
    businessType: business.business_type ?? 'other',
    daysActiveThisMonth: daysActive,
    callsThisMonth: totalMonth,
  })
  const benchmark = getBenchmark(business.business_type)
  const planConfig = getPlan(business.plan)
  const payingForItself = revenueRecoveredThisMonth > planConfig.monthlyPrice

  // NPS — show on day 30 / day 90 if not yet responded
  const signupAt = business.signup_at ? new Date(business.signup_at) : new Date()
  const daysSinceSignup = Math.floor((Date.now() - signupAt.getTime()) / (24 * 60 * 60 * 1000))
  let npsTrigger: 'day30' | 'day90' | null = null
  if (daysSinceSignup >= 30 && daysSinceSignup < 60) npsTrigger = 'day30'
  else if (daysSinceSignup >= 90 && daysSinceSignup < 120) npsTrigger = 'day90'
  let needsNps: 'day30' | 'day90' | null = npsTrigger
  if (npsTrigger) {
    const { data: existing } = await supabase
      .from('nps_responses').select('trigger').eq('user_id', user.id).eq('trigger', npsTrigger).maybeSingle()
    if (existing) needsNps = null
  }

  // Active partner referral link?
  const { data: partnerRow } = await supabase
    .from('partners').select('referral_link, active_referrals, pending_payout').eq('user_id', user.id).maybeSingle()

  // CRM stats (Part 6) + outstanding T&C acceptance (Part 1)
  const pendingDocs = pendingDocsForBusiness({
    tos_accepted_version: business.tos_accepted_version,
    privacy_accepted_version: business.privacy_accepted_version,
    dpa_accepted_version: business.dpa_accepted_version,
  })
  const [{ count: contactsThisMonth }, { count: contactsTotal }, { count: contactsWithName }] = await Promise.all([
    supabase.from('contacts').select('id', { count: 'exact', head: true })
      .eq('client_id', business.id).gte('first_seen', startOfMonth.toISOString()),
    supabase.from('contacts').select('id', { count: 'exact', head: true })
      .eq('client_id', business.id).eq('is_merged', false),
    supabase.from('contacts').select('id', { count: 'exact', head: true })
      .eq('client_id', business.id).eq('is_merged', false).not('name', 'is', null),
  ])
  const crmHealthPct = (contactsTotal ?? 0) > 0
    ? Math.round(((contactsWithName ?? 0) / (contactsTotal ?? 1)) * 100)
    : 0
  const crmHealthHasContacts = (contactsTotal ?? 0) > 0

  return (
    <DashboardClient
      business={{
        id: business.id, name: business.name,
        onboarding_completed: business.onboarding_completed,
        business_type: business.business_type,
        plan: business.plan ?? 'starter',
        agent_name: business.agent_name,
        talkmate_number: business.talkmate_number,
      }}
      pendingLegalAcceptances={pendingDocs.length}
      contactsThisMonth={contactsThisMonth ?? 0}
      crmHealthPct={crmHealthPct}
      crmHealthHasContacts={crmHealthHasContacts}
      stats={{ totalMonth, aiResolutionRate, transferredMonth, missedMonth }}
      outcomes={{ resolved: resolvedByAI, transferred: transferredMonth, missed: missedMonth, total: totalMonth }}
      chartData={chartData}
      recentCalls={recentCalls ?? []}
      businessName={userFirstName}
      callsAnsweredToday={callsAnsweredToday}
      revenueRecoveredThisMonth={revenueRecoveredThisMonth}
      vsLastMonthPercent={vsLastMonthPercent}
      revenueIsEstimate={revenueIsEstimate}
      revenueProtected={revenueProtected}
      benchmarkLabel={`${(benchmark.missRate * 100).toFixed(0)}% miss rate, ${benchmark.label} $${benchmark.avgValue}`}
      payingForItself={payingForItself}
      planMonthlyPrice={planConfig.monthlyPrice}
      planLimit={planConfig.callLimit}
      daysActive={daysActive}
      daysSinceSignup={daysSinceSignup}
      onboardingSteps={onboardingSteps}
      needsNps={needsNps}
      partner={partnerRow ?? null}
    />
  )
}
