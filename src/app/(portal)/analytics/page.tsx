'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useBusinessType } from '@/context/business-type-context'
import { KpiCard } from '@/components/portal/ui-v2/kpi-card'
import { Panel, PanelHeader } from '@/components/portal/ui-v2/panel'
import { FilterTabs } from '@/components/portal/ui-v2/tabs'
import { LineVolumeChart, OutcomeBars, Heatmap } from '@/components/portal/ui-v2/charts'
import { ButtonV2 } from '@/components/portal/ui-v2/button'

type Range = '7d' | '30d' | '90d'

const RANGE_TABS = [
  { value: '7d' as Range, label: '7D' },
  { value: '30d' as Range, label: '30D' },
  { value: '90d' as Range, label: '90D' },
]

// Outcome colour mapping using CSS token vars
const OUTCOME_COLORS: Record<string, string> = {
  'Missed': 'var(--red)',
  'Escalated': 'var(--gold)',
  'Transferred': 'var(--gold)',
  'Unknown': 'var(--faint)',
}
function outcomeColor(name: string, idx: number): string {
  if (OUTCOME_COLORS[name]) return OUTCOME_COLORS[name]
  // First outcome gets orange, second blue, rest faint
  if (idx === 0) return 'var(--orange)'
  if (idx === 1) return 'var(--blue)'
  return 'var(--faint)'
}

