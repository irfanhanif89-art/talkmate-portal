'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

interface Call {
  id: string
  caller_number: string
  outcome: string
  duration_seconds: number
  created_at: string
  transferred: boolean
}

interface Business {
  id: string
  name: string
  onboarding_completed: boolean
  business_type: string
}

interface Props {
  business: Business
  stats: { totalMonth: number; aiResolutionRate: number; transferredMonth: number; missedMonth: number }
  outcomes: { resolved: number; transferred: number; missed: number; total: number }
  chartData: { date: string; count: number }[]
  recentCalls: Call[]
  businessName?: string
  callsAnsweredToday?: number
  revenueRecoveredThisMonth?: number
  vsLastMonthPercent?: number
  revenueIsEstimate?: boolean
}

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function fmt(s: number) {
  if (!s) return '—'
  return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`
}

function outcomeBadge(outcome: string) {
  const o = (outcome || '').toLowerCase()
  if (!o || o === 'missed') return { bg: 'rgba(239,68,68,0.12)', color: '#EF4444', label: 'Missed' }
  if (o.includes('transfer')) return { bg: 'rgba(245,158,11,0.12)', color: '#F59E0B', label: 'Transferred' }
  if (o === 'faq') return { bg: 'rgba(74,159,232,0.12)', color: '#4A9FE8', label: 'FAQ' }
  return { bg: 'rgba(34,197,94,0.12)', color: '#22C55E', label: 'Resolved' }
}

function PhoneIcon({ color }: { color: string }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 15a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 4.23h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 11a16 16 0 0 0 6 6l.92-.92a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
    </svg>
  )
}

function GradientCard({ children, accent = '#E8622A' }: { children: React.ReactNode; accent?: string }) {
  return (
    <div style={{ background: '#0A1E38', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, overflow: 'hidden' }}>
      <div style={{ height: 2, background: `linear-gradient(90deg, ${accent}, #1565C0)` }} />
      <div style={{ padding: 24 }}>{children}</div>
    </div>
  )
}

function CardLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.1em', color: '#4A7FBB', marginBottom: 10 }}>{children}</div>
}

