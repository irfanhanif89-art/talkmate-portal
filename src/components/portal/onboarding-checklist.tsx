'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ArrowRight, X } from 'lucide-react'

interface Step {
  key: string
  label: string
  done: boolean
  href: string
}

interface Props {
  steps: Step[]
  onTestCall?: () => void
}

// Onboarding checklist card. Brief Part 4: 5 logical steps. Backed by the
// existing onboarding_responses table — `done` is computed server-side from
// the saved responses.
export default function OnboardingChecklist({ steps, onTestCall }: Props) {
  const router = useRouter()
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const stamp = localStorage.getItem('onboarding_checklist_dismissed')
    if (stamp) {
      // Reappear on next session — only suppressed within current day.
      const dt = new Date(stamp)
      if (dt.toDateString() === new Date().toDateString()) setDismissed(true)
    }
  }, [])

  const completed = steps.filter(s => s.done).length
  const allDone = completed === steps.length

  if (dismissed && !allDone) return null
  if (allDone && completed === steps.length) {
    return (
      <div style={{
        background: 'linear-gradient(135deg, rgba(34,197,94,0.1), rgba(74,159,232,0.06))',
        border: '1px solid rgba(34,197,94,0.25)', borderRadius: 16, padding: 22, marginBottom: 20,
        display: 'flex', gap: 16, alignItems: 'center',
      }}>
        <div style={{ fontSize: 32 }}>🎉</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'white' }}>Your TalkMate agent is live</div>
          <div style={{ fontSize: 13, color: '#7BAED4', marginTop: 3 }}>Call your number now to hear it answering customers.</div>
        </div>
        <button
          onClick={onTestCall ?? (() => router.push('/calls'))}
          style={{
            background: '#E8622A', color: 'white', border: 'none', padding: '10px 18px',
            borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'Outfit, sans-serif',
          }}
        >
          Call your agent →
        </button>
      </div>
    )
  }

  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(74,159,232,0.08), rgba(34,197,94,0.04))',
      border: '1px solid rgba(74,159,232,0.25)', borderRadius: 16, padding: 22, marginBottom: 20,
      position: 'relative',
    }}>
      <button
        onClick={() => { localStorage.setItem('onboarding_checklist_dismissed', new Date().toISOString()); setDismissed(true) }}
        aria-label="Dismiss until tomorrow"
        style={{ position: 'absolute', top: 14, right: 14, background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.35)', cursor: 'pointer', fontSize: 12 }}
      >
        Dismiss
      </button>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#E8622A', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>Get live</div>
      <div style={{ fontSize: 15, fontWeight: 800, color: 'white', marginBottom: 4 }}>Complete your setup ({completed}/{steps.length})</div>
      <div style={{ fontSize: 12, color: '#7BAED4', marginBottom: 14 }}>You&apos;re minutes away from your AI agent answering calls.</div>

      <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, marginBottom: 16, overflow: 'hidden' }}>
        <div style={{ width: `${(completed / steps.length) * 100}%`, height: '100%', background: '#E8622A', borderRadius: 2, transition: 'width 0.4s' }} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
        {steps.map((s, i) => {
          const isActive = !s.done && (i === 0 || steps[i - 1].done)
          return (
            <button
              key={s.key}
              onClick={() => router.push(s.href)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px',
                background: s.done ? 'rgba(34,197,94,0.06)' : isActive ? 'rgba(232,98,42,0.06)' : '#071829',
                border: `1px solid ${s.done ? 'rgba(34,197,94,0.25)' : isActive ? 'rgba(232,98,42,0.3)' : 'rgba(255,255,255,0.06)'}`,
                borderRadius: 10, cursor: 'pointer', textAlign: 'left', fontFamily: 'Outfit, sans-serif',
              }}
            >
              <div style={{
                width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: s.done ? '#22C55E' : isActive ? '#E8622A' : 'rgba(255,255,255,0.06)',
                color: 'white',
              }}>
                {s.done ? <Check size={12} /> : isActive ? <ArrowRight size={12} /> : <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{i + 1}</span>}
              </div>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: s.done ? '#7BAED4' : 'white' }}>{s.label}</span>
              {!s.done && <span style={{ fontSize: 11, color: isActive ? '#E8622A' : '#4A7FBB' }}>{isActive ? 'Continue →' : 'Start →'}</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}
