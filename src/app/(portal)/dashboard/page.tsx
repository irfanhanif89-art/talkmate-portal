import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { BUSINESS_TYPE_CONFIG, type BusinessType } from '@/lib/business-types'
import DashboardClient from './dashboard-client'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: business } = await supabase
    .from('businesses')
    .select('*')
    .eq('owner_user_id', user.id)
    .single()
  if (!business) redirect('/register')

  const config = BUSINESS_TYPE_CONFIG[business.business_type as BusinessType]
  const today = new Date().toISOString().split('T')[0]

  // Today's stats
  const { data: todayCalls } = await supabase
    .from('calls')
    .select('id, outcome, transferred, duration_seconds, created_at')
    .eq('business_id', business.id)
    .gte('created_at', today + 'T00:00:00')

  const totalToday = todayCalls?.length ?? 0
  const transferredToday = todayCalls?.filter(c => c.transferred).length ?? 0
  const answeredToday = todayCalls?.filter(c => c.outcome && c.outcome !== 'Missed').length ?? 0
  const answerRate = totalToday > 0 ? Math.round((answeredToday / totalToday) * 100) : 0

  // Primary metric count (e.g. orders, bookings, jobs)
  const primaryOutcome = config.callOutcomeTypes[0]
  const primaryCount = todayCalls?.filter(c => c.outcome === primaryOutcome).length ?? 0

  // 30-day chart data
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const { data: chartCalls } = await supabase
    .from('calls')
    .select('created_at')
    .eq('business_id', business.id)
    .gte('created_at', thirtyDaysAgo.toISOString())

  // Group by day
  const dayMap: Record<string, number> = {}
  for (let i = 29; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i)
    dayMap[d.toISOString().split('T')[0]] = 0
  }
  chartCalls?.forEach(c => {
    const day = c.created_at.split('T')[0]
    if (dayMap[day] !== undefined) dayMap[day]++
  })
  const chartData = Object.entries(dayMap).map(([date, count]) => ({ date, count }))

  // Recent calls
  const { data: recentCalls } = await supabase
    .from('calls')
    .select('*')
    .eq('business_id', business.id)
    .order('created_at', { ascending: false })
    .limit(8)

  return (
    <DashboardClient
      business={business}
      config={config}
      stats={{ totalToday, primaryCount, answerRate, transferredToday }}
      chartData={chartData}
      recentCalls={recentCalls ?? []}
      primaryOutcomeLabel={primaryOutcome}
    />
  )
}
