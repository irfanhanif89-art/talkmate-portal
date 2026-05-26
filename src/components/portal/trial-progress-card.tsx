'use client'

import { useEffect, useState } from 'react'

interface TrialStatus {
  account_status: string | null
  trial_start_date: string | null
  trial_end_date: string | null
  days_remaining: number | null
  plan: string | null
}

function planStripeLink(plan: string | null | undefined): string | null {
  if (plan === 'starter') return process.env.NEXT_PUBLIC_STRIPE_STARTER_LINK ?? null
  if (plan === 'growth') return process.env.NEXT_PUBLIC_STRIPE_GROWTH_LINK ?? null
  if (plan === 'pro') return process.env.NEXT_PUBLIC_STRIPE_PRO_LINK ?? null
  return null
}

// Self-contained card that fetches its own trial status. Mounted at the
// top of the client dashboard; renders nothing when the account isn't on
// trial.
export default function TrialProgressCard({ callsThisMonth }: { callsThisMonth: number }) {
  const [status, setStatus] = useState<TrialStatus | null>(null)

  useEffect(() => {
    let mounted = true
    fetch('/api/portal/trial-status')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (mounted && d && !('error' in d)) setStatus(d) })
      .catch(() => {})
    return () => { mounted = false }
  }, [])

  if (!status || status.account_status !== 'trial' || !status.trial_start_date) return null

  const start = new Date(status.trial_start_date).getTime()
  const elapsedDays = Math.min(7, Math.max(1, Math.ceil((Date.now() - start) / (24 * 60 * 60 * 1000))))
  const pct = Math.min(100, Math.round((elapsedDays / 7) * 100))
  const stripeUrl = planStripeLink(status.plan)

  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(232,98,42,0.10) 0%, rgba(74,159,232,0.05) 100%)',
      border: '1px solid rgba(232,98,42,0.30)',
      borderRadius: 14, padding: 22, marginBottom: 22,
      fontFamily: 'Outfit, sans-serif',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <p style={{ fontSize: 11, fontWeight: 800, color: '#E8622A', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>
            Trial progress
          </p>
          <p style={{ fontSize: 18, fontWeight: 800, color: 'white', margin: '4px 0 0 0', letterSpacing: '-0.3px' }}>
            Day {elapsedDays} of 7
          </p>
        </div>
        {stripeUrl && (
          <a
            href={stripeUrl}
            style={{
              padding: '10px 20px', borderRadius: 9,
              background: '#E8622A', color: 'white',
              fontSize: 12, fontWeight: 800, letterSpacing: '0.04em',
              textDecoration: 'none', whiteSpace: 'nowrap' as const,
              boxShadow: '0 4px 14px rgba(232,98,42,0.3)',
            }}
          >ACTIVATE PLAN →</a>
        )}
      </div>

      <div style={{
        height: 8, borderRadius: 99, background: 'rgba(255,255,255,0.08)',
        overflow: 'hidden', marginBottom: 12,
      }}>
        <div style={{
          width: `${pct}%`, height: '100%',
          background: 'linear-gradient(90deg, #E8622A 0%, #FF7A42 100%)',
          transition: 'width 0.4s ease',
        }} />
      </div>

      <p style={{ fontSize: 13, color: '#7BAED4', margin: 0 }}>
        <strong style={{ color: 'white' }}>{callsThisMonth}</strong> call{callsThisMonth === 1 ? '' : 's'} handled during your trial.
        {' '}{status.days_remaining !== null && (
          status.days_remaining <= 0
            ? 'Trial ends today.'
            : status.days_remaining === 1
              ? 'Trial ends tomorrow.'
              : `${status.days_remaining} day${status.days_remaining === 1 ? '' : 's'} remaining.`
        )}
      </p>
    </div>
  )
}
