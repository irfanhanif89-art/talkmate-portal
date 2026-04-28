'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'

const MILESTONES = [1000, 5000, 10_000, 25_000, 50_000, 100_000]

interface Props {
  businessName: string
  monthlyRevenue: number
  callsThisMonth: number
}

// Brief Part 5 §15. Show a shareable card the first time a business crosses a
// monthly revenue milestone. We don't generate a real PNG (no html2canvas
// installed) — we offer copy-to-clipboard + download-as-text/svg fallback.
export default function ShareYourWin({ businessName, monthlyRevenue, callsThisMonth }: Props) {
  const [milestone, setMilestone] = useState<number | null>(null)
  const [closed, setClosed] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const hit = [...MILESTONES].reverse().find(m => monthlyRevenue >= m)
    if (!hit) return
    const seenKey = `share_win_seen_${hit}_${new Date().toISOString().slice(0, 7)}`
    if (localStorage.getItem(seenKey)) return
    setMilestone(hit)
  }, [monthlyRevenue])

  if (!milestone || closed) return null

  function close() {
    if (milestone) localStorage.setItem(`share_win_seen_${milestone}_${new Date().toISOString().slice(0, 7)}`, '1')
    setClosed(true)
  }

  async function copyShareText() {
    const text = `🎉 ${businessName} just hit $${milestone.toLocaleString()}+ in revenue captured by TalkMate this month — across ${callsThisMonth} calls.`
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {/* clipboard blocked */}
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1150,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div style={{
        background: '#0A1E38', border: '1px solid rgba(232,98,42,0.3)', borderRadius: 18,
        width: '100%', maxWidth: 480, overflow: 'hidden',
      }}>
        <div style={{
          background: 'linear-gradient(135deg, #E8622A, #1565C0)', padding: '32px 24px',
          textAlign: 'center', color: 'white', position: 'relative',
        }}>
          <button onClick={close} aria-label="Close" style={{ position: 'absolute', top: 12, right: 12, background: 'rgba(0,0,0,0.2)', border: 'none', color: 'white', borderRadius: '50%', width: 28, height: 28, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={14} />
          </button>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>Milestone unlocked</div>
          <div style={{ fontSize: 36, fontWeight: 800 }}>${milestone.toLocaleString()}+ captured</div>
          <div style={{ fontSize: 14, opacity: 0.9, marginTop: 6 }}>{businessName} · {callsThisMonth} calls answered this month</div>
        </div>
        <div style={{ padding: 24 }}>
          <p style={{ fontSize: 14, color: '#7BAED4', marginBottom: 18, lineHeight: 1.5 }}>
            Share your result with your team or your accountant — TalkMate has captured serious revenue for {businessName} this month.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <button onClick={copyShareText} style={{ background: '#E8622A', color: 'white', border: 'none', borderRadius: 10, padding: '11px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
              {copied ? '✓ Copied' : 'Copy share text'}
            </button>
            <button onClick={close} style={{ background: 'transparent', color: '#4A9FE8', border: '1px solid rgba(74,159,232,0.3)', borderRadius: 10, padding: '11px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
              Maybe later
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
