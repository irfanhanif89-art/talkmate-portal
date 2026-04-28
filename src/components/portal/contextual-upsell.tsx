'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export interface UpsellContext {
  callsUsed: number
  callsLimit: number | null
  daysSinceSignup: number
  plan: string
  monthlyRevenue: number
  hasReferrals: boolean
}

interface Banner {
  key: string
  message: string
  cta: string
  href: string
  severity: 'info' | 'warning' | 'urgent'
}

function pick(ctx: UpsellContext): Banner | null {
  const { callsUsed, callsLimit, daysSinceSignup, plan, monthlyRevenue, hasReferrals } = ctx

  if (callsLimit && callsUsed / callsLimit >= 0.95) {
    return {
      key: 'cap95',
      message: '⚠️ You\'re almost at your call limit. Upgrade now to avoid any calls being missed.',
      cta: 'Upgrade plan →', href: '/billing', severity: 'urgent',
    }
  }
  if (callsLimit && callsUsed / callsLimit >= 0.7) {
    const remaining = callsLimit - callsUsed
    const expectedOver = Math.max(0, Math.round((callsUsed / Math.max(daysSinceSignup, 1)) * 30 - callsLimit))
    return {
      key: 'cap70',
      message: `You've used ${callsUsed} of ${callsLimit} calls. At this rate you'll exceed your plan by ~${expectedOver} calls ($${(expectedOver * 0.45).toFixed(2)}). Upgrade to Growth for 800 calls + Command Centre — just $200 more.`,
      cta: 'Upgrade to Growth →', href: '/billing', severity: 'warning',
    }
  }
  if (plan === 'starter' && daysSinceSignup >= 14 && callsUsed >= 100) {
    return {
      key: 'starter-good',
      message: `You've answered ${callsUsed} calls and captured an estimated $${monthlyRevenue.toLocaleString()} in revenue. Growth users capture 2.5× more on average.`,
      cta: 'Compare plans →', href: '/billing', severity: 'info',
    }
  }
  if (!hasReferrals && daysSinceSignup >= 30) {
    return {
      key: 'partner',
      message: 'Did you know you could be earning $74/month just by telling one other business about TalkMate?',
      cta: 'Join the Partner Program →', href: '/refer-and-earn', severity: 'info',
    }
  }
  return null
}

const DISMISS_KEY = 'upsell_banner_v2_dismissed'

export default function ContextualUpsellBanner({ ctx }: { ctx: UpsellContext }) {
  const router = useRouter()
  const [dismissed, setDismissed] = useState(false)
  const [banner, setBanner] = useState<Banner | null>(null)

  useEffect(() => {
    setBanner(pick(ctx))
    const stamp = localStorage.getItem(DISMISS_KEY)
    if (stamp && Date.now() - parseInt(stamp, 10) < 7 * 24 * 60 * 60 * 1000) setDismissed(true)
  }, [ctx])

  if (dismissed || !banner) return null

  const colors = {
    urgent: { bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.4)', cta: '#EF4444' },
    warning: { bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.3)', cta: '#E8622A' },
    info: { bg: 'rgba(74,159,232,0.06)', border: 'rgba(74,159,232,0.25)', cta: '#E8622A' },
  }[banner.severity]

  return (
    <div style={{
      background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 12,
      padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18,
    }}>
      <div style={{ flex: 1, fontSize: 13, color: 'white', lineHeight: 1.5 }}>{banner.message}</div>
      <button
        onClick={() => router.push(banner.href)}
        style={{
          background: colors.cta, color: 'white', border: 'none', padding: '8px 14px',
          borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Outfit, sans-serif', flexShrink: 0,
        }}
      >{banner.cta}</button>
      <button
        onClick={() => { localStorage.setItem(DISMISS_KEY, String(Date.now())); setDismissed(true) }}
        aria-label="Dismiss for 7 days"
        style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.35)', cursor: 'pointer', fontSize: 14 }}
      >✕</button>
    </div>
  )
}
