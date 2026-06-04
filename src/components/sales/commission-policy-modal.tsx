'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'

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
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-5"
      style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)' }}
    >
      <div
        className="bg-card border border-line rounded-[16px] text-text w-full max-w-[560px] max-h-[90vh] overflow-y-auto p-8 shadow-[0_20px_60px_rgba(0,0,0,0.3)]"
      >
        <div
          className="inline-flex items-center gap-1.5 px-[10px] py-1 rounded-full mb-[18px]
            text-[10px] font-[700] tracking-[0.1em] uppercase text-orange
            bg-[rgba(232,98,42,0.15)] border border-[rgba(232,98,42,0.3)]"
        >
          One-time acknowledgement
        </div>

        <h1 className="text-[24px] font-[800] tracking-[-0.5px] m-0 mb-2">
          TalkMate Sales Commission Policy{' '}
          <span className="text-dim font-[500]">(v1)</span>
        </h1>
        <p className="text-[14px] text-dim m-0 mb-6">
          Please read this before you start submitting deals. Once you agree, you&apos;ll have access to your pipeline, commission tracker, and onboarding tools.
        </p>

        {/* Monthly close card */}
        <div className="bg-card-2 border border-line rounded-[12px] p-[18px] mb-[14px]">
          <div className="text-[12px] font-[700] text-orange tracking-[0.08em] uppercase mb-[10px]">
            Monthly close
          </div>
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))' }}>
            <RateCard plan="Starter" amount={299} />
            <RateCard plan="Growth"  amount={349} />
            <RateCard plan="Pro"     amount={399} />
          </div>
        </div>

        {/* Annual close card */}
        <div className="bg-card-2 border border-[rgba(34,197,94,0.25)] rounded-[12px] p-[18px] mb-[18px]">
          <div className="text-[12px] font-[700] text-green tracking-[0.08em] uppercase mb-[10px]">
            Annual close (client pays 12 months upfront)
          </div>
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))' }}>
            <RateCard plan="Starter" amount={373.75} accent="text-green" />
            <RateCard plan="Growth"  amount={473.75} accent="text-green" />
            <RateCard plan="Pro"     amount={598.75} accent="text-green" />
          </div>
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
          title="Push annual"
          body="The fastest way to increase your commission is to offer clients the annual plan. They save 2 months. You earn more. Everyone wins."
        />
        <PolicyRow
          title="Disputes"
          body="Any commission dispute must be raised within 30 days of the close date."
        />

        <label className="flex items-start gap-[10px] p-[14px] mt-[18px] mb-4 bg-card-2 border border-line rounded-[10px] cursor-pointer">
          <input
            type="checkbox"
            checked={agreed}
            onChange={e => setAgreed(e.target.checked)}
            className="mt-[3px] w-4 h-4 cursor-pointer"
            style={{ accentColor: '#E8622A' }}
          />
          <span className="text-[14px] text-text leading-[1.5]">
            I have read and understood the TalkMate Commission Policy.
          </span>
        </label>

        {error && (
          <div className="px-[14px] py-[10px] mb-[14px] rounded-[8px] bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.25)] text-red text-[13px]">
            {error}
          </div>
        )}

        <button
          onClick={handleAgree}
          disabled={!agreed || submitting}
          className={cn(
            'w-full py-[14px] rounded-[12px] text-[16px] font-[700] text-white border-none transition-opacity',
            !agreed || submitting
              ? 'bg-orange/40 cursor-not-allowed'
              : 'bg-orange cursor-pointer hover:opacity-90',
          )}
        >
          {submitting ? 'Saving…' : "I Agree, Let's Go"}
        </button>
      </div>
    </div>
  )
}

function RateCard({ plan, amount, accent = 'text-orange' }: { plan: string; amount: number; accent?: string }) {
  return (
    <div className="bg-bg border border-line rounded-[10px] p-[14px_12px] text-center">
      <div className="text-[11px] font-[700] text-dim tracking-[0.05em] uppercase mb-1">
        {plan}
      </div>
      <div className={`text-[22px] font-[800] tracking-[-0.5px] ${accent}`}>
        ${amount}
      </div>
    </div>
  )
}

function PolicyRow({ title, body }: { title: string; body: string }) {
  return (
    <div className="mb-3">
      <div className="text-[13px] font-[700] text-text mb-1">{title}</div>
      <div className="text-[13px] text-dim leading-[1.6]">{body}</div>
    </div>
  )
}
