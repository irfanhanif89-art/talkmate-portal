'use client'

import { useState } from 'react'
import ModalShell from './modal-shell'

interface Props {
  leadId: string
  businessName: string
  onClose: () => void
  onSuccess: () => void
}

export default function BadLeadModal({ leadId, businessName, onClose, onSuccess }: Props) {
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (!reason.trim()) { setError('Tell us why so admin can investigate.'); return }
    setSubmitting(true); setError(null)
    const res = await fetch(`/api/sales/leads/${leadId}/bad-lead`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: reason.trim() }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setError(body?.error ?? 'Could not flag lead.')
      setSubmitting(false)
      return
    }
    onSuccess()
  }

  return (
    <ModalShell
      title="Flag as Bad Lead"
      subtitle={`This removes ${businessName} from your active pipeline. Admin will be notified to investigate the source.`}
      onClose={onClose}
    >
      <div style={{ marginBottom: 14 }}>
        <Label>Reason <span style={{ color: '#ef4444' }}>*</span></Label>
        <textarea
          value={reason}
          onChange={e => setReason(e.target.value)}
          rows={3}
          placeholder="e.g. Wrong number, business closed, duplicate of another lead"
          autoFocus
          style={{ ...inputStyle, fontFamily: 'Outfit, sans-serif', resize: 'vertical' }}
        />
      </div>

      {error && (
        <div style={{ marginBottom: 12, color: '#ef4444', fontSize: 13, padding: '8px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)' }}>{error}</div>
      )}

      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={onClose} style={cancelBtn}>Cancel</button>
        <button
          onClick={submit}
          disabled={submitting || !reason.trim()}
          style={{
            flex: 1, padding: '12px 16px', borderRadius: 9, border: 'none',
            background: submitting || !reason.trim() ? '#4a5060' : '#94a3b8',
            color: 'white', fontFamily: 'Outfit, sans-serif',
            fontSize: 14, fontWeight: 700,
            cursor: submitting || !reason.trim() ? 'not-allowed' : 'pointer',
          }}
        >
          {submitting ? 'Flagging…' : 'Flag Bad Lead'}
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
const cancelBtn: React.CSSProperties = {
  padding: '12px 18px', borderRadius: 9, cursor: 'pointer',
  background: 'transparent', color: '#7BAED4', border: '1px solid rgba(255,255,255,0.1)',
  fontFamily: 'Outfit, sans-serif', fontSize: 13, fontWeight: 600,
}
