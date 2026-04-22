import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { DashboardClient } from './dashboard-client'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: business } = await supabase
    .from('businesses')
    .select('id, name, onboarding_completed, business_type')
    .eq('owner_user_id', user.id)
    .single()

  if (!business) redirect('/login')

  // This month's stats
  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)

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

  // 14-day chart data
  const dayMap: Record<string, number> = {}
  for (let i = 13; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    dayMap[d.toISOString().split('T')[0]] = 0
  }
  const fourteenAgo = new Date()
  fourteenAgo.setDate(fourteenAgo.getDate() - 14)
  const { data: chartCalls } = await supabase
    .from('calls')
    .select('created_at')
    .eq('business_id', business.id)
    .gte('created_at', fourteenAgo.toISOString())

  chartCalls?.forEach(c => {
    const day = c.created_at.split('T')[0]
    if (dayMap[day] !== undefined) dayMap[day]++
  })
  const chartData = Object.entries(dayMap).map(([date, count]) => ({ date, count }))

  // Recent calls (last 5)
  const { data: recentCalls } = await supabase
    .from('calls')
    .select('*')
    .eq('business_id', business.id)
    .order('created_at', { ascending: false })
    .limit(5)

  // Get user's first name from metadata, fallback to email prefix
  const rawName = user.user_metadata?.full_name || user.user_metadata?.name || user.email || ''
  const userFirstName = rawName.includes('@') ? rawName.split('@')[0] : rawName.split(' ')[0]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 32px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: '#071829' }}>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'white' }}>Dashboard</h1>
        {business.onboarding_completed && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 99, background: 'rgba(34,197,94,0.1)', color: '#22c55e', fontSize: 13, fontWeight: 600 }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e' }} />
            AI Agent Live
          </div>
        )}
      </div>
      <DashboardClient
        business={business}
        stats={{ totalMonth, aiResolutionRate, transferredMonth, missedMonth }}
        outcomes={{ resolved: resolvedByAI, transferred: transferredMonth, missed: missedMonth, total: totalMonth }}
        chartData={chartData}
        recentCalls={recentCalls ?? []}
        businessName={userFirstName}
      />
    </div>
  )
}
