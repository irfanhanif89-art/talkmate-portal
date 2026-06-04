'use client'

// Industry Template card — Session 3A.
// Shown at the top of Train TalkMate when the business has fewer than 3 active
// KB entries. Lets the owner pre-fill their knowledge base from an industry pack.
// Self-contained: own styles, confirm modal, and fetch. On success it reloads so
// the server component re-fetches entries (and this card hides once >= 3 entries).

import { useState } from 'react'
import { Truck, Wrench, Zap, Sparkles, Wind, Briefcase } from 'lucide-react'

const ORANGE = '#E8622A'

type Industry = 'towing' | 'plumbing' | 'electrical' | 'cleaning' | 'hvac'

const OPTIONS: { key: Industry | 'other'; label: string; Icon: typeof Truck }[] = [
  { key: 'towing', label: 'Towing', Icon: Truck },
  { key: 'plumbing', label: 'Plumbing', Icon: Wrench },
  { key: 'electrical', label: 'Electrical', Icon: Zap },
  { key: 'cleaning', label: 'Cleaning', Icon: Sparkles },
  { key: 'hvac', label: 'HVAC', Icon: Wind },
  { key: 'other', label: 'Other / Skip', Icon: Briefcase },
]

function withAdmin(path: string, adminClientId: string | null | undefined): string {
  if (!adminClientId) return path
  const sep = path.includes('?') ? '&' : '?'
  return `${path}${sep}adminClientId=${encodeURIComponent(adminClientId)}`
}

export default function IndustryTemplateCard({ adminClientId }: { adminClientId?: string | null }) {
  const [confirming, setConfirming] = useState<Industry | null>(null)
  const [busy, setBusy] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (dismissed) return null

  async function apply(industry: Industry) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(withAdmin(`/api/industry-packs/${industry}/apply`, adminClientId), {
        method: 'POST',
      })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        setError(json.error || 'Could not apply the template. Try again.')
        setBusy(false)
        return
      }
      // Reload so the page re-fetches KB entries; this card hides once >= 3 exist.
      window.location.reload()
    } catch {
      setError('Network error. Try again.')
      setBusy(false)
    }
  }

  function selectOption(key: Industry | 'other') {
    if (key === 'other') {
      setDismissed(true)
      return
    }
    setConfirming(key)
  }

  return (
    <div style={{
      background: 'rgba(232,98,42,0.06)', border: '1px solid rgba(232,98,42,0.25)',
      borderRadius: 14, padding: 20, marginBottom: 18,
    }}>
      <div style={{ fontSize: 16, fontWeight: 800, color: 'white', marginBottom: 4 }}>
        Start with an industry template
      </div>
      <p style={{ fontSize: 13, color: '#C8D8EA', marginTop: 0, marginBottom: 16, lineHeight: 1.5 }}>
        Pick your industry and TalkMate will pre-fill your knowledge base with common questions,
        services, and information. You can edit everything after.
      </p>

      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10,
      }}>
        {OPTIONS.map(({ key, label, Icon }) => (
          <button
            key={key}
            type="button"
            disabled={busy}
            onClick={() => selectOption(key)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px',
              background: '#071829', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 10, color: '#F1F5F9', cursor: busy ? 'default' : 'pointer',
              fontFamily: 'Outfit, sans-serif', fontSize: 14, fontWeight: 600, textAlign: 'left',
            }}
          >
            <Icon size={18} color={ORANGE} />
            {label}
          </button>
        ))}
      </div>

      {error && <div style={{ marginTop: 12, fontSize: 13, color: '#EF4444' }}>{error}</div>}

      {confirming && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
          }}
          onClick={() => !busy && setConfirming(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#0A1E38', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 16,
              padding: 24, maxWidth: 420, width: '100%', fontFamily: 'Outfit, sans-serif',
            }}
          >
            <div style={{ fontSize: 17, fontWeight: 800, color: 'white', marginBottom: 8 }}>
              Apply {OPTIONS.find((o) => o.key === confirming)?.label} template?
            </div>
            <p style={{ fontSize: 13, color: '#C8D8EA', marginTop: 0, marginBottom: 20, lineHeight: 1.5 }}>
              This will add entries to your knowledge base. Anything you have already added is kept.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirming(null)}
                style={{
                  padding: '10px 16px', background: 'transparent', border: '1px solid rgba(255,255,255,0.18)',
                  borderRadius: 10, color: '#C8D8EA', cursor: 'pointer', fontFamily: 'Outfit, sans-serif',
                  fontSize: 14, fontWeight: 600,
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => apply(confirming)}
                style={{
                  padding: '10px 18px', background: ORANGE, border: 'none', borderRadius: 10,
                  color: 'white', cursor: busy ? 'default' : 'pointer', fontFamily: 'Outfit, sans-serif',
                  fontSize: 14, fontWeight: 700, opacity: busy ? 0.7 : 1,
                }}
              >
                {busy ? 'Applying...' : 'Apply template'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