// Heatmap covers 7am–7pm (hours 7..18 inclusive = 12 slots)
const HEATMAP_HOURS = Array.from({ length: 12 }, (_, i) => {
  const h = i + 7
  return h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`
})
const HEATMAP_DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
// Map JS getDay() (0=Sun) to Mon-first index
function dayIndex(jsDay: number): number {
  return jsDay === 0 ? 6 : jsDay - 1
}

export default function AnalyticsPage() {
  const { config, businessId } = useBusinessType()
  const supabase = createClient()
  const [range, setRange] = useState<Range>('30d')
  const [calls, setCalls] = useState<Array<{
    created_at: string
    outcome: string
    transferred: boolean
    duration_seconds: number
    caller_number: string
  }>>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchData() }, [range, businessId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchData() {
    setLoading(true)
    const days = range === '7d' ? 7 : range === '30d' ? 30 : 90
    const from = new Date(); from.setDate(from.getDate() - days)
    const { data } = await supabase
      .from('calls')
      .select('created_at, outcome, transferred, duration_seconds, caller_number')
      .eq('business_id', businessId)
      .gte('created_at', from.toISOString())
      .order('created_at')
    setCalls(data ?? [])
    setLoading(false)
  }

  // ── Volume by day ──────────────────────────────────────────────────────────
  const days = range === '7d' ? 7 : range === '30d' ? 30 : 90
  const dayMap: Record<string, number> = {}
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i)
    dayMap[d.toISOString().split('T')[0]] = 0
  }
  calls.forEach(c => {
    const d = c.created_at.split('T')[0]
    if (dayMap[d] !== undefined) dayMap[d]++
  })
  // LineVolumeChart expects { label, value }
  const volumeData = Object.entries(dayMap).map(([date, count]) => ({
    label: new Date(date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }),
    value: count,
  }))

  // ── Outcome breakdown ──────────────────────────────────────────────────────
  const outcomeCounts: Record<string, number> = {}
  calls.forEach(c => {
    const key = c.outcome || 'Unknown'
    outcomeCounts[key] = (outcomeCounts[key] || 0) + 1
  })
  const total = calls.length
  const outcomeRows = Object.entries(outcomeCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count], idx) => ({
      label: name,
      pct: total ? Math.round((count / total) * 100) : 0,
      color: outcomeColor(name, idx),
    }))

  // ── Peak hours heatmap (7am–7pm, Mon–Sun) ─────────────────────────────────
  // heatRaw[monFirstDayIdx][hourIdx 0..11] where hourIdx 0 = 7am
  const heatRaw: number[][] = Array.from({ length: 7 }, () => Array(12).fill(0))
  calls.forEach(c => {
    const d = new Date(c.created_at)
    const h = d.getHours()
    if (h < 7 || h >= 19) return // outside 7am–7pm window
    const di = dayIndex(d.getDay())
    const hi = h - 7
    heatRaw[di][hi]++
  })
  const maxHeat = Math.max(1, ...heatRaw.flat())
  // Normalise to 0..1
  const heatValues = heatRaw.map(row => row.map(v => v / maxHeat))

  // ── Top callers ────────────────────────────────────────────────────────────
  const callerMap: Record<string, number> = {}
  calls.forEach(c => {
    if (c.caller_number) callerMap[c.caller_number] = (callerMap[c.caller_number] || 0) + 1
  })
  const topCallers = Object.entries(callerMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)

  // ── KPI computations ───────────────────────────────────────────────────────
  const totalCalls = calls.length
  const answered = calls.filter(c => c.outcome && c.outcome !== 'Missed').length
  const answerRate = totalCalls ? Math.round((answered / totalCalls) * 100) : 0
  const transferred = calls.filter(c => c.transferred).length
  const aiResolution = totalCalls ? Math.round(((totalCalls - transferred) / totalCalls) * 100) : 0
  const avgDuration = calls.length
    ? Math.round(calls.reduce((a, c) => a + (c.duration_seconds || 0), 0) / calls.length)
    : 0
  const avgDurationFmt = avgDuration >= 60
    ? `${Math.floor(avgDuration / 60)}:${String(avgDuration % 60).padStart(2, '0')}`
    : `0:${String(avgDuration).padStart(2, '0')}`
  const primaryCount = calls.filter(c => c.outcome === config.callOutcomeTypes?.[0]).length

  // Date span label
  const now = new Date()
  const from = new Date(); from.setDate(now.getDate() - days)
  const spanLabel = `${from.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })} – ${now.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}`

  function handleExport() {
    // Export analytics as CSV (real data)
    const rows = [
      ['Date', 'Outcome', 'Transferred', 'Duration (s)', 'Caller Number'],
      ...calls.map(c => [
        c.created_at,
        c.outcome ?? '',
        String(c.transferred),
        String(c.duration_seconds ?? 0),
        c.caller_number ?? '',
      ]),
    ]
    const csv = rows.map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `analytics-${range}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-col min-h-full">
      {/* Top bar */}
      <header className="flex items-center gap-4 border-b border-line px-7 h-[68px] flex-shrink-0">
        <h1 className="text-[20px] font-extrabold tracking-[-0.4px] text-text">Analytics</h1>
        <div className="ml-auto">
          <ButtonV2 variant="secondary" onClick={handleExport} className="flex items-center gap-1.5">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Export report
          </ButtonV2>
        </div>
      </header>

      {/* Date range bar */}
      <div className="flex items-center gap-3 border-b border-line px-7 h-[54px] flex-shrink-0">
        <FilterTabs
          tabs={RANGE_TABS}
          value={range}
          onChange={setRange}
        />
        <span className="text-[13px] text-dim ml-1">{spanLabel}</span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-7 pt-5 pb-6">
        {/* KPI row — 5 cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-[14px] mb-[18px]">
          <KpiCard
            label="Total Calls"
            value={loading ? '—' : totalCalls}
          />
          <KpiCard
            label="Answer Rate"
            value={loading ? '—' : `${answerRate}%`}
            accent={answerRate >= 90 ? 'green' : undefined}
          />
          <KpiCard
            label="Avg Duration"
            value={loading ? '—' : avgDurationFmt}
          />
          <KpiCard
            label="AI Resolution"
            value={loading ? '—' : `${aiResolution}%`}
            accent={aiResolution >= 80 ? 'green' : undefined}
          />
          <KpiCard
            label={config.callOutcomeTypes?.[0] ?? 'Primary Outcome'}
            value={loading ? '—' : primaryCount}
            accent="orange"
          />
        </div>

        {/* Main grid: call volume + top callers */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-4 mb-4">
          {/* Call volume */}
          <Panel>
            <PanelHeader
              title={`Call volume — ${days} days`}
              meta={
                <span className="flex items-center gap-3">
                  <span className="flex items-center gap-1.5 text-[11.5px] text-dim">
                    <i className="inline-block w-2 h-2 rounded-[2px]" style={{ background: 'rgba(91,155,217,0.7)' }} />
                    Handled
                  </span>
                  <span className="flex items-center gap-1.5 text-[11.5px] text-dim">
                    <i className="inline-block w-2 h-2 rounded-[2px]" style={{ background: 'var(--orange)' }} />
                    Peak
                  </span>
                </span>
              }
            />
            {!loading && volumeData.every(d => d.value === 0) ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                </svg>
                <p className="mt-3 text-[12px] text-faint">Call data will appear here after your first call.</p>
                <p className="mt-1 text-[11px]" style={{ color: 'var(--faint)', opacity: 0.6 }}>Your agent is live — make a test call to get started.</p>
              </div>
            ) : (
              <LineVolumeChart data={volumeData} height={170} />
            )}
          </Panel>

          {/* Top callers */}
          <Panel>
            <PanelHeader title="Top callers" meta={spanLabel.split(' – ')[1]} />
            {topCallers.length === 0 ? (
              <p className="text-[12px] text-dim text-center py-6">No call data yet</p>
            ) : (
              <div className="flex flex-col">
                {topCallers.map(([phone, count], i) => {
                  // Build initials from phone digits for avatar
                  const initials = phone.slice(-2)
                  return (
                    <div
                      key={phone}
                      className="flex items-center gap-[10px] py-2 border-b border-line last:border-0"
                    >
                      {/* Avatar */}
                      <div
                        className="w-[30px] h-[30px] rounded-[8px] flex items-center justify-center text-[12px] font-bold flex-shrink-0 text-dim"
                        style={{ background: 'linear-gradient(135deg,#2a4a6a,#1a3350)' }}
                      >
                        {initials}
                      </div>
                      {/* Phone number */}
                      <span className="flex-1 min-w-0 text-[13px] font-bold text-text truncate">
                        {phone}
                      </span>
                      {/* Call count */}
                      <span className="text-[12px] font-bold text-orange flex-shrink-0">
                        {count} {count === 1 ? 'call' : 'calls'}
                      </span>
                      {/* Rank badge */}
                      <span className="text-[11px] text-faint flex-shrink-0 w-5 text-right">
                        #{i + 1}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </Panel>
        </div>

        {/* Bottom grid: outcomes + heatmap */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Call outcomes */}
          <Panel>
            <PanelHeader title="Call outcomes" meta={`${days} days`} />
            {outcomeRows.length === 0 ? (
              <p className="text-[12px] text-dim text-center py-6">No outcome data yet</p>
            ) : (
              <OutcomeBars rows={outcomeRows} />
            )}
          </Panel>

          {/* Peak hours heatmap */}
          <Panel className="lg:col-span-2">
            <PanelHeader title="Peak hours heatmap" meta="Mon–Sun · 7am–7pm" />
            <Heatmap
              days={HEATMAP_DAY_LABELS}
              hours={HEATMAP_HOURS}
              values={heatValues}
            />
          </Panel>
        </div>
      </div>
    </div>
  )
}
