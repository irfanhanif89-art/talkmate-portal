'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

// Session 18 — Agent Quality dashboard card.
// Self-fetches from /api/dashboard/agent-quality so the existing
// dashboard prop chain doesn't need to thread intelligence data.

interface QualityData {
  avg7: number | null
  avgPrev: number | null
  count7: number
  flaggedToday: number
}

export default function AgentQualityCard() {
  const [data, setData] = useState<QualityData | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch('/api/dashboard/agent-quality')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (!cancelled) { setData(d); setLoaded(true) } })
      .catch(() => { if (!cancelled) setLoaded(true) })
    return () => { cancelled = true }
  }, [])

  if (!loaded) return null
  if (!data || data.count7 === 0) {
    // No scored calls yet — keep the card on the dashboard but show an
    // honest empty state so the owner knows the feature is on.
    return (
      <div style={cardStyle}>
        <div style={{ height: 2, background: 'linear-gradient(90deg, #4A9FE8, #1565C0)' }} />
        <div style={{ padding: '16px 18px' }}>
          <div style={labelStyle}>Agent Quality</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'rgba(255,255,255,0.45)', lineHeight: 1, marginBottom: 4, letterSpacing: '-1px' }}>—</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Scores appear after your first calls</div>
        </div>
      </div>
    )
  }

  const score = data.avg7 ?? 0
  const accent = score >= 8 ? '#22C55E' : score >= 6 ? '#F59E0B' : '#EF4444'

  let trend: { arrow: string; color: string; label: string } | null = null
  if (data.avgPrev != null && data.avg7 != null) {
    const diff = Math.round((data.avg7 - data.avgPrev) * 10) / 10
    if (diff > 0.1) trend = { arrow: '↑', color: '#22C55E', label: `+${diff} vs prior 7d` }
    else if (diff < -0.1) trend = { arrow: '↓', color: '#EF4444', label: `${diff} vs prior 7d` }
    else trend = { arrow: '→', color: 'rgba(255,255,255,0.4)', label: 'steady vs prior 7d' }
  }

  return (
    <div style={cardStyle}>
      <div style={{ height: 2, background: `linear-gradient(90deg, ${accent}, #1565C0)` }} />
      <div style={{ padding: '16px 18px' }}>
        <div style={labelStyle}>Agent Quality</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'white', lineHeight: 1, letterSpacing: '-1px' }}>
            {data.avg7?.toFixed(1)} <span style={{ fontSize: 12, fontWeight: 500, color: '#4A7FBB' }}>/ 10</span>
          </div>
          {trend && (
            <span style={{ fontSize: 12, fontWeight: 700, color: trend.color }} title={trend.label}>
              {trend.arrow}
            </span>
          )}
        </div>
        <div style={{ fontSize: 11, fontWeight: 300, color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>Last 7 days</div>

        {data.flaggedToday > 0 ? (
          <Link href="/calls?filter=flagged" style={{ fontSize: 12, color: '#E8622A', fontWeight: 600, textDecoration: 'none' }}>
            {data.flaggedToday} flagged today →
          </Link>
        ) : (
          <div style={{ fontSize: 12, color: '#22C55E', fontWeight: 600 }}>All clear today</div>
        )}
      </div>
    </div>
  )
}

const cardStyle: React.CSSProperties = {
  background: '#0A1E38',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 16,
  overflow: 'hidden',
}

const labelStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
  color: '#4A7FBB',
  marginBottom: 8,
}
