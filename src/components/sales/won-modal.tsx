'use client'

import { useState } from 'react'
import ModalShell from './modal-shell'
import { COMMISSION_MAP, type BillingCycle, type CommissionPlan } from '@/lib/commission'
import type { LeadRow } from './leads-board'

interface Props {
  leadId: string
  businessName: string
  onClose: () => void
  onSuccess: (lead: LeadRow) => void
}

const PLANS: CommissionPlan[] = ['starter', 'growth', 'pro']

function fmt(n: number): string {
  return n % 1 === 0 ? `$${n}` : `$${n.toFixed(2)}`
}

export default function WonModal({ leadId, businessName, onClose, onSuccess }: Props) {
  const [plan, setPlan] = useState<CommissionPlan | null>(null)
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const base = plan ? COMMISSION_MAP[plan].base : 0
  const bonus = plan && billingCycle === 'annual' ? COMMISSION_MAP[plan].annual_bonus : 0
  const total = base + bonus
  const isAnnual = billingCycle === 'annual'

  async function submit() {
    if (!plan) return
    setSubmitting(true); setError(null)
    const res = await fetch(`/api/sales/leads/${leadId}/won`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan, billing_cycle: billingCycle }),
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
      subtitle={`Pick the plan ${businessName} signed up on and how they're paying. Submitting locks the commission and notifies admin for approval.`}
      onClose={onClose}
      maxWidth={500}
    >
      <SectionLabel>Plan</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
        {PLANS.map(p => {
          const planAmount = COMMISSION_MAP[p].base + (isAnnual ? COMMISSION_MAP[p].annual_bonus : 0)
          return (
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
                <div style={{ fontSize: 12, color: '#7BAED4', marginTop: 2 }}>
                  Base ${COMMISSION_MAP[p].base}{isAnnual ? ` + bonus $${COMMISSION_MAP[p].annual_bonus}` : ''}
                </div>
              </div>
              <div style={{ fontSize: 19, fontWeight: 800, color: '#22c55e' }}>{fmt(planAmount)}</div>
            </button>
          )
        })}
      </div>

      <SectionLabel>Billing</SectionLabel>
      <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
        <CycleBtn
          label="Monthly"
          subtext="Standard"
          active={billingCycle === 'monthly'}
          onClick={() => setBillingCycle('monthly')}
        />
        <CycleBtn
          label="Annual"
          subtext={plan ? `+${fmt(COMMISSION_MAP[plan].annual_bonus)} bonus` : '+2.5% bonus'}
          active={billingCycle === 'annual'}
          accent="#22c55e"
          onClick={() => setBillingCycle('annual')}
        />
      </div>

      {/* Live commission breakdown */}
      {plan && (
        <div style={{
          background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.25)',
          borderRadius: 11, padding: 16, marginBottom: 18,
        }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#22c55e', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>
            Commission breakdown
          </div>
          <BreakdownRow label="Base commission" value={fmt(base)} />
          {isAnnual && (
            <BreakdownRow
              label="Annual bonus"
              value={`+ ${fmt(bonus)}`}
              valueColor="#22c55e"
            />
          )}
          <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '10px 0' }} />
          <BreakdownRow
            label="Total commission"
            value={fmt(total)}
            bold
            valueColor="#22c55e"
          />
        </div>
      )}

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

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 800, color: '#E8622A',
      letterSpacing: '0.08em', textTransform: 'uppercase',
      marginBottom: 8,
    }}>{children}</div>
  )
}

function CycleBtn({ label, subtext, active, accent = '#E8622A', onClick }: {
  label: string; subtext: string; active: boolean; accent?: string; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, padding: '12px 14px', borderRadius: 10, cursor: 'pointer',
        background: active ? `${accent}1A` : '#061322',
        border: active ? `1.5px solid ${accent}` : '1px solid rgba(255,255,255,0.08)',
        color: 'white', textAlign: 'left',
        fontFamily: 'Outfit, sans-serif',
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 11, color: active ? accent : '#7BAED4', marginTop: 2, fontWeight: 600 }}>{subtext}</div>
    </button>
  )
}

function BreakdownRow({ label, value, bold, valueColor }: {
  label: string; value: string; bold?: boolean; valueColor?: string
}) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '4px 0',
      fontSize: bold ? 15 : 13,
      fontWeight: bold ? 700 : 500,
    }}>
      <span style={{ color: bold ? 'white' : '#7BAED4' }}>{label}</span>
      <span style={{ color: valueColor ?? 'white', fontWeight: bold ? 800 : 600 }}>{value}</span>
    </div>
  )
}

const cancelBtn: React.CSSProperties = {
  padding: '12px 18px', borderRadius: 9, cursor: 'pointer',
  background: 'transparent', color: '#7BAED4', border: '1px solid rgba(255,255,255,0.1)',
  fontFamily: 'Outfit, sans-serif', fontSize: 13, fontWeight: 600,
}