function BarChart({ data }: { data: { date: string; count: number }[] }) {
  const max = Math.max(...data.map(d => d.count), 1)
  const W = 560, H = 160, ml = 20, mr = 8, mt = 8, mb = 28
  const cw = W - ml - mr
  const ch = H - mt - mb
  const slotW = cw / data.length
  const barW = Math.max(10, Math.floor(slotW * 0.58))

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
      {[0, 0.25, 0.5, 0.75, 1].map(t => (
        <line key={t} x1={ml} y1={mt + ch * (1 - t)} x2={W - mr} y2={mt + ch * (1 - t)} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
      ))}
      {data.map((d, i) => {
        const barH = d.count > 0 ? Math.max(3, Math.round((d.count / max) * ch)) : 2
        const x = ml + i * slotW + (slotW - barW) / 2
        const y = mt + ch - barH
        const isToday = i === data.length - 1
        const label = new Date(d.date + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
        return (
          <g key={d.date}>
            <rect x={x} y={y} width={barW} height={barH} rx="3" fill={isToday ? '#E8622A' : 'rgba(232,98,42,0.4)'} />
            {i % 2 === 0 && (
              <text x={x + barW / 2} y={H - 4} textAnchor="middle" fill="#4A7FBB" fontSize="9">{label}</text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

// ── Revenue Strip ──────────────────────────────────────────────────────────────
function RevenueStrip({ revenue, today, isEstimate, totalMonth, router }: {
  revenue: number; today: number; isEstimate: boolean; totalMonth: number; router: ReturnType<typeof useRouter>
}) {
  const divider = <div style={{ width: 1, height: 32, background: 'rgba(255,255,255,0.08)', flexShrink: 0 }} />

  const DataPoint = ({ value, label, color }: { value: string; label: string; color: string }) => (
    <div style={{ textAlign: 'center', padding: '0 16px' }}>
      <div style={{ fontSize: 22, fontWeight: 800, color, lineHeight: 1.1, letterSpacing: '-0.5px' }}>{value}</div>
      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', marginTop: 3 }}>{label}</div>
    </div>
  )

  const isEmpty = totalMonth === 0

  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(21,101,192,0.15), rgba(232,98,42,0.1))',
      border: '1px solid rgba(21,101,192,0.25)',
      borderRadius: 12,
      padding: '14px 18px',
      display: 'flex',
      alignItems: 'center',
      gap: 4,
      marginBottom: 20,
    }}>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 4 }}>
        {isEmpty ? (
          <div style={{ padding: '0 16px' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'white' }}>Your agent is live</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>Make a test call to see your dashboard come alive →</div>
          </div>
        ) : (
          <DataPoint
            value={`$${revenue.toLocaleString()}${isEstimate ? ' est.' : ''}`}
            label="Revenue recovered"
            color="#E8622A"
          />
        )}
        {divider}
        <DataPoint value={String(today)} label="Answered today" color="#4A9FE8" />
        {divider}
        <DataPoint value="+23%" label="Avg order lift" color="#22C55E" />
        {divider}
        <div style={{ textAlign: 'center', padding: '0 16px' }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'white', lineHeight: 1.1 }}>—</div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', marginTop: 3 }}>Google rating</div>
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', marginTop: 1 }}>connect in Settings</div>
        </div>
      </div>

      <div
        onClick={() => router.push('/analytics')}
        style={{
          background: 'rgba(232,98,42,0.15)',
          border: '1px solid rgba(232,98,42,0.3)',
          borderRadius: 8,
          padding: '8px 14px',
          cursor: 'pointer',
          flexShrink: 0,
          marginLeft: 12,
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 600, color: '#E8622A' }}>See full report</div>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>Analytics →</div>
      </div>
    </div>
  )
}

// ── Upsell Banner ──────────────────────────────────────────────────────────────
function UpsellBanner({ missedMonth, totalMonth, callsAnsweredToday, router }: {
  missedMonth: number; totalMonth: number; callsAnsweredToday: number; router: ReturnType<typeof useRouter>
}) {
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const t = localStorage.getItem('upsell_dismissed_at')
    if (t && Date.now() - parseInt(t) < 7 * 24 * 60 * 60 * 1000) setDismissed(true)
  }, [])

  if (dismissed) return null

  let strong: string, span: string, cta: string, href: string

  if (missedMonth >= 1) {
    strong = `You missed ${missedMonth} call${missedMonth > 1 ? 's' : ''} this month — did that customer call a competitor?`
    span = 'Unlock SMS Follow-Ups to automatically reach out within 5 minutes of every missed call.'
    cta = 'Unlock SMS Follow-Ups — $39/mo →'
    href = '/billing'
  } else if (totalMonth >= 50) {
    strong = `You handled ${totalMonth} calls this month. Outbound AI can proactively follow up every one.`
    span = 'Confirm jobs, chase quotes, and send reminders — automatically, while you sleep.'
    cta = 'Learn about Outbound AI — $79/mo →'
    href = '/billing'
  } else {
    strong = 'Your agent is live and ready. Make your first test call.'
    span = 'Call your TalkMate number to see a call appear in your dashboard in real time.'
    cta = 'View your number →'
    href = '/settings'
  }

  return (
    <div style={{
      background: '#0D1F35',
      border: '1px solid rgba(232,98,42,0.3)',
      borderRadius: 11,
      padding: '14px 16px',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      marginBottom: 20,
    }}>
      <div className="upsell-dot" />
      <div style={{ flex: 1 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'white', display: 'block' }}>{strong}</span>
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', display: 'block', marginTop: 3 }}>{span}</span>
      </div>
      <button
        onClick={() => router.push(href)}
        style={{ background: '#E8622A', color: 'white', border: 'none', padding: '8px 14px', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit,sans-serif', flexShrink: 0 }}
      >
        {cta}
      </button>
      <span
        onClick={() => { localStorage.setItem('upsell_dismissed_at', Date.now().toString()); setDismissed(true) }}
        style={{ fontSize: 14, color: 'rgba(255,255,255,0.25)', cursor: 'pointer', marginLeft: 4, flexShrink: 0, lineHeight: 1 }}
      >
        ✕
      </span>
    </div>
  )
}

// ── Main Dashboard ─────────────────────────────────────────────────────────────
export function DashboardClient({
  business, stats, outcomes, chartData, recentCalls: initialCalls, businessName,
  callsAnsweredToday = 0, revenueRecoveredThisMonth = 0, vsLastMonthPercent = 0, revenueIsEstimate = false,
}: Props) {
  const supabase = createClient()
  const router = useRouter()
  const [liveCalls, setLiveCalls] = useState<Call[]>(initialCalls)

  useEffect(() => {
    const channel = supabase
      .channel('calls-live')
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'calls',
        filter: `business_id=eq.${business.id}`,
      }, payload => {
        setLiveCalls(prev => [payload.new as Call, ...prev].slice(0, 5))
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [business.id, supabase])

  const pct = (n: number) => outcomes.total > 0 ? Math.round((n / outcomes.total) * 100) : 0
  const firstName = businessName || (business.name || '').split(' ')[0]
  const noData = stats.totalMonth === 0

  // Stat card colour logic
  const aiRateColor = noData ? 'rgba(255,255,255,0.3)' : stats.aiResolutionRate >= 85 ? '#22C55E' : stats.aiResolutionRate >= 70 ? '#F59E0B' : '#EF4444'
  const missedColor = stats.missedMonth === 0 ? '#22C55E' : '#EF4444'

  // vs last month display
  let vsLastMonthEl: React.ReactNode = null
  if (vsLastMonthPercent > 0) {
    vsLastMonthEl = <span style={{ color: '#22C55E' }}>↑ {vsLastMonthPercent}% vs last month</span>
  } else if (vsLastMonthPercent < 0) {
    vsLastMonthEl = <span style={{ color: '#EF4444' }}>↓ {Math.abs(vsLastMonthPercent)}% vs last month</span>
  } else {
    vsLastMonthEl = <span style={{ color: 'rgba(255,255,255,0.3)' }}>No data from last month</span>
  }

  return (
    <div style={{ padding: 32, flex: 1, overflowY: 'auto' }}>

      {/* Page header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#E8622A', marginBottom: 6 }}>Dashboard</div>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 800, letterSpacing: '-0.5px', margin: 0, lineHeight: 1.1, color: 'white' }}>
          Welcome back{firstName ? `, ${firstName}` : ''}
        </h1>
        <p style={{ fontSize: 12, color: '#4A7FBB', marginTop: 6, fontWeight: 300 }}>
          {new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* Revenue Strip */}
      <RevenueStrip
        revenue={revenueRecoveredThisMonth}
        today={callsAnsweredToday}
        isEstimate={revenueIsEstimate}
        totalMonth={stats.totalMonth}
        router={router}
      />

      {/* Setup banner */}
      {!business.onboarding_completed && (
        <div onClick={() => router.push('/onboarding')} style={{
          background: 'linear-gradient(135deg,rgba(232,98,42,0.12),rgba(74,159,232,0.06))',
          border: '1px solid rgba(232,98,42,0.25)', borderRadius: 16, padding: '18px 24px',
          marginBottom: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 16,
        }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(232,98,42,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#E8622A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 3, color: 'white' }}>Complete your setup to go live</div>
            <div style={{ fontSize: 12, color: '#7BAED4', fontWeight: 300 }}>Finish configuring your AI agent — takes about 5 minutes</div>
          </div>
          <button style={{ background: '#E8622A', color: 'white', border: 'none', borderRadius: 10, padding: '9px 18px', fontFamily: 'Outfit,sans-serif', fontWeight: 700, fontSize: 13, cursor: 'pointer', flexShrink: 0 }}>
            Complete Setup →
          </button>
        </div>
      )}

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 20 }}>
        {/* Calls this month */}
        <div style={{ background: '#0A1E38', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, overflow: 'hidden' }}>
          <div style={{ height: 2, background: 'linear-gradient(90deg, #E8622A, #1565C0)' }} />
          <div style={{ padding: '18px 20px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.1em', color: '#4A7FBB', marginBottom: 10 }}>Calls This Month</div>
            <div style={{ fontSize: '2rem', fontWeight: 800, lineHeight: 1, marginBottom: 6, color: 'white', letterSpacing: '-1px' }}>{stats.totalMonth}</div>
            <div style={{ fontSize: 11, fontWeight: 300 }}>{vsLastMonthEl}</div>
          </div>
        </div>

        {/* AI Resolution Rate */}
        <div style={{ background: '#0A1E38', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, overflow: 'hidden' }}>
          <div style={{ height: 2, background: `linear-gradient(90deg, ${aiRateColor}, #1565C0)` }} />
          <div style={{ padding: '18px 20px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.1em', color: '#4A7FBB', marginBottom: 10 }}>AI Resolution Rate</div>
            <div
              title={noData ? 'Will populate after your first call' : undefined}
              style={{ fontSize: '2rem', fontWeight: 800, lineHeight: 1, marginBottom: 6, color: aiRateColor, letterSpacing: '-1px' }}
            >
              {noData ? '—' : `${stats.aiResolutionRate}%`}
            </div>
            <div style={{ fontSize: 11, fontWeight: 300, color: 'rgba(255,255,255,0.35)' }}>handled without transfer</div>
          </div>
        </div>

        {/* Transferred */}
        <div style={{ background: '#0A1E38', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, overflow: 'hidden' }}>
          <div style={{ height: 2, background: 'linear-gradient(90deg, #4A9FE8, #1565C0)' }} />
          <div style={{ padding: '18px 20px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.1em', color: '#4A7FBB', marginBottom: 10 }}>Transferred</div>
            <div style={{ fontSize: '2rem', fontWeight: 800, lineHeight: 1, marginBottom: 6, color: noData ? 'rgba(255,255,255,0.3)' : 'white', letterSpacing: '-1px' }}>{noData ? '—' : stats.transferredMonth}</div>
            <div style={{ fontSize: 11, fontWeight: 300, color: 'rgba(255,255,255,0.35)' }}>escalated to you</div>
          </div>
        </div>

        {/* Missed calls */}
        <div style={{ background: '#0A1E38', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, overflow: 'hidden' }}>
          <div style={{ height: 2, background: `linear-gradient(90deg, ${missedColor}, #1565C0)` }} />
          <div style={{ padding: '18px 20px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.1em', color: '#4A7FBB', marginBottom: 10 }}>Missed Calls</div>
            <div style={{ fontSize: '2rem', fontWeight: 800, lineHeight: 1, marginBottom: 6, color: missedColor, letterSpacing: '-1px' }}>{stats.missedMonth}</div>
            <div style={{ fontSize: 11, fontWeight: 300, color: stats.missedMonth === 0 ? '#22C55E' : '#EF4444' }}>
              {stats.missedMonth === 0 ? '100% answer rate 🎉' : `${stats.missedMonth} call${stats.missedMonth > 1 ? 's' : ''} not answered`}
            </div>
          </div>
        </div>
      </div>

      {/* Upsell Banner */}
      <UpsellBanner
        missedMonth={stats.missedMonth}
        totalMonth={stats.totalMonth}
        callsAnsweredToday={callsAnsweredToday}
        router={router}
      />

      {/* Chart + Outcomes */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 24 }}>
        <GradientCard accent="#E8622A">
          <CardLabel>Call Volume — Last 14 Days</CardLabel>
          <div style={{ fontSize: 11, color: '#4A7FBB', marginBottom: 16, fontWeight: 300 }}>Daily calls handled by your AI agent</div>
          <BarChart data={chartData} />
        </GradientCard>

        <GradientCard accent="#1565C0">
          <CardLabel>Call Outcomes</CardLabel>
          <div style={{ fontSize: 11, color: '#4A7FBB', marginBottom: 20, fontWeight: 300 }}>This month</div>
          {([
            ['Resolved by AI', pct(outcomes.resolved), '#22C55E'],
            ['Transferred', pct(outcomes.transferred), '#F59E0B'],
            ['Missed', pct(outcomes.missed), '#EF4444'],
          ] as [string, number, string][]).map(([label, value, color]) => (
            <div key={label} style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
                <span style={{ color: '#7BAED4', fontWeight: 300 }}>{label}</span>
                <span style={{ fontWeight: 800, color: 'white', fontSize: 13 }}>{noData ? '—' : `${value}%`}</span>
              </div>
              <div style={{ height: 5, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ width: noData ? '0%' : `${value}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.6s ease' }} />
              </div>
            </div>
          ))}
        </GradientCard>
      </div>

      {/* Recent calls */}
      <GradientCard accent="#E8622A">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
              <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '-0.2px', color: 'white' }}>Recent Calls</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, color: '#22C55E', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#22C55E' }} />
                Live
              </div>
            </div>
            <div style={{ fontSize: 11, color: '#4A7FBB', fontWeight: 300 }}>Last 5 calls handled by your AI agent</div>
          </div>
          <button onClick={() => router.push('/calls')} style={{ background: 'transparent', border: '1px solid rgba(74,159,232,0.25)', color: '#4A9FE8', padding: '7px 14px', borderRadius: 8, fontSize: 12, cursor: 'pointer', fontFamily: 'Outfit,sans-serif', fontWeight: 600 }}>
            View all →
          </button>
        </div>

        {liveCalls.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 0', color: '#4A7FBB', fontSize: 13, fontWeight: 300 }}>No calls yet — your agent is live and waiting</div>
        ) : liveCalls.map((c, i) => {
          const badge = outcomeBadge(c.outcome)
          return (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 0', borderBottom: i < liveCalls.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: badge.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <PhoneIcon color={badge.color} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2, color: 'white' }}>{c.caller_number || 'Unknown'}</div>
                <div style={{ fontSize: 11, color: '#4A7FBB', fontWeight: 300 }}>{c.outcome || 'In progress'} · {fmt(c.duration_seconds)}</div>
              </div>
              <div style={{ fontSize: 11, color: '#4A7FBB', marginRight: 10 }}>{timeAgo(c.created_at)}</div>
              <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 99, background: badge.bg, color: badge.color, whiteSpace: 'nowrap' as const, letterSpacing: '0.03em' }}>
                {badge.label}
              </span>
            </div>
          )
        })}
      </GradientCard>
    </div>
  )
}
