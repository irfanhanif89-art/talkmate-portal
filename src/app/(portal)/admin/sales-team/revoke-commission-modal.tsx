'use client'

import { useState } from 'react'
import ModalShell from '@/components/sales/modal-shell'
import { formatCurrency } from '@/lib/sales-format'
import type { AdminCommissionRow } from './admin-sales-team-view'

interface Props {
  commission: AdminCommissionRow
  onClose: () => void
  onSuccess: () => void
}

export default function RevokeCommissionModal({ commission, onClose, onSuccess }: Props) {
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (!reason.trim()) { setError('Revoke reason is required.'); return }
    setSubmitting(true); setError(null)
    const res = await fetch(`/api/admin/commissions/${commission.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'revoke', revoke_reason: reason.trim() }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setError(body?.error ?? 'Revoke failed.')
      setSubmitting(false)
      return
    }
    onSuccess()
  }

  return (
    <ModalShell title="Revoke commission" subtitle={`${commission.rep_name} · ${commission.business_name} · ${formatCurrency(commission.amount)}`} onClose={onClose}>
      <p style={{ fontSize: 13, color: '#7BAED4', lineHeight: 1.6, margin: '0 0 14px' }}>
        Common reasons: client cancelled within the 14-day money-back window, payment chargeback, plan downgrade after close. The rep will be emailed with your reason.
      </p>

      <label style={{ display: 'block', marginBottom: 14 }}>
        <span style={{ fontSize: 11, color: '#7BAED4', fontWeight: 600, display: 'block', marginBottom: 6 }}>Revoke reason *</span>
        <textarea
          value={reason}
          onChange={e => setReason(e.target.value)}
          rows={4}
          placeholder="e.g. Client cancelled day 11 of money-back window"
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
          {submitting ? 'Revoking…' : 'Revoke Commission'}
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
