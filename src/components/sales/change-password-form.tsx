'use client'

import { useState } from 'react'
import { CheckCircle2, AlertCircle } from 'lucide-react'

export default function ChangePasswordForm() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function clearMsg() {
    setSaved(false)
    setError(null)
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaved(false)

    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }

    setSaving(true)
    const res = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setError(body?.error ?? 'Could not update password.')
      setSaving(false)
      return
    }
    setSaved(true)
    setSaving(false)
    setPassword('')
    setConfirm('')
  }

  return (
    <form onSubmit={save} style={card}>
      <h2 style={cardTitle}>Change password</h2>
      <p style={cardHint}>
        Set a new password so you can sign in without a magic link. Must be at least 8 characters and include an uppercase letter, a number, and a special character.
      </p>

      <Field label="New password">
        <input
          type="password"
          value={password}
          onChange={e => { setPassword(e.target.value); clearMsg() }}
          placeholder="At least 8 characters"
          autoComplete="new-password"
          minLength={8}
          style={inputStyle}
        />
      </Field>

      <Field label="Confirm new password">
        <input
          type="password"
          value={confirm}
          onChange={e => { setConfirm(e.target.value); clearMsg() }}
          placeholder="Re-enter the password"
          autoComplete="new-password"
          minLength={8}
          style={inputStyle}
        />
      </Field>

      {error && (
        <div style={errorBox}>
          <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{error}</span>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 4 }}>
        <button
          type="submit"
          disabled={saving || !password || !confirm}
          style={{
            padding: '11px 20px', borderRadius: 9, border: 'none',
            background: (saving || !password || !confirm) ? '#7B3A1A' : '#E8622A',
            color: 'white', fontFamily: 'Outfit, sans-serif',
            fontSize: 13, fontWeight: 700,
            cursor: (saving || !password || !confirm) ? 'not-allowed' : 'pointer',
          }}
        >
          {saving ? 'Updating…' : 'Update password'}
        </button>
        {saved && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: '#22c55e', fontWeight: 600 }}>
            <CheckCircle2 size={14} /> Password updated
          </span>
        )}
      </div>
    </form>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', marginBottom: 14 }}>
      <span style={{ display: 'block', fontSize: 12, color: '#7BAED4', fontWeight: 600, marginBottom: 6 }}>
        {label}
      </span>
      {children}
    </label>
  )
}

const card: React.CSSProperties = {
  background: '#0A1E38',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: 12,
  padding: 22,
}

const cardTitle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  color: 'white',
  margin: 0,
  marginBottom: 6,
}

const cardHint: React.CSSProperties = {
  fontSize: 12,
  color: '#7BAED4',
  margin: 0,
  marginBottom: 18,
  lineHeight: 1.55,
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 8,
  background: '#061322', border: '1px solid rgba(255,255,255,0.08)',
  color: 'white', fontFamily: 'Outfit, sans-serif', fontSize: 13, outline: 'none',
  boxSizing: 'border-box',
}

const errorBox: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  alignItems: 'flex-start',
  padding: '10px 14px',
  borderRadius: 9,
  background: 'rgba(239,68,68,0.1)',
  border: '1px solid rgba(239,68,68,0.25)',
  color: '#ef4444',
  fontSize: 13,
  marginBottom: 14,
}
