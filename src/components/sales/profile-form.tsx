'use client'

import { useState } from 'react'
import { CheckCircle2 } from 'lucide-react'

interface Props {
  initialPhone: string
  initialNotificationEmail: string
}

export default function ProfileForm({ initialPhone, initialNotificationEmail }: Props) {
  const [phone, setPhone] = useState(initialPhone)
  const [notificationEmail, setNotificationEmail] = useState(initialNotificationEmail)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setSaving(true); setSaved(false); setError(null)

    const trimmedEmail = notificationEmail.trim()
    if (trimmedEmail && !trimmedEmail.includes('@')) {
      setError('Reply-to email looks wrong. Use a real address or leave it blank.')
      setSaving(false)
      return
    }

    const res = await fetch('/api/sales/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: phone.trim() || null,
        notification_email: trimmedEmail || null,
      }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setError(body?.error ?? 'Could not save.')
      setSaving(false)
      return
    }
    setSaved(true)
    setSaving(false)
  }

  return (
    <div style={{
      background: '#0A1E38', border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 12, padding: 22,
    }}>
      <h2 style={{ fontSize: 14, fontWeight: 700, color: 'white', margin: 0, marginBottom: 14 }}>Editable</h2>

      <label style={{ display: 'block', marginBottom: 14 }}>
        <span style={{ display: 'block', fontSize: 12, color: '#7BAED4', fontWeight: 600, marginBottom: 6 }}>
          Phone number
        </span>
        <input
          value={phone}
          onChange={e => { setPhone(e.target.value); setSaved(false) }}
          placeholder="0400 000 000"
          style={inputStyle}
        />
      </label>

      <label style={{ display: 'block', marginBottom: 14 }}>
        <span style={{ display: 'block', fontSize: 12, color: '#7BAED4', fontWeight: 600, marginBottom: 6 }}>
          Reply-to email for proposals
        </span>
        <input
          type="email"
          value={notificationEmail}
          onChange={e => { setNotificationEmail(e.target.value); setSaved(false) }}
          placeholder="you@example.com"
          style={inputStyle}
        />
        <span style={{ display: 'block', marginTop: 6, fontSize: 11, color: '#4A7FBB', lineHeight: 1.5 }}>
          When clients reply to your proposal email, their reply goes here. Use your personal or work email.
        </span>
      </label>

      {error && (
        <div style={{ marginBottom: 12, color: '#ef4444', fontSize: 13, padding: '8px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)' }}>{error}</div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <button
          onClick={save}
          disabled={saving}
          style={{
            padding: '10px 18px', borderRadius: 9, border: 'none',
            background: saving ? '#7B3A1A' : '#E8622A',
            color: 'white', fontFamily: 'Outfit, sans-serif',
            fontSize: 13, fontWeight: 700,
            cursor: saving ? 'not-allowed' : 'pointer',
          }}
        >
          {saving ? 'Saving...' : 'Save changes'}
        </button>
        {saved && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: '#22c55e', fontWeight: 600 }}>
            <CheckCircle2 size={14} /> Saved
          </span>
        )}
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 8,
  background: '#061322', border: '1px solid rgba(255,255,255,0.08)',
  color: 'white', fontFamily: 'Outfit, sans-serif', fontSize: 13, outline: 'none',
}
