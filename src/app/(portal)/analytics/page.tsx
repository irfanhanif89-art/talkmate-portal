'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useBusinessType } from '@/context/business-type-context'
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'

type Range = '7d' | '30d' | '90d'

const COLORS = ['#E8622A', '#4A9FE8', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899']

export default function AnalyticsPage() {
  const { config, businessId } = useBusinessType()
  const supabase = createClient()
  const [range, setRange] = useState<Range>('30d')
  const [calls, setCalls] = useState<Array<{ created_at: string; outcome: string; transferred: boolean; duration_seconds: number; caller_number: string }>>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchData() }, [range, businessId])

  async function fetchData() {
    setLoading(true)
    const days = range === '7d' ? 7 : range === '30d' ? 30 : 90
    const from = new Date(); from.setDate(from.getDate() - days)
    const { data } = await supabase.from('calls').select('created_at, outcome, transferred, duration_seconds, caller_number')
      .eq('business_id', businessId).gte('created_at', from.toISOString()).order('created_at')
    setCalls(data ?? []); setLoading(false)
  }

  // Volume by day
  const days = range === '7d' ? 7 : range === '30d' ? 30 : 90
  const dayMap: Record<string, number> = {}
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i)
    dayMap[d.toISOString().split('T')[0]] = 0
  }
  calls.forEach(c => { const d = c.created_at.split('T')[0]; if (dayMap[d] !== undefined) dayMap[d]++ })
  const volumeData = Object.entries(dayMap).map(([date, count]) => ({ date, count }))

  // Outcome breakdown
  const outcomeCounts: Record<string, number> = {}
  calls.forEach(c => { outcomeCounts[c.outcome || 'Unknown'] = (outcomeCounts[c.outcome || 'Unknown'] || 0) + 1 })
  const outcomeData = Object.entries(outcomeCounts).map(([name, value]) => ({ name, value }))

  // Heatmap (hours × days of week)
  const heatmap: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0))
  calls.forEach(c => {
    const d = new Date(c.created_at)
    heatmap[d.getDay()][d.getHours()]++
  })
  const maxHeat = Math.max(1, ...heatmap.flat())
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  // Top callers
  const callerMap: Record<string, number> = {}
  calls.forEach(c => { if (c.caller_number) callerMap[c.caller_number] = (callerMap[c.caller_number] || 0) + 1 })
  const topCallers = Object.entries(callerMap).sort((a, b) => b[1] - a[1]).slice(0, 10)

  // KPIs
  const totalCalls = calls.length
  const answered = calls.filter(c => c.outcome && c.outcome !== 'Missed').length
  const answerRate = totalCalls ? Math.round(answered / totalCalls * 100) : 0
  const primaryCount = calls.filter(c => c.outcome === config.callOutcomeTypes[0]).length
  const avgDuration = calls.length ? Math.round(calls.reduce((a, c) => a + (c.duration_seconds || 0), 0) / calls.length) : 0

  const tooltipStyle = { background: '#071829', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: 'white' }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Analytics</h1>
        <div className="flex gap-2">
          {(['7d', '30d', '90d'] as Range[]).map(r => (
            <button key={r} onClick={() => setRange(r)} className="px-4 py-2 rounded-lg text-sm font-semibold transition-all"
              style={{ background: range === r ? '#E8622A' : 'rgba(255,255,255,0.06)', color: range === r ? 'white' : '#4A7FBB' }}>
              {r === '7d' ? '7 Days' : r === '30d' ? '30 Days' : '90 Days'}
            </button>
          ))}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Total Calls', value: totalCalls },
          { label: config.callOutcomeTypes[0], value: primaryCount },
          { label: 'Answer Rate', value: `${answerRate}%` },
          { label: 'Avg Duration', value: avgDuration >= 60 ? `${Math.floor(avgDuration/60)}m ${avgDuration%60}s` : `${avgDuration}s` },
        ].map(k => (
          <div key={k.label} className="p-5 rounded-xl border" style={{ background: '#0A1E38', borderColor: 'rgba(255,255,255,0.06)' }}>
            <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: '#4A7FBB' }}>{k.label}</p>
            <p className="text-3xl font-bold text-white">{loading ? '—' : k.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Volume chart */}
        <div className="p-5 rounded-xl border" style={{ background: '#0A1E38', borderColor: 'rgba(255,255,255,0.06)', position: 'relative' }}>
          <h2 className="text-sm font-semibold text-white mb-4">Call Volume</h2>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={volumeData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="date" tick={{ fill: '#4A7FBB', fontSize: 10 }}
                tickFormatter={d => new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })} interval={Math.floor(days / 6)} />
              <YAxis tick={{ fill: '#4A7FBB', fontSize: 10 }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Line type="monotone" dataKey="count" stroke="#E8622A" strokeWidth={2} dot={false} name="Calls" />
            </LineChart>
          </ResponsiveContainer>
          {!loading && volumeData.every(d => d.count === 0) && (
            <div style={{ position: 'absolute', inset: '40px 0 0 0', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(7,24,41,0.75)', borderRadius: 8 }}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 10, textAlign: 'center' }}>Call data will appear here after your first call.</p>
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', marginTop: 4 }}>Your agent is live — make a test call to get started.</p>
            </div>
          )}
        </div>

        {/* Outcome breakdown */}
        <div className="p-5 rounded-xl border" style={{ background: '#0A1E38', borderColor: 'rgba(255,255,255,0.06)', position: 'relative' }}>
          <h2 className="text-sm font-semibold text-white mb-4">Outcome Breakdown</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={outcomeData.length ? outcomeData : [{ name: '—', value: 0 }]} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
              <XAxis type="number" tick={{ fill: '#4A7FBB', fontSize: 10 }} />
              <YAxis dataKey="name" type="category" tick={{ fill: '#7BAED4', fontSize: 11 }} width={120} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="value" fill="#E8622A" radius={4} />
            </BarChart>
          </ResponsiveContainer>
          {!loading && outcomeData.every(d => d.value === 0) && (
            <div style={{ position: 'absolute', inset: '40px 0 0 0', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(7,24,41,0.75)', borderRadius: 8 }}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 10, textAlign: 'center' }}>Call data will appear here after your first call.</p>
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', marginTop: 4 }}>Your agent is live — make a test call to get started.</p>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Outcome pie */}
        <div className="p-5 rounded-xl border" style={{ background: '#0A1E38', borderColor: 'rgba(255,255,255,0.06)' }}>
          <h2 className="text-sm font-semibold text-white mb-4">Outcome Distribution</h2>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={outcomeData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                labelLine={{ stroke: '#4A7FBB' }}>
                {outcomeData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Busiest hours heatmap */}
        <div className="p-5 rounded-xl border" style={{ background: '#0A1E38', borderColor: 'rgba(255,255,255,0.06)' }}>
          <h2 className="text-sm font-semibold text-white mb-4">Busiest Hours</h2>
          <div className="overflow-x-auto">
            <div className="flex gap-0.5">
              <div className="flex flex-col gap-0.5 mr-1">
                <div className="w-8 h-4" />
                {dayNames.map(d => <div key={d} className="w-8 h-4 text-xs flex items-center" style={{ color: '#4A7FBB' }}>{d}</div>)}
              </div>
              {Array.from({ length: 24 }, (_, h) => (
                <div key={h} className="flex flex-col gap-0.5">
                  <div className="w-5 h-4 text-xs text-center" style={{ color: '#4A7FBB', fontSize: 9 }}>{h}</div>
                  {heatmap.map((row, d) => {
                    const intensity = row[h] / maxHeat
                    return (
                      <div key={d} title={`${dayNames[d]} ${h}:00 — ${row[h]} calls`}
                        className="w-5 h-4 rounded-sm"
                        style={{ background: intensity > 0 ? `rgba(232,98,42,${0.1 + intensity * 0.9})` : 'rgba(255,255,255,0.04)' }} />
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Top callers */}
      <div className="p-5 rounded-xl border" style={{ background: '#0A1E38', borderColor: 'rgba(255,255,255,0.06)' }}>
        <h2 className="text-sm font-semibold text-white mb-4">Top Callers</h2>
        {topCallers.length === 0 ? (
          <p className="text-sm text-center py-4" style={{ color: '#4A7FBB' }}>No call data yet</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr>{['Rank', 'Phone Number', 'Calls'].map(h => (
                <th key={h} className="pb-2 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: '#4A7FBB' }}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {topCallers.map(([phone, count], i) => (
                <tr key={phone} className="border-t" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
                  <td className="py-2.5" style={{ color: '#4A7FBB' }}>#{i + 1}</td>
                  <td className="py-2.5 font-medium text-white">{phone}</td>
                  <td className="py-2.5" style={{ color: '#E8622A' }}>{count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
