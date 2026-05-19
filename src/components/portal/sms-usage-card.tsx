'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

// Session 19 — SMS This Month card. Self-fetches from
// /api/dashboard/sms-usage. Starter accounts see an upgrade prompt
// instead of the usage bar.

interface UsageData {
  plan: string
  used: number
  cap: number
  resetAt: string | null
}

function nextResetDate(resetAt: string | null): string {
  // sms_reset_at is set to date_trunc('month', now()) when the counter
  // last reset. The next reset is the start of the following month.
  const base = resetAt ? new Date(resetAt) : new Date()
  const year = base.getFullYear()
  const month = base.getMonth() + 1
  const next = new Date(year, month + 1, 1) // first day of month-after-base + 1
  // Actually: if resetAt is the start of THIS month, next reset is the
  // first of the upcoming month.
  next.setFullYear(year, month, 1)
  return next.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

export default function SmsUsageCard() {
  const [data, setData] = useState<UsageData | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch('/api/dashboard/sms-usage')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (!cancelled) { setData(d); setLoaded(true) } })
      .catch(() => { if (!cancelled) setLoaded(true) })
    return () => { cancelled = true }
  }, [])

  if (!loaded || !data) return null

  if (data.cap === 0) {
    // Starter plan — keep the card on the dashboard but show an honest
    // "not included" state with a single upgrade CTA.
    return (
      <Link href="/billing" style={{ textDecoration: 'none' }}>
        <div style={cardStyle}>
          <div style={{ height: 2, background: 'linear-gradient(90deg, rgba(255,255,255,0.15), rgba(255,255,255,0.05))' }} />
          <div style={{ padding: '16px 18px' }}>
            <div style={labelStyle}>SMS This Month</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'rgba(255,255,255,0.45)', lineHeight: 1, marginBottom: 4, letterSpacing: '-1px' }}>—</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>SMS not included</div>
            <div style={{ fontSize: 12, color: '#E8622A', fontWeight: 600 }}>Upgrade to Growth →</div>
          </div>
        </div>
      </Link>
    )
  }

  const pct = Math.min(100, Math.round((data.used / data.cap) * 100))
  const accent = pct >= 90 ? '#EF4444' : pct >= 75 ? '#F59E0B' : '#22C55E'

  return (
    <Link href="/sms-activity" style={{ textDecoration: 'none' }}>
      <div style={{ ...cardStyle, cursor: 'pointer' }}>
        <div style={{ height: 2, background: `linear-gradient(90deg, ${accent}, #1565C0)` }} />
        <div style={{ padding: '16px 18px' }}>
          <div style={labelStyle}>SMS This Month</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 6 }}>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'white', lineHeight: 1, letterSpacing: '-1px' }}>
              {data.used}
            </div>
            <span style={{ fontSize: 13, color: '#4A7FBB', fontWeight: 500 }}>
              of {data.cap} messages
            </span>
          </div>
          <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 99, overflow: 'hidden', marginBottom: 8 }}>
            <div style={{ width: `${pct}%`, height: '100%', background: accent, transition: 'width 0.3s' }} />
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
            Resets {nextResetDate(data.resetAt)}
          </div>
        </div>
      </div>
    </Link>
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
