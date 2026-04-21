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

function outcomeBg(outcome: string) {
  if (!outcome || outcome === 'Missed') return { bg: 'rgba(239,68,68,0.12)', color: '#ef4444' }
  if (outcome.toLowerCase().includes('transfer')) return { bg: 'rgba(245,158,11,0.12)', color: '#f59e0b' }
  return { bg: 'rgba(34,197,94,0.12)', color: '#22c55e' }
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
      {/* Grid lines */}
      {[0, 0.25, 0.5, 0.75, 1].map(t => (
        <line key={t}
          x1={ml} y1={mt + ch * (1 - t)}
          x2={W - mr} y2={mt + ch * (1 - t)}
          stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
      ))}
      {/* Bars */}
      {data.map((d, i) => {
        const barH = d.count > 0 ? Math.max(3, Math.round((d.count / max) * ch)) : 2
        const x = ml + i * slotW + (slotW - barW) / 2
        const y = mt + ch - barH
        const isToday = i === data.length - 1
        const label = new Date(d.date + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
        return (
          <g key={d.date}>
            <rect x={x} y={y} width={barW} height={barH} rx="3"
              fill={isToday ? '#E8622A' : 'rgba(232,98,42,0.45)'} />
            {i % 2 === 0 && (
              <text x={x + barW / 2} y={H - 4} textAnchor="middle" fill="#4A7FBB" fontSize="9">{label}</text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

export function DashboardClient({ business, stats, outcomes, chartData, recentCalls: initialCalls }: Props) {
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
  }, [business.id])

  const pct = (n: number) => outcomes.total > 0 ? Math.round((n / outcomes.total) * 100) : 0

  const statCard = (label: string, value: string | number, sub: string, color = 'white') => (
    <div style={{ background: '#0A1E38', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: '20px 22px' }}>
      <div style={{ fontSize: 11, color: '#4A7FBB', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: '2rem', fontWeight: 800, lineHeight: 1, marginBottom: 6, color }}>{value}</div>
      <div style={{ fontSize: 12, color: '#4A7FBB' }}>{sub}</div>
    </div>
  )

  return (
    <div style={{ padding: 32, flex: 1, overflowY: 'auto' }}>
      {/* Setup banner */}
      {!business.onboarding_complete && (
        <div onClick={() => router.push('/onboarding')} style={{ background: 'linear-gradient(135deg,rgba(232,98,42,0.15),rgba(74,159,232,0.08))', border: '1px solid rgba(232,98,42,0.3)', borderRadius: 16, padding: '20px 24px', marginBottom: 28, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontSize: 32 }}>⚡</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Complete your setup to go live</div>
            <div style={{ fontSize: 13, color: '#7BAED4' }}>Finish configuring your AI agent — takes about 5 minutes</div>
          </div>
          <button style={{ background: '#E8622A', color: 'white', border: 'none', borderRadius: 10, padding: '10px 20px', fontFamily: 'Outfit,sans-serif', fontWeight: 600, fontSize: 14, cursor: 'pointer', flexShrink: 0 }}>
            Complete Setup →
          </button>
        </div>
      )}

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 24 }}>
        {statCard('Calls This Month', stats.totalMonth, `${new Date().toLocaleDateString('en-AU', { month: 'long' })} total`)}
        {statCard('AI Resolution Rate', `${stats.aiResolutionRate}%`, 'Handled without transfer', stats.aiResolutionRate >= 70 ? '#22c55e' : '#f59e0b')}
        {statCard('Transferred', stats.transferredMonth, 'Escalated to you')}
        {statCard('Missed Calls', stats.missedMonth, 'Not answered', stats.missedMonth === 0 ? '#22c55e' : '#ef4444')}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 24 }}>
        {/* SVG Bar Chart */}
        <div style={{ background: '#0A1E38', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>Call Volume — Last 14 Days</div>
          <div style={{ fontSize: 12, color: '#4A7FBB', marginBottom: 16 }}>Daily calls handled by your AI agent</div>
          <BarChart data={chartData} />
        </div>

        {/* Call outcomes */}
        <div style={{ background: '#0A1E38', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>Call Outcomes</div>
          <div style={{ fontSize: 12, color: '#4A7FBB', marginBottom: 20 }}>This month</div>
          {([
            ['Resolved by AI', pct(outcomes.resolved), '#22c55e'],
            ['Transferred', pct(outcomes.transferred), '#f59e0b'],
            ['Missed', pct(outcomes.missed), '#ef4444'],
          ] as [string, number, string][]).map(([label, value, color]) => (
            <div key={label} style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 5 }}>
                <span style={{ color: '#7BAED4' }}>{label}</span>
                <span style={{ fontWeight: 700, color: 'white' }}>{value}%</span>
              </div>
              <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ width: `${value}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.4s ease' }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent calls */}
      <div style={{ background: '#0A1E38', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>Recent Calls</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: '#22c55e' }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', animation: 'pulse 2s infinite' }} />
                LIVE
              </div>
            </div>
            <div style={{ fontSize: 12, color: '#4A7FBB' }}>Last 5 calls handled by your AI agent</div>
          </div>
          <button onClick={() => router.push('/calls')} style={{ background: 'transparent', border: '1px solid rgba(74,159,232,0.3)', color: '#4A9FE8', padding: '7px 14px', borderRadius: 8, fontSize: 12, cursor: 'pointer', fontFamily: 'Outfit,sans-serif' }}>View all →</button>
        </div>

        {liveCalls.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 0', color: '#4A7FBB', fontSize: 14 }}>No calls yet this month</div>
        ) : liveCalls.map((c, i) => {
          const badge = outcomeBg(c.outcome)
          return (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0', borderBottom: i < liveCalls.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: badge.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>📞</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>{c.caller_number || 'Unknown'}</div>
                <div style={{ fontSize: 12, color: '#4A7FBB' }}>{c.outcome || 'In progress'} · {fmt(c.duration_seconds)}</div>
              </div>
              <div style={{ fontSize: 12, color: '#4A7FBB', marginRight: 10 }}>{timeAgo(c.created_at)}</div>
              <span style={{ fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 99, background: badge.bg, color: badge.color, whiteSpace: 'nowrap' }}>
                {c.outcome || 'Live'}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
