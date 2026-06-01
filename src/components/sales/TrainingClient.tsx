'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { trainingModules } from '@/lib/training-modules'
import TrainingModule from '@/components/sales/TrainingModule'

const FONT = 'Outfit, sans-serif'
const TOTAL = trainingModules.length

function storageKey(userId: string, moduleId: number) {
  return `tm-training-${userId}-module-${moduleId}`
}

interface TrainingClientProps {
  // When rendered inside the admin shell, a fixed hamburger button floats
  // at top-left on mobile (<=767px) and would overlap the header heading.
  // The admin route opts in to extra top padding to clear it. The sales
  // shell has its own top bar, so the contractor view leaves this off.
  topInset?: boolean
}

export default function TrainingClient({ topInset = false }: TrainingClientProps) {
  const [userId, setUserId] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [completed, setCompleted] = useState<Set<number>>(new Set())
  const [expanded, setExpanded] = useState<number | null>(null)

  // Load the signed-in user and their saved progress on mount.
  useEffect(() => {
    let active = true
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      if (!active) return
      const uid = data.user?.id ?? null
      setUserId(uid)
      if (uid) {
        const done = new Set<number>()
        for (const m of trainingModules) {
          if (localStorage.getItem(storageKey(uid, m.id)) === 'done') {
            done.add(m.id)
          }
        }
        setCompleted(done)
      }
      setReady(true)
    })
    return () => {
      active = false
    }
  }, [])

  function handleToggle(id: number) {
    setExpanded((cur) => (cur === id ? null : id))
  }

  function handleComplete(id: number) {
    if (!userId) return
    localStorage.setItem(storageKey(userId, id), 'done')
    setCompleted((cur) => {
      const next = new Set(cur)
      next.add(id)
      return next
    })
  }

  function handleReset() {
    if (!userId) return
    for (const m of trainingModules) {
      localStorage.removeItem(storageKey(userId, m.id))
    }
    setCompleted(new Set())
  }

  const completeCount = completed.size
  const pct = Math.round((completeCount / TOTAL) * 100)

  return (
    <div style={{ minHeight: '100%', background: '#F4F6F9', fontFamily: FONT }}>
      {topInset && (
        <style>{`
          @media (max-width: 767px) {
            .tm-training-header { padding-top: 64px !important; }
          }
        `}</style>
      )}
      {/* Navy header */}
      <div className="tm-training-header" style={{ background: '#061322', padding: '32px 20px 28px' }}>
        <div style={{ maxWidth: 768, margin: '0 auto' }}>
          <h1
            style={{
              fontSize: 26,
              fontWeight: 800,
              color: 'white',
              margin: 0,
              letterSpacing: '-0.5px',
            }}
          >
            Product Training
          </h1>
          <p
            style={{
              fontSize: 14.5,
              color: '#7BAED4',
              margin: '8px 0 22px',
              lineHeight: 1.5,
              maxWidth: 560,
            }}
          >
            Everything you need to know about TalkMate before your first conversation.
          </p>

          {/* Progress bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div
              style={{
                flex: 1,
                height: 9,
                borderRadius: 20,
                background: 'rgba(255,255,255,0.12)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${pct}%`,
                  height: '100%',
                  background: '#E8622A',
                  borderRadius: 20,
                  transition: 'width 0.4s ease',
                }}
              />
            </div>
            <span
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: 'white',
                whiteSpace: 'nowrap',
              }}
            >
              {completeCount} of {TOTAL} modules complete
            </span>
          </div>
        </div>
      </div>

      {/* Module list */}
      <div style={{ maxWidth: 768, margin: '0 auto', padding: '26px 20px 60px' }}>
        {trainingModules.map((module) => (
          <TrainingModule
            key={module.id}
            module={module}
            isCompleted={completed.has(module.id)}
            isExpanded={expanded === module.id}
            onToggle={handleToggle}
            onComplete={handleComplete}
          />
        ))}

        {/* Reset progress */}
        <div style={{ textAlign: 'center', marginTop: 26 }}>
          <button
            onClick={handleReset}
            disabled={!ready || completeCount === 0}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#9AA7B8',
              fontFamily: FONT,
              fontSize: 12.5,
              fontWeight: 600,
              textDecoration: 'underline',
              cursor: ready && completeCount > 0 ? 'pointer' : 'default',
              opacity: ready && completeCount > 0 ? 1 : 0.5,
            }}
          >
            Reset progress
          </button>
        </div>
      </div>
    </div>
  )
}
