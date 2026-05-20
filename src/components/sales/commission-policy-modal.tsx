'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function CommissionPolicyModal() {
  const router = useRouter()
  const [agreed, setAgreed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleAgree() {
    if (!agreed) return
    setSubmitting(true); setError(null)
    const res = await fetch('/api/sales/acknowledge-policy', { method: 'POST' })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setError(body?.error ?? 'Could not save acknowledgement, please try again.')
      setSubmitting(false)
      return
    }
    router.refresh()
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(6,19,34,0.92)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20, fontFamily: 'Outfit, sans-serif',
    }}>
      <div style={{
        background: '#0A1E38', color: 'white',
        border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16,
        maxWidth: 560, width: '100%', maxHeight: '90vh', overflowY: 'auto',
        padding: 32, boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
      }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '4px 10px', background: 'rgba(232,98,42,0.15)',
          border: '1px solid rgba(232,98,42,0.3)', borderRadius: 99,
          fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
          textTransform: 'uppercase', color: '#E8622A', marginBottom: 18,
        }}>
          One-time acknowledgement
        </div>

        <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, marginBottom: 8, letterSpacing: '-0.5px' }}>
          TalkMate Sales Commission Policy <span style={{ color: '#7BAED4', fontWeight: 500 }}>(v1)</span>
        </h1>
        <p style={{ fontSize: 14, color: '#7BAED4', margin: 0, marginBottom: 24 }}>
          Please read this before you start submitting deals. Once you agree, you'll have access to your pipeline, commission tracker, and onboarding tools.
        </p>

        <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: 18, marginBottom: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#E8622A', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>
            Commission rates
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <RateCard plan="Starter" amount={299} />
            <RateCard plan="Growth"  amount={349} />
            <RateCard plan="Pro"     amount={399} />
          </div>
          <p style={{ fontSize: 12, color: '#7BAED4', marginTop: 10, marginBottom: 0 }}>
            One-time payment per closed deal.
          </p>
        </div>

        <PolicyRow
          title="Payment timing"
          body="Commissions are approved and paid within 7 business days of a client's account going live."
        />
        <PolicyRow
          title="Clawback"
          body="If a client cancels within 14 days of account creation (TalkMate's money-back guarantee window), the commission is fully revoked regardless of payment status."
        />
        <PolicyRow
          title="Disputes"
          body="Any commission dispute must be raised within 30 days of the close date."
        />

        <label style={{
          display: 'flex', alignItems: 'flex-start', gap: 10,
          padding: 14, marginTop: 18, marginBottom: 16,
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 10, cursor: 'pointer',
        }}>
          <input
            type="checkbox"
            checked={agreed}
            onChange={e => setAgreed(e.target.checked)}
            style={{ marginTop: 3, width: 16, height: 16, accentColor: '#E8622A', cursor: 'pointer' }}
          />
          <span style={{ fontSize: 14, color: 'white', lineHeight: 1.5 }}>
            I have read and understood the TalkMate Commission Policy.
          </span>
        </label>

        {error && (
          <div style={{
            padding: '10px 14px', marginBottom: 14, borderRadius: 8,
            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
            color: '#ef4444', fontSize: 13,
          }}>{error}</div>
        )}

        <button
          onClick={handleAgree}
          disabled={!agreed || submitting}
          style={{
            width: '100%', padding: '14px',
            background: !agreed || submitting ? '#7B3A1A' : '#E8622A',
            color: 'white', border: 'none', borderRadius: 12,
            fontFamily: 'Outfit, sans-serif', fontSize: 16, fontWeight: 700,
            cursor: !agreed || submitting ? 'not-allowed' : 'pointer',
          }}
        >
          {submitting ? 'Saving…' : "I Agree — Let's Go"}
        </button>
      </div>
    </div>
  )
}

function RateCard({ plan, amount }: { plan: string; amount: number }) {
  return (
    <div style={{
      background: '#061322', border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 10, padding: '14px 12px', textAlign: 'center',
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#7BAED4', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 4 }}>
        {plan}
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color: '#E8622A', letterSpacing: '-0.5px' }}>
        ${amount}
      </div>
    </div>
  )
}

function PolicyRow({ title, body }: { title: string; body: string }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'white', marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 13, color: '#7BAED4', lineHeight: 1.6 }}>{body}</div>
    </div>
  )
}
