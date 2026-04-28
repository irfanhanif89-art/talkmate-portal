'use client'

import { useEffect, useState } from 'react'

interface ToastMsg {
  id: number
  text: string
}

const AU_CITIES = ['Brisbane', 'Sydney', 'Melbourne', 'Perth', 'Adelaide', 'Gold Coast', 'Newcastle', 'Hobart', 'Canberra', 'Sunshine Coast']
const FIRST_NAMES = ['Sarah', 'James', 'Priya', 'Liam', 'Olivia', 'Marcus', 'Aisha', 'Jack', 'Zara', 'Tom']
const RECENT_FEATURES = ['AI Menu Import', 'TalkMate Command Centre', '5-step onboarding', 'Stripe Connect payouts', 'System status page']

function rand<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)] }

function buildQueue(): ToastMsg[] {
  const queue: ToastMsg[] = []
  for (let i = 0; i < 6; i++) {
    const r = Math.random()
    let text: string
    if (r < 0.4) {
      text = `🔔 A business in ${rand(AU_CITIES)} just signed up to TalkMate`
    } else if (r < 0.75) {
      const name = rand(FIRST_NAMES)
      const city = rand(AU_CITIES)
      const amount = (50 + Math.floor(Math.random() * 250))
      text = `🔔 ${name} from ${city} earned $${amount} in referrals this month`
    } else {
      text = `✨ New feature: ${rand(RECENT_FEATURES)}`
    }
    queue.push({ id: i, text })
  }
  return queue
}

// Cycles through ~6 unique social-proof messages on a 45–90s interval.
// Used on the Dashboard only.
export default function SocialProofToaster({ enabled }: { enabled: boolean }) {
  const [active, setActive] = useState<ToastMsg | null>(null)
  const [queue, setQueue] = useState<ToastMsg[]>(() => buildQueue())
  const [seenIds, setSeenIds] = useState<Set<number>>(new Set())

  useEffect(() => {
    if (!enabled) return
    let mounted = true

    function showOne() {
      if (!mounted) return
      const next = queue.find(q => !seenIds.has(q.id)) || queue[0]
      if (!next) return
      setActive(next)
      setSeenIds(prev => new Set(prev).add(next.id))
      setTimeout(() => mounted && setActive(null), 4000)
    }

    // First toast appears 30s after mount, then every 45–90s.
    const initialTimer = setTimeout(showOne, 30_000)
    const interval = setInterval(() => {
      const delay = 45_000 + Math.random() * 45_000
      setTimeout(showOne, delay)
    }, 90_000)
    return () => { mounted = false; clearTimeout(initialTimer); clearInterval(interval) }
  }, [enabled, queue, seenIds])

  if (!enabled || !active) return null

  return (
    <div style={{
      position: 'fixed', bottom: 24, left: 24, zIndex: 800,
      background: '#0A1E38', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12,
      padding: '12px 16px', maxWidth: 320, fontSize: 13, color: 'white',
      fontFamily: 'Outfit, sans-serif', boxShadow: '0 18px 40px rgba(0,0,0,0.45)',
      animation: 'tm-toast-in 0.25s ease-out',
    }}>
      <style>{`@keyframes tm-toast-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`}</style>
      {active.text}
    </div>
  )
}
