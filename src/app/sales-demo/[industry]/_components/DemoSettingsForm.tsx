'use client'

import { useState } from 'react'

interface DemoSettingsFormProps {
  industry: string
  token: string
  initialName: string
  initialPhone: string
  initialAddress: string
  initialGreeting: string
}

const INPUT: React.CSSProperties = {
  width: '100%',
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 8,
  color: '#ffffff',
  fontFamily: "'Outfit', system-ui, sans-serif",
  fontSize: 14,
  padding: '10px 14px',
  outline: 'none',
  boxSizing: 'border-box',
}

const LABEL: React.CSSProperties = {
  display: 'block',
  color: 'rgba(255,255,255,0.55)',
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
  marginBottom: 6,
  fontFamily: "'Outfit', system-ui, sans-serif",
}

const HINT: React.CSSProperties = {
  color: 'rgba(255,255,255,0.3)',
  fontSize: 11,
  marginTop: 4,
  fontFamily: "'Outfit', system-ui, sans-serif",
}

export default function DemoSettingsForm({
  industry,
  token,
  initialName,
  initialPhone,
  initialAddress,
  initialGreeting,
}: DemoSettingsFormProps) {
  const [name, setName] = useState(initialName)
  const [address, setAddress] = useState(initialAddress)
  const [greeting, setGreeting] = useState(initialGreeting)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setToast(null)

    try {
      const res = await fetch(`/api/sales-demo/${industry}/update-settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-demo-token': token },
        body: JSON.stringify({ name, address, greeting }),
      })

      if (res.ok) {
        setToast('Saved (demo only - resets every 4 hours)')
      } else {
        setToast('Save failed. Please try again.')
      }
    } catch {
      setToast('Save failed. Please try again.')
    } finally {
      setSaving(false)
      setTimeout(() => setToast(null), 4000)
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Business name */}
      <div>
        <label style={LABEL}>Business Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={INPUT}
          required
        />
      </div>

      {/* Phone number (disabled) */}
      <div>
        <label style={LABEL}>Phone Number</label>
        <input
          type="text"
          value={initialPhone}
          disabled
          style={{ ...INPUT, opacity: 0.45, cursor: 'not-allowed' }}
        />
        <p style={HINT}>This is the number your TalkMate AI answers on</p>
      </div>

      {/* Address */}
      <div>
        <label style={LABEL}>Address</label>
        <input
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          style={INPUT}
        />
      </div>

      {/* Greeting */}
      <div>
        <label style={LABEL}>Greeting</label>
        <textarea
          rows={3}
          value={greeting}
          onChange={(e) => setGreeting(e.target.value)}
          style={{ ...INPUT, resize: 'vertical', lineHeight: 1.5 }}
        />
      </div>

      {/* Save button */}
      <button
        type="submit"
        disabled={saving}
        style={{
          background: saving ? 'rgba(232,98,42,0.5)' : '#E8622A',
          color: '#ffffff',
          fontFamily: "'Outfit', system-ui, sans-serif",
          fontSize: 14,
          fontWeight: 600,
          padding: '12px 0',
          borderRadius: 8,
          border: 'none',
          cursor: saving ? 'not-allowed' : 'pointer',
          width: '100%',
          maxWidth: 320,
          transition: 'background 0.15s',
        }}
      >
        {saving ? 'Saving...' : 'Save Changes'}
      </button>

      {/* Toast */}
      {toast && (
        <div
          style={{
            background: toast.includes('failed')
              ? 'rgba(239,68,68,0.12)'
              : 'rgba(16,185,129,0.12)',
            border: `1px solid ${toast.includes('failed') ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.3)'}`,
            color: toast.includes('failed') ? '#EF4444' : '#10B981',
            borderRadius: 8,
            padding: '10px 16px',
            fontSize: 13,
            fontFamily: "'Outfit', system-ui, sans-serif",
          }}
        >
          {toast}
        </div>
      )}
    </form>
  )
}
