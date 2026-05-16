'use client'

// Session 16 -- shared locked preview shell.
//
// Renders a plan-gated page in three layers:
//   1. Upgrade banner pinned to the top of the content area
//   2. Demo content (children) at full opacity, pointer-events disabled
//   3. Lock bar pinned to the bottom of the content area
//
// Variants:
//   adminClientId set      -> "Upgrade this client" links to admin edit modal
//   variant === 'info'     -> Blue banner, no upgrade button (industry mismatch)
//   default                -> Orange banner with Stripe payment link

import { useRouter } from 'next/navigation'
import { Lock } from 'lucide-react'

type UpgradeTarget = 'growth' | 'pro'

interface Props {
  // Banner content
  bannerTitle: string
  bannerSubtitle: string
  featurePills: string[]
  upgradeTarget: UpgradeTarget          // which plan they upgrade to
  upgradePrice: number                  // e.g. 499 or 799

  // Lock bar content
  lockPlanLabel: string                 // "Pro feature preview"
  lockBoldText: string                  // "This is a preview of Dispatch"
  lockMutedText: string                 // one-line description

  // Optional admin override
  adminClientId?: string | null

  // Info variant -- no upgrade button, blue banner
  variant?: 'upgrade' | 'info'

  children: React.ReactNode
}

function stripeLinkFor(target: UpgradeTarget): string | null {
  if (target === 'growth') return process.env.NEXT_PUBLIC_STRIPE_GROWTH_LINK ?? null
  if (target === 'pro') return process.env.NEXT_PUBLIC_STRIPE_PRO_LINK ?? null
  return null
}

function planLabel(target: UpgradeTarget): string {
  return target === 'pro' ? 'Pro' : 'Growth'
}

export default function LockedPreview({
  bannerTitle,
  bannerSubtitle,
  featurePills,
  upgradeTarget,
  upgradePrice,
  lockPlanLabel,
  lockBoldText,
  lockMutedText,
  adminClientId,
  variant = 'upgrade',
  children,
}: Props) {
  const router = useRouter()
  const isAdmin = !!adminClientId
  const isInfo = variant === 'info'
  const planName = planLabel(upgradeTarget)
  const stripeUrl = stripeLinkFor(upgradeTarget)
  const upgradeLabel = `Upgrade to ${planName} -- $${upgradePrice}/mo`
  const adminUpgradeHref = adminClientId ? `/admin/clients/${adminClientId}` : '#'
  const billingFallback = '/billing'

  function handleUpgrade() {
    if (isAdmin) {
      router.push(adminUpgradeHref)
      return
    }
    if (stripeUrl) {
      window.location.href = stripeUrl
      return
    }
    router.push(billingFallback)
  }

  const bannerGradient = isInfo
    ? 'linear-gradient(135deg, #1565C0, #0D47A1)'
    : 'linear-gradient(135deg, #E8622A, #c44d1a)'
  const bannerShadow = isInfo
    ? '0 4px 24px rgba(21,101,192,0.35)'
    : '0 4px 24px rgba(232,98,42,0.35)'

  return (
    <div style={{ position: 'relative', minHeight: '100%' }}>
      {/* Top banner */}
      <div
        style={{
          background: bannerGradient,
          padding: '14px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
          boxShadow: bannerShadow,
          color: 'white',
          fontFamily: 'Outfit, sans-serif',
          position: 'sticky',
          top: 0,
          zIndex: 30,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 1, minWidth: 0 }}>
          <div
            style={{
              width: 38, height: 38, borderRadius: 9,
              background: 'rgba(255,255,255,0.20)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Lock size={18} color="white" />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.3 }}>{bannerTitle}</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 2 }}>{bannerSubtitle}</div>
            {featurePills.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {featurePills.map(p => (
                  <span
                    key={p}
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      padding: '3px 9px',
                      borderRadius: 99,
                      background: 'rgba(255,255,255,0.18)',
                      border: '1px solid rgba(255,255,255,0.25)',
                      color: 'white',
                      letterSpacing: '0.02em',
                    }}
                  >
                    {p}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {!isInfo && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <a
              href="https://talkmate.com.au/pricing"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                padding: '9px 16px',
                borderRadius: 9,
                fontSize: 13,
                fontWeight: 600,
                color: 'white',
                background: 'transparent',
                border: '1px solid rgba(255,255,255,0.4)',
                textDecoration: 'none',
                fontFamily: 'Outfit, sans-serif',
                whiteSpace: 'nowrap',
              }}
            >
              See what's included
            </a>
            <button
              type="button"
              onClick={handleUpgrade}
              style={{
                padding: '10px 18px',
                borderRadius: 9,
                fontSize: 13,
                fontWeight: 800,
                color: '#E8622A',
                background: 'white',
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'Outfit, sans-serif',
                whiteSpace: 'nowrap',
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              }}
            >
              {isAdmin ? 'Upgrade this client' : upgradeLabel}
            </button>
          </div>
        )}
      </div>

      {/* Demo content -- visually present, not interactive */}
      <div
        aria-hidden="true"
        style={{
          pointerEvents: 'none',
          userSelect: 'none',
          opacity: 1,
          paddingBottom: 96,
          fontFamily: 'Outfit, sans-serif',
        }}
      >
        {children}
      </div>

      {/* Bottom lock bar */}
      {!isInfo && (
        <div
          style={{
            position: 'sticky',
            bottom: 0,
            left: 0,
            right: 0,
            background: '#0d1f35',
            borderTop: '2px solid #E8622A',
            padding: '14px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 14,
            flexWrap: 'wrap',
            zIndex: 30,
            fontFamily: 'Outfit, sans-serif',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
            <div
              style={{
                width: 34, height: 34, borderRadius: 8,
                background: 'rgba(232,98,42,0.15)',
                border: '1px solid rgba(232,98,42,0.45)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Lock size={15} color="#E8622A" />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#7BAED4', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {lockPlanLabel}
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'white', marginTop: 2 }}>{lockBoldText}</div>
              <div style={{ fontSize: 12, color: '#7BAED4', marginTop: 2 }}>{lockMutedText}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={handleUpgrade}
            style={{
              padding: '10px 18px',
              borderRadius: 9,
              fontSize: 13,
              fontWeight: 800,
              color: 'white',
              background: '#E8622A',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'Outfit, sans-serif',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            {isAdmin ? 'Upgrade this client' : upgradeLabel}
          </button>
        </div>
      )}
    </div>
  )
}
