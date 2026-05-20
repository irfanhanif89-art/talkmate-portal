'use client'

import { useState } from 'react'
import ModalShell from './modal-shell'
import { COMMISSION_MAP, type CommissionPlan } from '@/lib/commission'
import type { LeadRow } from './leads-board'

interface Props {
  leadId: string
  businessName: string
  onClose: () => void
  onSuccess: (lead: LeadRow) => void
}

const PLANS: CommissionPlan[] = ['starter', 'growth', 'pro']

export default function WonModal({ leadId, businessName, onClose, onSuccess }: Props) {
  const [plan, setPlan] = useState<CommissionPlan | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (!plan) return
    setSubmitting(true); setError(null)
    const res = await fetch(`/api/sales/leads/${leadId}/won`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setError(body?.error ?? 'Could not submit deal.')
      setSubmitting(false)
      return
    }
    const body = await res.json()
    onSuccess(body.lead as LeadRow)
  }

  return (
    <ModalShell
      title="Close the deal!"
      subtitle={`Select the plan ${businessName} signed up on. Submitting will lock the commission and notify admin for approval.`}
      onClose={onClose}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
        {PLANS.map(p => (
          <button
            key={p}
            onClick={() => setPlan(p)}
            style={{
              padding: '14px 18px', borderRadius: 11, cursor: 'pointer',
              background: plan === p ? 'rgba(34,197,94,0.12)' : '#061322',
              border: plan === p ? '1.5px solid #22c55e' : '1px solid rgba(255,255,255,0.08)',
              color: 'white', textAlign: 'left',
              fontFamily: 'Outfit, sans-serif',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, textTransform: 'capitalize' }}>{p}</div>
              <div style={{ fontSize: 12, color: '#7BAED4', marginTop: 2 }}>One-time payment per close</div>
            </div>
            <div style={{ fontSize: 19, fontWeight: 800, color: '#22c55e' }}>${COMMISSION_MAP[p]}</div>
          </button>
        ))}
      </div>

      {error && (
        <div style={{ marginBottom: 12, color: '#ef4444', fontSize: 13, padding: '8px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)' }}>{error}</div>
      )}

      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={onClose} style={cancelBtn}>Cancel</button>
        <button
          onClick={submit}
          disabled={!plan || submitting}
          style={{
            flex: 1, padding: '12px 16px', borderRadius: 9, border: 'none',
            background: !plan || submitting ? '#16633A' : '#22c55e',
            color: 'white', fontFamily: 'Outfit, sans-serif',
            fontSize: 14, fontWeight: 700,
            cursor: !plan || submitting ? 'not-allowed' : 'pointer',
          }}
        >
          {submitting ? 'Submitting…' : 'Submit for Approval'}
        </button>
      </div>
    </ModalShell>
  )
}

const cancelBtn: React.CSSProperties = {
  padding: '12px 18px', borderRadius: 9, cursor: 'pointer',
  background: 'transparent', color: '#7BAED4', border: '1px solid rgba(255,255,255,0.1)',
  fontFamily: 'Outfit, sans-serif', fontSize: 13, fontWeight: 600,
}
