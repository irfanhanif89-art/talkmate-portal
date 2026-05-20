'use client'

import { useState } from 'react'
import ModalShell from '@/components/sales/modal-shell'

interface Props {
  onClose: () => void
  onSuccess: () => void
}

export default function InviteRepModal({ onClose, onSuccess }: Props) {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (!fullName.trim() || !email.trim() || !email.includes('@')) {
      setError('Full name and valid email are required.')
      return
    }
    setSubmitting(true); setError(null)
    const res = await fetch('/api/admin/sales-reps/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ full_name: fullName.trim(), email: email.trim().toLowerCase(), phone: phone.trim() || null }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setError(body?.error ?? 'Could not invite rep.')
      setSubmitting(false)
      return
    }
    onSuccess()
  }

  return (
    <ModalShell title="Invite a sales rep" subtitle="They'll receive a magic-link email and land directly on the sales portal." onClose={onClose}>
      <Field label="Full name *">
        <input value={fullName} onChange={e => setFullName(e.target.value)} style={inputStyle} placeholder="Jane Smith" />
      </Field>
      <Field label="Email *">
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} placeholder="jane@example.com" />
      </Field>
      <Field label="Phone (optional)">
        <input value={phone} onChange={e => setPhone(e.target.value)} style={inputStyle} placeholder="0400 000 000" />
      </Field>

      {error && (
        <div style={errorBox}>{error}</div>
      )}

      <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
        <button onClick={onClose} style={cancelBtn}>Cancel</button>
        <button onClick={submit} disabled={submitting} style={{
          flex: 1, padding: '11px 14px', borderRadius: 9, border: 'none',
          background: submitting ? '#7B3A1A' : '#E8622A',
          color: 'white', fontFamily: 'Outfit, sans-serif', fontSize: 14, fontWeight: 700,
          cursor: submitting ? 'not-allowed' : 'pointer',
        }}>
          {submitting ? 'Sending invite…' : 'Send Invite'}
        </button>
      </div>
    </ModalShell>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14 }}>
      <span style={{ fontSize: 11, color: '#7BAED4', fontWeight: 600 }}>{label}</span>
      {children}
    </label>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 8,
  background: '#061322', border: '1px solid rgba(255,255,255,0.08)',
  color: 'white', fontSize: 13, outline: 'none', fontFamily: 'Outfit, sans-serif',
}
const cancelBtn: React.CSSProperties = {
  padding: '11px 18px', borderRadius: 9, cursor: 'pointer',
  background: 'transparent', color: '#7BAED4', border: '1px solid rgba(255,255,255,0.1)',
  fontFamily: 'Outfit, sans-serif', fontSize: 13, fontWeight: 600,
}
const errorBox: React.CSSProperties = {
  marginBottom: 10, color: '#ef4444', fontSize: 13,
  padding: '8px 12px', borderRadius: 8,
  background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
}
