'use client'

import { useState } from 'react'
import ModalShell from '@/components/sales/modal-shell'
import { formatCurrency } from '@/lib/sales-format'
import type { AdminLeadRow } from './admin-sales-team-view'

const COMMISSION_MAP = { starter: 299, growth: 349, pro: 399 } as const

interface Props {
  lead: AdminLeadRow
  onClose: () => void
  onSuccess: () => void
}

export default function ApproveDealModal({ lead, onClose, onSuccess }: Props) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const amount = lead.won_plan ? COMMISSION_MAP[lead.won_plan] : 0

  async function submit() {
    setSubmitting(true); setError(null)
    const res = await fetch(`/api/admin/leads/${lead.id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'approve' }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setError(body?.error ?? 'Approval failed.')
      setSubmitting(false)
      return
    }
    onSuccess()
  }

  return (
    <ModalShell title="Approve this deal?" onClose={onClose}>
      <div style={summaryBox}>
        <Row label="Rep" value={lead.rep_name} />
        <Row label="Business" value={lead.business_name} />
        <Row label="Plan" value={<span style={{ textTransform: 'capitalize' }}>{lead.won_plan ?? '—'}</span>} />
        <Row label="Commission" value={<strong style={{ color: '#22c55e' }}>{formatCurrency(amount)}</strong>} last />
      </div>

      <p style={{ fontSize: 13, color: '#7BAED4', lineHeight: 1.6, margin: '4px 0 14px' }}>
        Approving unlocks onboarding for the rep, marks the commission as approved, and emails them with next steps.
      </p>

      {error && <div style={errorBox}>{error}</div>}

      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={onClose} style={cancelBtn}>Cancel</button>
        <button onClick={submit} disabled={submitting} style={{
          flex: 1, padding: '12px 14px', borderRadius: 9, border: 'none',
          background: submitting ? '#16633A' : '#22c55e',
          color: 'white', fontFamily: 'Outfit, sans-serif', fontSize: 14, fontWeight: 700,
          cursor: submitting ? 'not-allowed' : 'pointer',
        }}>
          {submitting ? 'Approving…' : 'Approve'}
        </button>
      </div>
    </ModalShell>
  )
}

function Row({ label, value, last }: { label: string; value: React.ReactNode; last?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: last ? 'none' : '1px solid rgba(255,255,255,0.06)' }}>
      <span style={{ fontSize: 12, color: '#7BAED4', fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: 13, color: 'white', fontWeight: 600 }}>{value}</span>
    </div>
  )
}

const summaryBox: React.CSSProperties = {
  padding: '6px 14px', marginBottom: 12, borderRadius: 10,
  background: '#061322', border: '1px solid rgba(255,255,255,0.06)',
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
