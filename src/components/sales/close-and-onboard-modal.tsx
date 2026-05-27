'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Copy, Check, MailCheck, AlertTriangle, Send } from 'lucide-react'
import ModalShell from './modal-shell'
import { COMMISSION_MAP, type BillingCycle, type CommissionPlan } from '@/lib/commission'
import { useSalesRep } from '@/context/sales-rep-context'
import type { LeadRow } from './leads-board'

interface Props {
  lead: LeadRow
  onClose: () => void
  onSuccess: (lead: LeadRow) => void
}

const PLANS: CommissionPlan[] = ['starter', 'growth', 'pro']

function fmt(n: number): string {
  return n % 1 === 0 ? `$${n}` : `$${n.toFixed(2)}`
}

function planLabel(p: CommissionPlan): string {
  return p.charAt(0).toUpperCase() + p.slice(1)
}

export default function CloseAndOnboardModal({ lead, onClose, onSuccess }: Props) {
  const router = useRouter()
  const rep = useSalesRep()

  const [businessName, setBusinessName] = useState(lead.business_name ?? '')
  const [contactName, setContactName] = useState(lead.contact_name ?? '')
  const [email, setEmail] = useState(lead.email ?? '')
  const [phone, setPhone] = useState(lead.phone ?? '')
  const [plan, setPlan] = useState<CommissionPlan | null>(null)
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [completed, setCompleted] = useState<{
    lead: LeadRow
    emailedTo: string | null
    emailWarning: string | null
    stripeWarning: string | null
  } | null>(null)
  const [copiedScript, setCopiedScript] = useState(false)

  const base = plan ? COMMISSION_MAP[plan].base : 0
  const bonus = plan && billingCycle === 'annual' ? COMMISSION_MAP[plan].annual_bonus : 0
  const total = base + bonus
  const isAnnual = billingCycle === 'annual'

  const canSubmit =
    !!plan &&
    businessName.trim().length > 0 &&
    contactName.trim().length > 0 &&
    /\S+@\S+\.\S+/.test(email.trim()) &&
    phone.trim().length > 0 &&
    !submitting

  async function submit() {
    if (!canSubmit || !plan) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/sales/leads/${lead.id}/close-and-onboard`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_name: businessName.trim(),
          contact_name: contactName.trim(),
          email: email.trim(),
          phone: phone.trim(),
          plan,
          billing_cycle: billingCycle,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || !body?.ok) {
        setError(body?.error ?? 'Could not close the deal.')
        return
      }
      setCompleted({
        lead: body.lead as LeadRow,
        emailedTo: typeof body.emailed_to === 'string' ? body.emailed_to : null,
        emailWarning: typeof body.email_send_error === 'string' ? body.email_send_error : null,
        stripeWarning: typeof body.stripe_error === 'string' ? body.stripe_error : null,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error closing the deal.')
    } finally {
      setSubmitting(false)
    }
  }

  if (completed) {
    const script = [
      `Hi ${completed.lead.contact_name ?? contactName}, it is ${rep.full_name} from TalkMate.`,
      'I just wanted to personally welcome you on board.',
      'Your account is being set up now and someone from our team will be in touch within 24 hours to get everything configured.',
      `In the meantime, if you have any questions at all, call or text me directly on ${rep.phone ?? 'my mobile'}. Glad to have you with us.`,
    ].join(' ')

    async function copyScript() {
      try {
        await navigator.clipboard.writeText(script)
        setCopiedScript(true)
        setTimeout(() => setCopiedScript(false), 2000)
      } catch {
        // best-effort
      }
    }

    function finish() {
      onSuccess(completed!.lead)
      onClose()
      router.push('/sales/leads')
    }

    return (
      <ModalShell title="" onClose={finish} maxWidth={520}>
        <div style={{ textAlign: 'center', padding: '8px 0' }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%',
            background: 'rgba(34,197,94,0.15)', color: '#22c55e',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 18px',
          }}>
            <CheckCircle2 size={32} />
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: 'white', margin: 0, marginBottom: 8 }}>
            Deal closed.
          </h2>
          <p style={{ fontSize: 14, color: '#7BAED4', margin: 0, marginBottom: 22 }}>
            {completed.lead.business_name} is now in admin&apos;s hands.
          </p>

          {/* Commission breakdown */}
          <div style={{
            background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)',
            borderRadius: 10, padding: '16px 18px', marginBottom: 14, textAlign: 'left',
          }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#22c55e', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>
              Your commission
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'white' }}>
              ${base}
              <span style={{ fontSize: 12, fontWeight: 600, color: '#7BAED4', marginLeft: 8 }}>pending approval</span>
            </div>
            {isAnnual && bonus > 0 && (
              <div style={{ fontSize: 13, color: '#22c55e', fontWeight: 700, marginTop: 6 }}>
                + ${bonus} annual bonus
              </div>
            )}
            <div style={{ fontSize: 12, color: '#7BAED4', marginTop: 8, lineHeight: 1.5 }}>
              Approved when admin marks the client live.
            </div>
          </div>

          {/* Payment status */}
          {completed.emailedTo && (
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: 10,
              padding: '12px 14px', borderRadius: 8, marginBottom: 14,
              background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)',
              color: '#86efac', fontSize: 13, lineHeight: 1.55, textAlign: 'left',
            }}>
              <MailCheck size={16} style={{ flexShrink: 0, marginTop: 2, color: '#22c55e' }} />
              <span>
                Payment link emailed to <strong style={{ color: 'white' }}>{completed.emailedTo}</strong> from{' '}
                <strong style={{ color: 'white' }}>hello@talkmate.com.au</strong>. Replies come back to you.
              </span>
            </div>
          )}
          {completed.emailWarning && (
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: 10,
              padding: '10px 12px', borderRadius: 8, marginBottom: 14,
              background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)',
              color: '#fcd34d', fontSize: 12, lineHeight: 1.5, textAlign: 'left',
            }}>
              <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 2, color: '#f59e0b' }} />
              <span>
                Payment link was created but the email send failed: {completed.emailWarning}. Admin has been notified.
              </span>
            </div>
          )}
          {completed.stripeWarning && (
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: 10,
              padding: '10px 12px', borderRadius: 8, marginBottom: 14,
              background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
              color: '#fca5a5', fontSize: 12, lineHeight: 1.5, textAlign: 'left',
            }}>
              <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 2, color: '#ef4444' }} />
              <span>
                Stripe payment link could not be generated ({completed.stripeWarning}). The deal is still closed —
                admin can regenerate the link from the onboarding queue.
              </span>
            </div>
          )}

          {/* Welcome script */}
          <div style={{
            background: '#061322', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 10, padding: '16px 18px', marginBottom: 18, textAlign: 'left',
          }}>
            <div style={{
              fontSize: 11, fontWeight: 800, color: '#7BAED4', letterSpacing: '0.08em',
              textTransform: 'uppercase', marginBottom: 10, textAlign: 'center',
            }}>
              ────────  Welcome call script  ────────
            </div>
            <p style={{ fontSize: 13, color: 'white', lineHeight: 1.65, margin: 0, fontStyle: 'italic' }}>
              &ldquo;{script}&rdquo;
            </p>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={copyScript}
              style={{
                flex: 1, padding: '11px 16px', borderRadius: 9,
                background: copiedScript ? '#22c55e' : 'rgba(255,255,255,0.06)',
                color: copiedScript ? 'white' : '#7BAED4',
                border: copiedScript ? 'none' : '1px solid rgba(255,255,255,0.12)',
                fontFamily: 'Outfit, sans-serif', fontSize: 13, fontWeight: 700,
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              {copiedScript ? <Check size={14} /> : <Copy size={14} />}
              {copiedScript ? 'Copied script' : 'Copy welcome script'}
            </button>
            <button
              onClick={finish}
              style={{
                flex: 1, padding: '11px 16px', borderRadius: 9,
                background: '#E8622A', color: 'white', border: 'none',
                fontFamily: 'Outfit, sans-serif', fontSize: 13, fontWeight: 700, cursor: 'pointer',
              }}
            >Back to pipeline</button>
          </div>
        </div>
      </ModalShell>
    )
  }

  return (
    <ModalShell
      title="Close & onboard"
      subtitle="Capture the basics now and we will email the customer a Stripe payment link. The deal goes straight to admin to activate once paid."
      onClose={onClose}
      maxWidth={520}
    >
      {/* Contact / business basics */}
      <SectionLabel>Business & contact</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
        <Field label="Business name">
          <input
            value={businessName}
            onChange={e => setBusinessName(e.target.value)}
            style={inputStyle}
            placeholder="e.g. Cohen's Towing & Transport"
            autoFocus
          />
        </Field>
        <Field label="Contact name">
          <input
            value={contactName}
            onChange={e => setContactName(e.target.value)}
            style={inputStyle}
            placeholder="Who you spoke to on the phone"
          />
        </Field>
        <Field label="Customer email">
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            style={inputStyle}
            placeholder="Where the payment link will be sent"
          />
        </Field>
        <Field label="Customer phone">
          <input
            value={phone}
            onChange={e => setPhone(e.target.value)}
            style={inputStyle}
            placeholder="Their best contact number"
          />
        </Field>
      </div>

      {/* Plan */}
      <SectionLabel>Plan</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
        {PLANS.map(p => {
          const planAmount = COMMISSION_MAP[p].base + (isAnnual ? COMMISSION_MAP[p].annual_bonus : 0)
          return (
            <button
              key={p}
              onClick={() => setPlan(p)}
              type="button"
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
                <div style={{ fontSize: 15, fontWeight: 700 }}>{planLabel(p)}</div>
                <div style={{ fontSize: 12, color: '#7BAED4', marginTop: 2 }}>
                  Base ${COMMISSION_MAP[p].base}{isAnnual ? ` + bonus $${COMMISSION_MAP[p].annual_bonus}` : ''}
                </div>
              </div>
              <div style={{ fontSize: 19, fontWeight: 800, color: '#22c55e' }}>{fmt(planAmount)}</div>
            </button>
          )
        })}
      </div>

      {/* Billing */}
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
        <div style={{
          marginBottom: 12, color: '#ef4444', fontSize: 13,
          padding: '8px 12px', borderRadius: 8,
          background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
        }}>{error}</div>
      )}

      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={onClose} type="button" style={cancelBtn}>Cancel</button>
        <button
          onClick={submit}
          type="button"
          disabled={!canSubmit}
          style={{
            flex: 1, padding: '12px 16px', borderRadius: 9, border: 'none',
            background: !canSubmit ? '#16633A' : '#22c55e',
            color: 'white', fontFamily: 'Outfit, sans-serif',
            fontSize: 14, fontWeight: 700,
            cursor: !canSubmit ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          <Send size={14} />
          {submitting ? 'Closing & emailing payment link…' : 'Send payment link & close'}
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 11, color: '#7BAED4', fontWeight: 600 }}>{label}</span>
      {children}
    </label>
  )
}

function CycleBtn({ label, subtext, active, accent = '#E8622A', onClick }: {
  label: string; subtext: string; active: boolean; accent?: string; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      type="button"
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
