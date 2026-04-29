'use client'

import { useState } from 'react'
import { Sparkles } from 'lucide-react'

interface Props {
  businessId: string
  isAdmin: boolean
}

// Banner shown on contacts/pipeline pages when demo data is present.
// Detected server-side by checking for any contact whose phone starts with
// the demo prefix (+61412001).
export default function DemoDataBanner({ businessId, isAdmin }: Props) {
  const [busy, setBusy] = useState(false)
  const [hidden, setHidden] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (hidden) return null

  async function reset() {
    if (!confirm('Remove all demo contacts? This cannot be undone.')) return
    setBusy(true); setError(null)
    try {
      const res = await fetch('/api/demo/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessId }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error ?? 'Reset failed')
      setHidden(true)
      window.location.reload()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      role="status"
      style={{
        background: 'linear-gradient(135deg, rgba(139,92,246,0.14), rgba(74,159,232,0.08))',
        border: '1px solid rgba(139,92,246,0.35)',
        borderRadius: 12, padding: '10px 16px',
        marginBottom: 16,
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      }}
    >
      <Sparkles size={16} color="#8B5CF6" style={{ flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 200 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'white' }}>Demo data active</span>
        <span style={{ fontSize: 12, color: '#7BAED4', marginLeft: 6 }}>
          showing sample real estate contacts.
        </span>
      </div>
      {error && <span style={{ fontSize: 12, color: '#EF4444' }}>{error}</span>}
      {isAdmin && (
        <button
          onClick={reset}
          disabled={busy}
          style={{
            background: 'transparent', border: '1px solid rgba(139,92,246,0.45)',
            color: '#8B5CF6', padding: '6px 12px', borderRadius: 7,
            fontSize: 12, fontWeight: 600, cursor: busy ? 'wait' : 'pointer',
            fontFamily: 'Outfit, sans-serif',
          }}
        >{busy ? 'Resetting…' : 'Reset demo data'}</button>
      )}
    </div>
  )
}
