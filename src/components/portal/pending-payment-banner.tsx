'use client'

// Sticky banner shown when a client has signed up via the self-serve
// "Pay now" path but hasn't completed their Stripe checkout yet
// (account_status = 'pending_payment'). Self-fetches /api/portal/trial-status
// which already returns account_status + plan, so we don't need a
// separate endpoint.
//
// Mirrors TrialBanner's z-index/sticky behaviour — sits below the
// impersonation banner and the trial banner if either is also showing.

import { useEffect, useState } from 'react'

interface Status {
  account_status: string | null
  plan: string | null
}

function planStripeLink(plan: string | null | undefined): string | null {
  if (plan === 'starter') return process.env.NEXT_PUBLIC_STRIPE_STARTER_LINK ?? null
  if (plan === 'growth') return process.env.NEXT_PUBLIC_STRIPE_GROWTH_LINK ?? null
  if (plan === 'pro') return process.env.NEXT_PUBLIC_STRIPE_PRO_LINK ?? null
  return null
}

export default function PendingPaymentBanner() {
  const [status, setStatus] = useState<Status | null>(null)

  useEffect(() => {
    let mounted = true
    fetch('/api/portal/trial-status')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (mounted && d && !('error' in d)) setStatus(d) })
      .catch(() => {})
    return () => { mounted = false }
  }, [])

  if (!status || status.account_status !== 'pending_payment') return null

  const stripeUrl = planStripeLink(status.plan)

  return (
    <div style={{
      position: 'sticky', top: 0, zIndex: 65,
      background: 'linear-gradient(90deg, #F59E0B 0%, #FBBF24 100%)',
      color: '#1F1300',
      padding: '10px 20px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 12, flexWrap: 'wrap' as const,
      fontFamily: 'Outfit, sans-serif',
      boxShadow: '0 2px 12px rgba(245,158,11,0.35)',
    }}>
      <span style={{ fontSize: 13, fontWeight: 700 }}>
        Your account is pending payment. To activate your agent please complete your subscription.
      </span>
      {stripeUrl ? (
        <a
          href={stripeUrl}
          style={{
            padding: '7px 16px', borderRadius: 7,
            background: '#1F1300', color: '#FBBF24',
            fontSize: 12, fontWeight: 800, letterSpacing: '0.04em',
            textDecoration: 'none', whiteSpace: 'nowrap' as const,
          }}
        >COMPLETE SETUP →</a>
      ) : (
        <span style={{ fontSize: 11, fontWeight: 700 }}>
          Contact support to complete your subscription.
        </span>
      )}
    </div>
  )
}
