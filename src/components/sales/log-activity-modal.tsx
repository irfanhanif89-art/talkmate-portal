'use client'

import { useState } from 'react'
import ModalShell from './modal-shell'

type ActivityType = 'call' | 'email' | 'demo' | 'proposal' | 'note'

const TYPES: Array<{ value: ActivityType; label: string }> = [
  { value: 'call',     label: 'Call' },
  { value: 'email',    label: 'Email' },
  { value: 'demo',     label: 'Demo' },
  { value: 'proposal', label: 'Proposal' },
  { value: 'note',     label: 'Note' },
]

interface Props {
  leadId: string
  onClose: () => void
  onLogged: () => void
}

export default function LogActivityModal({ leadId, onClose, onLogged }: Props) {
  const [type, setType] = useState<ActivityType>('call')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (!title.trim()) { setError('Title is required.'); return }
    setSubmitting(true); setError(null)
    const res = await fetch(`/api/sales/leads/${leadId}/activities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activity_type: type, title: title.trim(), body: body.trim() || null }),
    })
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      setError(json?.error ?? 'Could not log activity.')
      setSubmitting(false)
      return
    }
    onLogged()
  }

  return (
    <ModalShell title="Log activity" subtitle="Add a note, call, email, demo, or proposal record." onClose={onClose}>
      <div style={{ marginBottom: 14 }}>
        <Label>Activity type</Label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
          {TYPES.map(t => (
            <button
              key={t.value}
              onClick={() => setType(t.value)}
              style={{
                padding: '9px 4px', borderRadius: 7, cursor: 'pointer',
                background: type === t.value ? '#E8622A' : '#061322',
                color: type === t.value ? 'white' : '#7BAED4',
                border: type === t.value ? '1px solid #E8622A' : '1px solid rgba(255,255,255,0.08)',
                fontFamily: 'Outfit, sans-serif', fontSize: 12, fontWeight: 700,
              }}
            >{t.label}</button>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <Label>Title <span style={{ color: '#ef4444' }}>*</span></Label>
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder={type === 'call' ? 'Called, no answer' : type === 'email' ? 'Sent intro email' : 'Brief description'}
          style={inputStyle}
          autoFocus
        />
      </div>

      <div style={{ marginBottom: 14 }}>
        <Label>Notes (optional)</Label>
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          rows={4}
          placeholder="Any details — what was said, next steps, follow-ups…"
          style={{ ...inputStyle, fontFamily: 'Outfit, sans-serif', resize: 'vertical' }}
        />
      </div>

      {error && (
        <div style={{ marginBottom: 12, color: '#ef4444', fontSize: 13, padding: '8px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)' }}>{error}</div>
      )}

      <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
        <button onClick={onClose} style={cancelBtn}>Cancel</button>
        <button onClick={submit} disabled={submitting || !title.trim()} style={{
          ...primaryBtn,
          background: submitting || !title.trim() ? '#7B3A1A' : '#E8622A',
          cursor: submitting || !title.trim() ? 'not-allowed' : 'pointer',
        }}>
          {submitting ? 'Logging…' : 'Log Activity'}
        </button>
      </div>
    </ModalShell>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 11, fontWeight: 700, color: '#7BAED4', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 7 }}>{children}</div>
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 8,
  background: '#061322', border: '1px solid rgba(255,255,255,0.08)',
  color: 'white', fontSize: 13, outline: 'none', fontFamily: 'Outfit, sans-serif',
}
const primaryBtn: React.CSSProperties = {
  flex: 1, padding: '11px 14px', borderRadius: 9, border: 'none',
  color: 'white', fontFamily: 'Outfit, sans-serif', fontSize: 13, fontWeight: 700,
}
const cancelBtn: React.CSSProperties = {
  padding: '11px 18px', borderRadius: 9, cursor: 'pointer',
  background: 'transparent', color: '#7BAED4', border: '1px solid rgba(255,255,255,0.1)',
  fontFamily: 'Outfit, sans-serif', fontSize: 13, fontWeight: 600,
}
