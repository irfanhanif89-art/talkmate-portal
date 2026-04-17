'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Phone, TrendingUp, CheckCircle, ArrowRightLeft } from 'lucide-react'
import type { BusinessTypeConfig } from '@/lib/business-types'

interface Props {
  business: { id: string; name: string; business_type: string; onboarding_completed: boolean }
  config: BusinessTypeConfig
  stats: { totalToday: number; primaryCount: number; answerRate: number; transferredToday: number }
  chartData: { date: string; count: number }[]
  recentCalls: Array<{ id: string; caller_number: string; outcome: string; transferred: boolean; duration_seconds: number; created_at: string }>
  primaryOutcomeLabel: string
}

export default function DashboardClient({ business, config, stats, chartData, recentCalls: initialCalls, primaryOutcomeLabel }: Props) {
  const [liveCalls, setLiveCalls] = useState(initialCalls)

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('calls-live')
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'calls',
        filter: `business_id=eq.${business.id}`
      }, payload => {
        setLiveCalls(prev => [payload.new as typeof initialCalls[0], ...prev].slice(0, 8))
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [business.id])

  const statCards = [
    { label: 'Calls Today', value: stats.totalToday, icon: Phone, color: '#4A9FE8' },
    { label: config.dashboardMetricLabel, value: stats.primaryCount, icon: TrendingUp, color: '#E8622A' },
    { label: 'Answer Rate', value: `${stats.answerRate}%`, icon: CheckCircle, color: '#22c55e' },
    { label: 'Transferred', value: stats.transferredToday, icon: ArrowRightLeft, color: '#f59e0b' },
  ]

  function formatDuration(s: number) {
    if (!s) return '—'
    return s >= 60 ? `${Math.floor(s/60)}m ${s%60}s` : `${s}s`
  }

  function formatTime(ts: string) {
    return new Date(ts).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })
  }

  const outcomeBadgeColor = (outcome: string) => {
    if (!outcome || outcome === 'Missed') return { bg: 'rgba(239,68,68,0.1)', color: '#ef4444' }
    if (outcome.includes('Transfer')) return { bg: 'rgba(245,158,11,0.1)', color: '#f59e0b' }
    return { bg: 'rgba(34,197,94,0.1)', color: '#22c55e' }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-sm mt-1" style={{ color: '#4A7FBB' }}>
          {new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      </div>

      {/* Onboarding banner */}
      {!business.onboarding_completed && (
        <a href="/onboarding" className="flex items-center justify-between p-4 rounded-xl mb-6 border" style={{ background: 'rgba(232,98,42,0.08)', borderColor: 'rgba(232,98,42,0.3)' }}>
          <div>
            <p className="font-semibold text-white">⚡ Complete your setup</p>
            <p className="text-sm mt-0.5" style={{ color: '#4A7FBB' }}>Your AI agent isn't live yet. Finish setup to start answering calls.</p>
          </div>
          <span style={{ color: '#E8622A', fontWeight: 600 }}>Continue →</span>
        </a>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {statCards.map(card => (
          <div key={card.label} className="p-5 rounded-xl border" style={{ background: '#0A1E38', borderColor: 'rgba(255,255,255,0.06)' }}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#4A7FBB' }}>{card.label}</span>
              <card.icon size={16} style={{ color: card.color }} />
            </div>
            <div className="text-3xl font-bold" style={{ color: 'white', fontFamily: 'Outfit, sans-serif' }}>{card.value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart */}
        <div className="lg:col-span-2 p-5 rounded-xl border" style={{ background: '#0A1E38', borderColor: 'rgba(255,255,255,0.06)' }}>
          <h2 className="text-sm font-semibold text-white mb-4">Call Volume — Last 30 Days</h2>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="date" tick={{ fill: '#4A7FBB', fontSize: 11 }}
                tickFormatter={d => new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                interval={6} />
              <YAxis tick={{ fill: '#4A7FBB', fontSize: 11 }} />
              <Tooltip contentStyle={{ background: '#071829', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: 'white' }} />
              <Line type="monotone" dataKey="count" stroke="#E8622A" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Live feed */}
        <div className="p-5 rounded-xl border" style={{ background: '#0A1E38', borderColor: 'rgba(255,255,255,0.06)' }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-white">Recent Calls</h2>
            <span className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: '#22c55e' }}>
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />LIVE
            </span>
          </div>
          <div className="space-y-3">
            {liveCalls.length === 0 ? (
              <p className="text-sm text-center py-6" style={{ color: '#4A7FBB' }}>No calls yet today</p>
            ) : liveCalls.map(call => {
              const badge = outcomeBadgeColor(call.outcome)
              return (
                <div key={call.id} className="flex items-center justify-between py-2 border-b last:border-0" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                  <div>
                    <p className="text-sm font-medium text-white">{call.caller_number || 'Unknown'}</p>
                    <p className="text-xs" style={{ color: '#4A7FBB' }}>{formatTime(call.created_at)} · {formatDuration(call.duration_seconds)}</p>
                  </div>
                  <span className="text-xs font-semibold px-2 py-1 rounded-full" style={{ background: badge.bg, color: badge.color }}>
                    {call.outcome || 'In progress'}
                  </span>
                </div>
              )
            })}
          </div>
          <a href="/calls" className="block text-center text-xs font-semibold mt-4" style={{ color: '#4A9FE8' }}>View all calls →</a>
        </div>
      </div>
    </div>
  )
}
