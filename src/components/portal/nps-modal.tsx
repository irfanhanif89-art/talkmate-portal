'use client'

import { useEffect, useState } from 'react'

interface Props {
  open: boolean
  trigger: 'day30' | 'day90'
  businessName?: string
  onSubmit: (score: number) => Promise<void> | void
  onSubmitted?: (score: number) => void
}

// Single-question NPS popup — non-dismissable until answered.
export default function NpsModal({ open, trigger, businessName, onSubmit, onSubmitted }: Props) {
  const [hover, setHover] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Lock body scroll while open
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  if (!open) return null

  async function pick(score: number) {
    if (submitting) return
    setSubmitting(true)
    try {
      await onSubmit(score)
      onSubmitted?.(score)
    } finally {
      setSubmitting(false)
    }
  }

  const subtitle = trigger === 'day30'
    ? 'You\'ve been with TalkMate for a month — your honest feedback shapes what we build next.'
    : 'You\'ve been a TalkMate customer for 3 months. We\'d love to hear how it\'s going.'

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.78)', zIndex: 1200,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div style={{
        background: '#0A1E38', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 18,
        padding: 32, width: '100%', maxWidth: 520, boxShadow: '0 24px 56px rgba(0,0,0,0.5)',
      }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>👋</div>
        <h2 style={{ fontSize: '1.3rem', fontWeight: 800, color: 'white', marginBottom: 8 }}>
          One quick question{businessName ? `, ${businessName}` : ''}
        </h2>
        <p style={{ fontSize: 14, color: '#7BAED4', marginBottom: 20, lineHeight: 1.55 }}>{subtitle}</p>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'white', marginBottom: 14 }}>
          On a scale of 1–10, how likely are you to recommend TalkMate to another business owner?
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10,1fr)', gap: 6 }}>
          {Array.from({ length: 10 }, (_, i) => i + 1).map(n => {
            const isPromoter = n >= 9
            const isDetractor = n <= 6
            const colorBase = isPromoter ? '#22C55E' : isDetractor ? '#EF4444' : '#F59E0B'
            const isHovered = hover === n
            return (
              <button
                key={n}
                disabled={submitting}
                onMouseEnter={() => setHover(n)}
                onMouseLeave={() => setHover(null)}
                onClick={() => pick(n)}
                style={{
                  padding: '12px 0', borderRadius: 8,
                  background: isHovered ? colorBase : 'rgba(255,255,255,0.04)',
                  color: isHovered ? 'white' : '#7BAED4',
                  fontSize: 14, fontWeight: 700, fontFamily: 'Outfit, sans-serif',
                  border: `1px solid ${isHovered ? colorBase : 'rgba(255,255,255,0.08)'}`,
                  cursor: submitting ? 'wait' : 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {n}
              </button>
            )
          })}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
          <span>Not at all likely</span>
          <span>Extremely likely</span>
        </div>
      </div>
    </div>
  )
}
