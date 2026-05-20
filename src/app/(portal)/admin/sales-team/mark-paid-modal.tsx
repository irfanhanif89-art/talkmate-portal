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

export default function MarkPaidModal({ commission, onClose, onSuccess }: Props) {
  const [reference, setReference] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (!reference.trim()) { setError('Payment reference is required so the rep can match it on their bank statement.'); return }
    setSubmitting(true); setError(null)
    const res = await fetch(`/api/admin/commissions/${commission.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'pay', payment_reference: reference.trim() }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setError(body?.error ?? 'Mark paid failed.')
      setSubmitting(false)
      return
    }
    onSuccess()
  }

  return (
    <ModalShell title="Mark commission as paid" subtitle={`${commission.rep_name} · ${commission.business_name} · ${formatCurrency(commission.amount)}`} onClose={onClose}>
      <label style={{ display: 'block', marginBottom: 14 }}>
        <span style={{ fontSize: 11, color: '#7BAED4', fontWeight: 600, display: 'block', marginBottom: 6 }}>Payment reference *</span>
        <input
          value={reference}
          onChange={e => setReference(e.target.value)}
          placeholder="e.g. BANK-TXN-12345 or Stripe payout ID"
          autoFocus
          style={inputStyle}
        />
      </label>

      {error && <div style={errorBox}>{error}</div>}

      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={onClose} style={cancelBtn}>Cancel</button>
        <button
          onClick={submit}
          disabled={submitting || !reference.trim()}
          style={{
            flex: 1, padding: '12px 14px', borderRadius: 9, border: 'none',
            background: submitting || !reference.trim() ? '#16633A' : '#22c55e',
            color: 'white', fontFamily: 'Outfit, sans-serif', fontSize: 14, fontWeight: 700,
            cursor: submitting || !reference.trim() ? 'not-allowed' : 'pointer',
          }}
        >
          {submitting ? 'Saving…' : 'Mark as Paid'}
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
