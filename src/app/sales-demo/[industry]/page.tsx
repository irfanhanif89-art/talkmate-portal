import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import {
  validateDemoPortalToken,
  getDemoBusinessId,
  getDemoIndustry,
} from '@/lib/demo-config'
import DemoTokenInvalid from './_components/DemoTokenInvalid'

interface PageProps {
  params: Promise<{ industry: string }>
  searchParams: Promise<{ token?: string }>
}

type CallRow = {
  id: string
  caller_name: string | null
  caller_number: string
  outcome: string
  duration_seconds: number
  created_at: string
  summary: string | null
}

function outcomeColor(outcome: string): { bg: string; fg: string } {
  const o = outcome.toLowerCase()
  if (o.includes('booking')) return { bg: 'rgba(34,197,94,0.14)', fg: '#22C55E' }
  if (o.includes('missed')) return { bg: 'rgba(239,68,68,0.14)', fg: '#EF4444' }
  if (o.includes('transfer')) return { bg: 'rgba(74,159,232,0.14)', fg: '#4A9FE8' }
  if (o.includes('resolved') || o.includes('info')) return { bg: 'rgba(167,139,250,0.14)', fg: '#A78BFA' }
  return { bg: 'rgba(255,255,255,0.06)', fg: 'rgba(255,255,255,0.55)' }
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}m ${s}s`
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('en-AU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
}

const CARD: React.CSSProperties = {
  background: '#0A1E38',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: 12,
  padding: 22,
  fontFamily: "'Outfit', system-ui, sans-serif",
}

export default async function DemoDashboardPage({ params, searchParams }: PageProps) {
  const { industry } = await params
  const { token } = await searchParams

  // Token guard -- render error inline, keep URL for debugging
  if (!validateDemoPortalToken(token)) {
    return <DemoTokenInvalid />
  }

  // Industry + business guards
  const demoIndustry = getDemoIndustry(industry)
  if (!demoIndustry || !demoIndustry.available) notFound()
  const businessId = getDemoBusinessId(industry)
  if (!businessId) notFound()

  const supabase = createAdminClient()

  const now = new Date()
  const todayStart = new Date(now)
  todayStart.setHours(0, 0, 0, 0)
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

  // Parallel queries
  const [
    { count: todayCount },
    { count: totalCount },
    { count: bookingCount },
    { count: missedCount },
    { data: recentCalls },
  ] = await Promise.all([
    supabase
      .from('calls')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .gte('created_at', todayStart.toISOString()),
    supabase
      .from('calls')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', businessId),
    supabase
      .from('calls')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .ilike('outcome', '%booking%')
      .gte('created_at', sevenDaysAgo.toISOString()),
    supabase
      .from('calls')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .ilike('outcome', '%missed%'),
    supabase
      .from('calls')
      .select('id, caller_name, caller_number, outcome, duration_seconds, created_at, summary')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .limit(5)
      .returns<CallRow[]>(),
  ])

  const bookings = bookingCount ?? 0
  const missed = missedCount ?? 0
  const today = todayCount ?? 0
  const total = totalCount ?? 0
  const estimatedRevenue = bookings * 150

  const statCards = [
    {
      label: 'Calls Today',
      value: today,
      sub: `${total} total calls logged`,
      accent: 'rgba(255,255,255,0.9)' as string,
    },
    {
      label: 'Bookings Captured (7d)',
      value: bookings,
      sub: 'captured via AI receptionist',
      accent: '#22C55E',
    },
    {
      label: 'Missed Calls',
      value: missed,
      sub: 'all time',
      accent: missed > 0 ? '#EF4444' : 'rgba(255,255,255,0.9)',
    },
    {
      label: 'Estimated Revenue Captured',
      value: `$${estimatedRevenue.toLocaleString()}`,
      sub: 'est. from bookings x avg job value',
      accent: '#E8622A',
    },
  ]

  return (
    <div style={{ fontFamily: "'Outfit', system-ui, sans-serif" }}>
      {/* Page heading */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ color: '#ffffff', fontSize: 22, fontWeight: 700, margin: 0 }}>
          Dashboard
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13, margin: '4px 0 0' }}>
          {demoIndustry.label} - demo snapshot
        </p>
      </div>

      {/* Stat cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: 16,
          marginBottom: 28,
        }}
      >
        {statCards.map((card) => (
          <div key={card.label} style={CARD}>
            <p
              style={{
                color: 'rgba(255,255,255,0.45)',
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                margin: '0 0 8px',
              }}
            >
              {card.label}
            </p>
            <p
              style={{
                color: card.accent,
                fontSize: 32,
                fontWeight: 700,
                margin: '0 0 4px',
                lineHeight: 1,
              }}
            >
              {card.value}
            </p>
            <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12, margin: 0 }}>
              {card.sub}
            </p>
          </div>
        ))}
      </div>

      {/* Recent calls */}
      <div style={CARD}>
        <h2
          style={{
            color: '#ffffff',
            fontSize: 15,
            fontWeight: 600,
            margin: '0 0 18px',
          }}
        >
          Recent Calls
        </h2>

        {!recentCalls || recentCalls.length === 0 ? (
          <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13, margin: 0 }}>
            No calls yet. Seeded calls will appear here.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {/* Column headers */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 140px 80px 100px',
                gap: 12,
                paddingBottom: 8,
                borderBottom: '1px solid rgba(255,255,255,0.06)',
                marginBottom: 4,
              }}
            >
              {['Caller', 'Outcome', 'Duration', 'Time'].map((h) => (
                <span
                  key={h}
                  style={{
                    color: 'rgba(255,255,255,0.35)',
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                  }}
                >
                  {h}
                </span>
              ))}
            </div>

            {recentCalls.map((call, idx) => {
              const { bg, fg } = outcomeColor(call.outcome)
              const snippet = call.summary
                ? call.summary.length > 80
                  ? call.summary.slice(0, 80) + '...'
                  : call.summary
                : null

              return (
                <div key={call.id}>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 140px 80px 100px',
                      gap: 12,
                      padding: '12px 0',
                      borderBottom:
                        idx < (recentCalls?.length ?? 0) - 1
                          ? '1px solid rgba(255,255,255,0.04)'
                          : 'none',
                      alignItems: 'start',
                    }}
                  >
                    {/* Caller + summary snippet */}
                    <div>
                      <p
                        style={{
                          color: '#ffffff',
                          fontSize: 13,
                          fontWeight: 500,
                          margin: '0 0 2px',
                        }}
                      >
                        {call.caller_name ?? call.caller_number}
                      </p>
                      {snippet && (
                        <p
                          style={{
                            color: 'rgba(255,255,255,0.4)',
                            fontSize: 12,
                            margin: 0,
                            lineHeight: 1.4,
                          }}
                        >
                          {snippet}
                        </p>
                      )}
                    </div>

                    {/* Outcome badge */}
                    <div>
                      <span
                        style={{
                          background: bg,
                          color: fg,
                          fontSize: 11,
                          fontWeight: 600,
                          padding: '3px 8px',
                          borderRadius: 6,
                          display: 'inline-block',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {call.outcome}
                      </span>
                    </div>

                    {/* Duration */}
                    <p
                      style={{
                        color: 'rgba(255,255,255,0.55)',
                        fontSize: 13,
                        margin: 0,
                      }}
                    >
                      {formatDuration(call.duration_seconds)}
                    </p>

                    {/* Time */}
                    <p
                      style={{
                        color: 'rgba(255,255,255,0.45)',
                        fontSize: 12,
                        margin: 0,
                      }}
                    >
                      {formatTime(call.created_at)}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
