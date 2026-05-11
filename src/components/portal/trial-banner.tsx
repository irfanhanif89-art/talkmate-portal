'use client'

// Persistent banner shown at the top of every client-portal page while the
// account is in trial mode. The expired-trial full-page overlay lives in
// the same file so both UIs share data fetching.

import { useEffect, useState } from 'react'

interface TrialStatus {
  account_status: 'trial' | 'active' | 'pending' | 'expired' | 'suspended' | 'cancelled' | null
  trial_start_date: string | null
  trial_end_date: string | null
  days_remaining: number | null
  plan: string | null
}

function planStripeLink(plan: string | null | undefined): string | null {
  if (plan === 'starter') return process.env.NEXT_PUBLIC_STRIPE_STARTER_LINK ?? null
  if (plan === 'growth') return process.env.NEXT_PUBLIC_STRIPE_GROWTH_LINK ?? null
  if (plan === 'pro' || plan === 'professional') return process.env.NEXT_PUBLIC_STRIPE_PRO_LINK ?? null
  return null
}

export default function TrialBanner() {
  const [status, setStatus] = useState<TrialStatus | null>(null)

  useEffect(() => {
    let mounted = true
    fetch('/api/portal/trial-status')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (mounted && d && !('error' in d)) setStatus(d) })
      .catch(() => {})
    return () => { mounted = false }
  }, [])

  if (!status || status.account_status !== 'trial') return null

  const days = status.days_remaining ?? 0
  const stripeUrl = planStripeLink(status.plan)
  const headline =
    days <= 0 ? 'Your trial ends today'
    : days === 1 ? 'Your free trial ends tomorrow'
    : `Your free trial ends in ${days} days`

  return (
    <div style={{
      position: 'sticky', top: 0, zIndex: 70,
      background: 'linear-gradient(90deg, #E8622A 0%, #FF7A42 100%)',
      color: 'white',
      padding: '10px 20px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 12,
      fontFamily: 'Outfit, sans-serif',
      boxShadow: '0 2px 12px rgba(232,98,42,0.35)',
    }}>
      <span style={{ fontSize: 13, fontWeight: 700 }}>
        {headline} — activate now to keep your agent live.
      </span>
      {stripeUrl ? (
        <a
          href={stripeUrl}
          style={{
            padding: '7px 16px', borderRadius: 7,
            background: 'white', color: '#E8622A',
            fontSize: 12, fontWeight: 800, letterSpacing: '0.04em',
            textDecoration: 'none', whiteSpace: 'nowrap' as const,
          }}
        >ACTIVATE PLAN →</a>
      ) : (
        <span style={{ fontSize: 11, fontWeight: 600, opacity: 0.85 }}>
          Contact support to activate
        </span>
      )}
    </div>
  )
}

export function TrialExpiredOverlay() {
  const [status, setStatus] = useState<TrialStatus | null>(null)

  useEffect(() => {
    let mounted = true
    fetch('/api/portal/trial-status')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (mounted && d && !('error' in d)) setStatus(d) })
      .catch(() => {})
    return () => { mounted = false }
  }, [])

  if (!status || status.account_status !== 'expired') return null

  const stripeUrl = planStripeLink(status.plan)
  const irfanPhone = process.env.NEXT_PUBLIC_IRFAN_PHONE ?? null

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(6,19,34,0.92)',
      backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
      fontFamily: 'Outfit, sans-serif',
    }}>
      <div style={{
        maxWidth: 520, width: '100%',
        background: '#0A1E38', borderRadius: 18,
        border: '1px solid rgba(255,255,255,0.08)',
        padding: 36, textAlign: 'center' as const,
        boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: '50%',
          background: 'rgba(232,98,42,0.15)', border: '1px solid rgba(232,98,42,0.4)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 28, color: '#E8622A', marginBottom: 18,
        }}>⏰</div>

        <h2 style={{ fontSize: 24, fontWeight: 800, color: 'white', margin: 0, marginBottom: 12, letterSpacing: '-0.5px' }}>
          Your free trial has ended
        </h2>
        <p style={{ fontSize: 15, color: '#7BAED4', lineHeight: 1.6, margin: 0, marginBottom: 22 }}>
          We hope TalkMate made a difference over the last 7 days. To keep
          your agent live and continue handling calls, activate your plan
          below.
        </p>

        {stripeUrl ? (
          <a
            href={stripeUrl}
            style={{
              display: 'inline-block',
              padding: '14px 28px', borderRadius: 10,
              background: '#E8622A', color: 'white',
              fontSize: 14, fontWeight: 800, letterSpacing: '0.04em',
              textDecoration: 'none', marginBottom: 16,
              boxShadow: '0 6px 20px rgba(232,98,42,0.4)',
            }}
          >ACTIVATE MY PLAN →</a>
        ) : (
          <p style={{ fontSize: 13, color: '#F59E0B', marginBottom: 16 }}>
            Payment link unavailable. Please contact support to reactivate.
          </p>
        )}

        <p style={{ fontSize: 12, color: '#7BAED4', margin: 0 }}>
          Questions? {irfanPhone
            ? <>Call or text Irfan on <a href={`tel:${irfanPhone}`} style={{ color: '#4A9FE8', textDecoration: 'none' }}>{irfanPhone}</a></>
            : <>Email <a href="mailto:hello@talkmate.com.au" style={{ color: '#4A9FE8', textDecoration: 'none' }}>hello@talkmate.com.au</a></>}
        </p>
      </div>
    </div>
  )
}
