'use client'

import { useState } from 'react'

interface Props {
  onClose: () => void
  onCreated: () => void
}

const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: 16, zIndex: 50,
}
const modal: React.CSSProperties = {
  background: '#0A1E38', border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 14, padding: 24, width: '100%', maxWidth: 460,
  fontFamily: 'Outfit, sans-serif', color: 'white',
}
const label: React.CSSProperties = {
  display: 'block', fontSize: 12, color: 'rgba(255,255,255,0.7)', marginBottom: 6, fontWeight: 600,
}
const input: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 10,
  background: '#061322', border: '1px solid rgba(255,255,255,0.12)',
  color: 'white', fontFamily: 'inherit', fontSize: 14,
}
const btnPrimary: React.CSSProperties = {
  background: '#22D3EE', color: '#061322', border: 'none',
  padding: '10px 18px', borderRadius: 10, fontWeight: 700, cursor: 'pointer',
  fontFamily: 'inherit', fontSize: 14,
}
const btnGhost: React.CSSProperties = {
  background: 'transparent', color: 'white', border: '1px solid rgba(255,255,255,0.2)',
  padding: '10px 18px', borderRadius: 10, fontWeight: 600, cursor: 'pointer',
  fontFamily: 'inherit', fontSize: 14,
}
const errorBox: React.CSSProperties = {
  background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.4)',
  color: '#fecaca', padding: 10, borderRadius: 8, fontSize: 13, marginTop: 8,
}

export default function InviteContractorModal({ onClose, onCreated }: Props) {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setError(null)
    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
      setError('First name, last name, and email are required')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/contractors/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          email: email.trim(),
          phone: phone.trim() || undefined,
        }),
      })
      const json = await res.json()
      if (!json.ok) {
        setError(json.error || 'Could not send invite')
      } else {
        onCreated()
      }
    } catch {
      setError('Could not send invite')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={e => e.stopPropagation()}>
        <h2 style={{ fontSize: 20, margin: '0 0 12px' }}>Invite Contractor</h2>
        <p style={{ color: 'rgba(255,255,255,0.65)', margin: '0 0 16px', fontSize: 14 }}>
          The contractor will receive a TalkMate-branded email with a link to review and sign their agreement.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label style={label}>First Name</label>
            <input style={input} value={firstName} onChange={e => setFirstName(e.target.value)} />
          </div>
          <div>
            <label style={label}>Last Name</label>
            <input style={input} value={lastName} onChange={e => setLastName(e.target.value)} />
          </div>
        </div>

        <div style={{ marginTop: 10 }}>
          <label style={label}>Email</label>
          <input style={input} value={email} onChange={e => setEmail(e.target.value)} placeholder="contractor@example.com" />
        </div>

        <div style={{ marginTop: 10 }}>
          <label style={label}>Phone (optional)</label>
          <input style={input} value={phone} onChange={e => setPhone(e.target.value)} placeholder="04xx xxx xxx" />
        </div>

        {error && <div style={errorBox}>{error}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
          <button style={btnGhost} onClick={onClose} disabled={submitting}>Cancel</button>
          <button style={btnPrimary} onClick={submit} disabled={submitting}>
            {submitting ? 'Sending...' : 'Send Invite'}
          </button>
        </div>
      </div>
    </div>
  )
}
