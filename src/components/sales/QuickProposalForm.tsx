'use client'

import { useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, Send } from 'lucide-react'
import { SALES_INDUSTRY_SLUGS, SALES_INDUSTRY_LABELS, type SalesIndustrySlug } from '@/lib/industry-slugs'

type Plan = 'starter' | 'growth' | 'pro'
type Template = 'full' | 'post_demo'

const PLAN_OPTIONS: Array<{ value: Plan; label: string; price: number; recommended?: boolean }> = [
  { value: 'starter', label: 'Starter', price: 299 },
  { value: 'growth',  label: 'Growth',  price: 499, recommended: true },
  { value: 'pro',     label: 'Pro',     price: 799 },
]

export default function QuickProposalForm() {
  const [businessName, setBusinessName] = useState('')
  const [contactName, setContactName] = useState('')
  const [email, setEmail] = useState('')
  const [industry, setIndustry] = useState<SalesIndustrySlug>('professional')
  const [plan, setPlan] = useState<Plan>('growth')
  const [note, setNote] = useState('')
  const [template, setTemplate] = useState<Template>('full')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)

  const emailValid = /\S+@\S+\.\S+/.test(email.trim())
  const canSend = businessName.trim().length > 0 && emailValid && !sending

  async function submit() {
    if (!canSend) return
    setSending(true); setError(null)
    try {
      const res = await fetch('/api/sales/proposals/quick-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_name: businessName.trim(),
          contact_name: contactName.trim(),
          email: email.trim(),
          industry,
          plan,
          template_type: template,
          personalised_note: note,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || !body.ok) {
        setError(body?.error ?? 'Could not send proposal. Try again.')
        setSending(false)
        return
      }
      setSentTo(email.trim())
      setSending(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error sending proposal.')
      setSending(false)
    }
  }

  function reset() {
    setBusinessName(''); setContactName(''); setEmail('')
    setIndustry('professional'); setPlan('growth'); setNote(''); setTemplate('full')
    setSentTo(null); setError(null)
  }

  if (sentTo) {
    return (
      <div style={{
        background: '#0A1E38', border: '1px solid rgba(34,197,94,0.3)',
        borderRadius: 12, padding: 28, textAlign: 'center',
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: '50%',
          background: 'rgba(34,197,94,0.15)', color: '#22c55e',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 16px',
        }}>
          <CheckCircle2 size={28} />
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: 'white', margin: 0, marginBottom: 8 }}>
          Proposal sent
        </h2>
        <p style={{ fontSize: 14, color: '#7BAED4', margin: 0, marginBottom: 22 }}>
          Sent to {sentTo}. It&apos;s now tracked in your pipeline so you can follow up and close it.
        </p>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button
            onClick={reset}
            style={{
              padding: '11px 18px', borderRadius: 9, border: 'none',
              background: '#E8622A', color: 'white',
              fontFamily: 'Outfit, sans-serif', fontSize: 13, fontWeight: 700, cursor: 'pointer',
            }}
          >Send another</button>
          <Link
            href="/sales/leads"
            style={{
              padding: '11px 18px', borderRadius: 9,
              background: 'rgba(255,255,255,0.04)', color: '#7BAED4',
              border: '1px solid rgba(255,255,255,0.12)',
              fontFamily: 'Outfit, sans-serif', fontSize: 13, fontWeight: 700, textDecoration: 'none',
            }}
          >Go to pipeline</Link>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      background: '#0A1E38', border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 12, padding: 22,
    }}>
      <Field label="Business name">
        <input
          value={businessName} onChange={e => setBusinessName(e.target.value)}
          style={inputStyle} placeholder="e.g. Cohen's Towing & Transport" autoFocus
        />
      </Field>

      <Field label="Client email" help="Where the proposal will be sent.">
        <input
          type="email" value={email} onChange={e => setEmail(e.target.value)}
          style={inputStyle} placeholder="owner@theirbusiness.com.au"
        />
      </Field>

      <Field label="Contact name" help="Optional — used to personalise the greeting.">
        <input
          value={contactName} onChange={e => setContactName(e.target.value)}
          style={inputStyle} placeholder="Who you spoke to"
        />
      </Field>

      <Field label="Industry" help="Picks the right benefit bullets for their trade.">
        <select value={industry} onChange={e => setIndustry(e.target.value as SalesIndustrySlug)} style={inputStyle}>
          {SALES_INDUSTRY_SLUGS.map(s => (
            <option key={s} value={s}>{SALES_INDUSTRY_LABELS[s]}</option>
          ))}
        </select>
      </Field>

      <Field label="Plan">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {PLAN_OPTIONS.map(opt => (
            <label key={opt.value} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 12px', borderRadius: 9, cursor: 'pointer',
              background: plan === opt.value ? 'rgba(232,98,42,0.1)' : '#061322',
              border: `1px solid ${plan === opt.value ? 'rgba(232,98,42,0.35)' : 'rgba(255,255,255,0.08)'}`,
            }}>
              <input
                type="radio" name="plan" checked={plan === opt.value}
                onChange={() => setPlan(opt.value)}
                style={{ accentColor: '#E8622A' }}
              />
              <span style={{ fontSize: 13, color: 'white', fontWeight: 700 }}>
                {opt.label} ${opt.price}/mo
                {opt.recommended && (
                  <span style={{ marginLeft: 8, fontSize: 11, color: '#E8622A', fontWeight: 700 }}>
                    Recommended
                  </span>
                )}
              </span>
            </label>
          ))}
        </div>
      </Field>

      <Field label="Personalised note" help="Up to 200 characters. Shown above the bullets in the email body.">
        <textarea
          value={note} onChange={e => setNote(e.target.value.slice(0, 200))}
          rows={3} placeholder="Optional — anything you discussed on the call."
          style={{ ...inputStyle, resize: 'vertical', fontFamily: 'Outfit, sans-serif' }}
        />
      </Field>

      <Field label="Template">
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button" onClick={() => setTemplate('full')}
            style={{
              flex: 1, padding: '10px 12px', borderRadius: 9, cursor: 'pointer',
              fontSize: 13, fontFamily: 'Outfit, sans-serif', fontWeight: 700,
              background: template === 'full' ? 'rgba(232,98,42,0.12)' : 'transparent',
              color: template === 'full' ? '#E8622A' : '#7BAED4',
              border: `1px solid ${template === 'full' ? 'rgba(232,98,42,0.35)' : 'rgba(255,255,255,0.08)'}`,
            }}
          >Full Proposal</button>
          <button
            type="button" onClick={() => setTemplate('post_demo')}
            style={{
              flex: 1, padding: '10px 12px', borderRadius: 9, cursor: 'pointer',
              fontSize: 13, fontFamily: 'Outfit, sans-serif', fontWeight: 700,
              background: template === 'post_demo' ? 'rgba(232,98,42,0.12)' : 'transparent',
              color: template === 'post_demo' ? '#E8622A' : '#7BAED4',
              border: `1px solid ${template === 'post_demo' ? 'rgba(232,98,42,0.35)' : 'rgba(255,255,255,0.08)'}`,
            }}
          >Post-Demo Follow-Up</button>
        </div>
      </Field>

      {error && (
        <div style={{
          marginBottom: 12, padding: '10px 14px', borderRadius: 9,
          background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
          color: '#ef4444', fontSize: 13,
        }}>{error}</div>
      )}

      <button
        onClick={submit}
        disabled={!canSend}
        style={{
          width: '100%', padding: '12px 18px', borderRadius: 9, border: 'none',
          background: !canSend ? '#7B3A1A' : '#E8622A',
          color: 'white', fontFamily: 'Outfit, sans-serif',
          fontSize: 14, fontWeight: 700,
          cursor: !canSend ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}
      >
        <Send size={15} /> {sending ? 'Sending...' : 'Send Proposal'}
      </button>
    </div>
  )
}

function Field({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', marginBottom: 14 }}>
      <span style={{ display: 'block', fontSize: 12, color: '#7BAED4', fontWeight: 600, marginBottom: 6 }}>
        {label}
      </span>
      {children}
      {help && <span style={{ display: 'block', fontSize: 11, color: '#4A7FBB', marginTop: 4 }}>{help}</span>}
    </label>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 8,
  background: '#061322', border: '1px solid rgba(255,255,255,0.08)',
  color: 'white', fontFamily: 'Outfit, sans-serif', fontSize: 13, outline: 'none',
}
