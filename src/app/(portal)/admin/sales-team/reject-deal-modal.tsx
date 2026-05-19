'use client'

import { useState } from 'react'
import ModalShell from '@/components/sales/modal-shell'
import type { AdminLeadRow } from './admin-sales-team-view'

interface Props {
  lead: AdminLeadRow
  onClose: () => void
  onSuccess: () => void
}

export default function RejectDealModal({ lead, onClose, onSuccess }: Props) {
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (!reason.trim()) { setError('Tell the rep why so they can address it.'); return }
    setSubmitting(true); setError(null)
    const res = await fetch(`/api/admin/leads/${lead.id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reject', rejection_reason: reason.trim() }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setError(body?.error ?? 'Rejection failed.')
      setSubmitting(false)
      return
    }
    onSuccess()
  }

  return (
    <ModalShell title={`Reject deal: ${lead.business_name}`} subtitle="The lead moves back to the rep's pipeline as 'proposal sent' and the pending commission is revoked." onClose={onClose}>
      <label style={{ display: 'block', marginBottom: 14 }}>
        <span style={{ fontSize: 11, color: '#7BAED4', fontWeight: 600, display: 'block', marginBottom: 6 }}>Reason *</span>
        <textarea
          value={reason}
          onChange={e => setReason(e.target.value)}
          rows={4}
          placeholder="e.g. Plan mismatch — they signed up on starter not growth"
          autoFocus
          style={{ ...inputStyle, fontFamily: 'Outfit, sans-serif', resize: 'vertical' }}
        />
      </label>

      {error && <div style={errorBox}>{error}</div>}

      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={onClose} style={cancelBtn}>Cancel</button>
        <button
          onClick={submit}
          disabled={submitting || !reason.trim()}
          style={{
            flex: 1, padding: '12px 14px', borderRadius: 9, border: 'none',
            background: submitting || !reason.trim() ? '#7B1F1F' : '#ef4444',
            color: 'white', fontFamily: 'Outfit, sans-serif', fontSize: 14, fontWeight: 700,
            cursor: submitting || !reason.trim() ? 'not-allowed' : 'pointer',
          }}
        >
          {submitting ? 'Rejecting…' : 'Reject Deal'}
        </button>
      </div>
    </ModalShell>
  )
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
const errorBox: React.CSSProperties = {
  marginBottom: 10, color: '#ef4444', fontSize: 13,
  padding: '8px 12px', borderRadius: 8,
  background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
}
