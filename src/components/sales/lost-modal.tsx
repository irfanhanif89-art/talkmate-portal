'use client'

import { useState } from 'react'
import ModalShell from './modal-shell'
import { LOST_REASONS } from '@/lib/sales-format'
import type { LeadRow } from './leads-board'

interface Props {
  leadId: string
  onClose: () => void
  onSuccess: (lead: LeadRow) => void
}

export default function LostModal({ leadId, onClose, onSuccess }: Props) {
  const [reason, setReason] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (!reason) { setError('Pick a reason so we can track patterns.'); return }
    setSubmitting(true); setError(null)
    const res = await fetch(`/api/sales/leads/${leadId}/lost`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lost_reason: reason, notes: notes.trim() || null }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setError(body?.error ?? 'Could not mark as lost.')
      setSubmitting(false)
      return
    }
    const body = await res.json()
    onSuccess(body.lead as LeadRow)
  }

  return (
    <ModalShell title="Why did this one not work out?" subtitle="We use this to improve lead quality over time." onClose={onClose}>
      <div style={{ marginBottom: 14 }}>
        <Label>Reason <span style={{ color: '#ef4444' }}>*</span></Label>
        <select
          value={reason}
          onChange={e => setReason(e.target.value)}
          style={inputStyle}
        >
          <option value="">Select a reason…</option>
          {LOST_REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
      </div>

      <div style={{ marginBottom: 14 }}>
        <Label>Notes (optional)</Label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={3}
          placeholder="Anything else worth knowing…"
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
          disabled={!reason || submitting}
          style={{
            flex: 1, padding: '12px 16px', borderRadius: 9, border: 'none',
            background: !reason || submitting ? '#7B1F1F' : '#ef4444',
            color: 'white', fontFamily: 'Outfit, sans-serif',
            fontSize: 14, fontWeight: 700,
            cursor: !reason || submitting ? 'not-allowed' : 'pointer',
          }}
        >
          {submitting ? 'Saving…' : 'Mark as Lost'}
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
