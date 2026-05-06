'use client'

import { useState } from 'react'
import { AdminBusiness, INDUSTRIES, PartnerOption, PLAN_OPTIONS, planLabel } from './types'

interface CreatedResult {
  business: AdminBusiness
  email: string
  temp_password: string
}

export default function CreateClientModal({
  partners, onClose, onCreated,
}: {
  partners: PartnerOption[]
  onClose: () => void
  onCreated: (b: AdminBusiness) => void
}) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<CreatedResult | null>(null)
  const [paymentLinkBusy, setPaymentLinkBusy] = useState(false)
  const [paymentLinkUrl, setPaymentLinkUrl] = useState<string | null>(null)

  // Form state.
  const [businessName, setBusinessName] = useState('')
  const [ownerName, setOwnerName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [industry, setIndustry] = useState('restaurants')
  const [address, setAddress] = useState('')
  const [website, setWebsite] = useState('')
  const [abn, setAbn] = useState('')
  const [referredBy, setReferredBy] = useState('')
  const [plan, setPlan] = useState<'starter' | 'growth' | 'pro'>('growth')
  const [answerPhrase, setAnswerPhrase] = useState('')
  const [servicesSummary, setServicesSummary] = useState('')
  const [afterHours, setAfterHours] = useState('')
  const [initialNote, setInitialNote] = useState('')
  const [sendWelcomeEmail, setSendWelcomeEmail] = useState(true)

  async function submit() {
    if (!businessName || !ownerName || !email || !phone || !answerPhrase || !servicesSummary || !afterHours) {
      setError('Please fill in all required fields.')
      return
    }
    setSubmitting(true); setError(null)
    try {
      const res = await fetch('/api/admin/clients/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_name: businessName,
          owner_name: ownerName,
          email,
          phone,
          industry,
          address: address || undefined,
          website: website || undefined,
          abn: abn || undefined,
          plan,
          agent_answer_phrase: answerPhrase,
          services_summary: servicesSummary,
          after_hours_instruction: afterHours,
          referred_by: referredBy || undefined,
          initial_note: initialNote || undefined,
          send_welcome_email: sendWelcomeEmail,
        }),
      })
      const data = await res.json()
      if (!data.ok) {
        if (data.existing_business_id) {
          setError(`${data.error}. Existing business: ${data.existing_business_name ?? data.existing_business_id}`)
        } else {
          setError(data.error || 'Failed to create')
        }
        return
      }
      onCreated(data.business)
      setSuccess({
        business: data.business,
        email,
        temp_password: data.business.temp_password ?? '',
      })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  async function generatePaymentLink() {
    if (!success) return
    setPaymentLinkBusy(true); setError(null)
    try {
      const res = await fetch(`/api/admin/clients/${success.business.id}/generate-payment-link`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'Failed')
      setPaymentLinkUrl(data.url)
      try { await navigator.clipboard.writeText(data.url) } catch {}
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setPaymentLinkBusy(false)
    }
  }

  if (success) {
    return (
      <ModalShell onClose={onClose}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%',
            background: 'rgba(34,197,94,0.15)', border: '2px solid #22C55E',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 28, color: '#22C55E', marginBottom: 14,
          }}>✓</div>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: 'white', margin: 0 }}>
            Account created for {success.business.name}
          </h2>
        </div>

        <div style={{ background: '#071829', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 18, marginBottom: 16 }}>
          <SuccessRow label="Login email" value={success.email} />
          <SuccessRow label="Temporary password" value={success.temp_password} mono />
          <SuccessRow label="Plan" value={planLabel(success.business.plan)} />
          <SuccessRow label="Status" value="Pending" badge="#F59E0B" />
        </div>

        {paymentLinkUrl && (
          <div style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 10, padding: 14, marginBottom: 16 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#22C55E', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Payment link (copied to clipboard)</p>
            <p style={{ fontSize: 12, color: 'white', wordBreak: 'break-all', fontFamily: 'monospace' }}>{paymentLinkUrl}</p>
          </div>
        )}

        {error && <ErrorBanner msg={error} />}

        <p style={{ fontSize: 13, color: '#7BAED4', lineHeight: 1.6, marginBottom: 18 }}>
          Their account is pending. Send the payment link by SMS along with their login details. Payment activates the account
          automatically. When they first log in they must accept our Terms of Service before accessing their dashboard.
        </p>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={generatePaymentLink}
            disabled={paymentLinkBusy}
            style={primaryBtn(paymentLinkBusy)}
          >{paymentLinkBusy ? 'Generating…' : (paymentLinkUrl ? 'Regenerate payment link' : 'Generate payment link')}</button>
          <button onClick={onClose} style={ghostBtn()}>Done</button>
        </div>
      </ModalShell>
    )
  }

  return (
    <ModalShell onClose={onClose}>
      <h2 style={{ fontSize: 20, fontWeight: 800, color: 'white', margin: '0 0 6px 0' }}>Create new client</h2>
      <p style={{ fontSize: 13, color: '#7BAED4', marginBottom: 20 }}>
        Onboard a client manually — they get a login + a payment link to activate.
      </p>

      <SectionTitle>1 · Business details</SectionTitle>
      <FormGrid>
        <Field label="Business name *">
          <Input value={businessName} onChange={setBusinessName} />
        </Field>
        <Field label="Owner full name *">
          <Input value={ownerName} onChange={setOwnerName} />
        </Field>
        <Field label="Email *" hint="This becomes their login email">
          <Input value={email} onChange={setEmail} type="email" />
        </Field>
        <Field label="Phone *">
          <Input value={phone} onChange={setPhone} />
        </Field>
        <Field label="Industry *">
          <Select value={industry} onChange={setIndustry} options={INDUSTRIES} />
        </Field>
        <Field label="ABN">
          <Input value={abn} onChange={setAbn} />
        </Field>
        <Field label="Address">
          <Input value={address} onChange={setAddress} />
        </Field>
        <Field label="Website">
          <Input value={website} onChange={setWebsite} type="url" />
        </Field>
        <Field label="Referred by (partner)">
          <Select
            value={referredBy}
            onChange={setReferredBy}
            options={[{ value: '', label: '— None —' }, ...partners.map(p => ({ value: p.id, label: p.name }))]}
          />
        </Field>
      </FormGrid>

      <SectionTitle>2 · Plan</SectionTitle>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 22 }}>
        {PLAN_OPTIONS.map(opt => {
          const selected = plan === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => setPlan(opt.value)}
              style={{
                padding: 16, borderRadius: 12, cursor: 'pointer',
                background: selected ? 'rgba(232,98,42,0.10)' : '#071829',
                border: `2px solid ${selected ? '#E8622A' : 'rgba(255,255,255,0.07)'}`,
                textAlign: 'left' as const, fontFamily: 'Outfit, sans-serif',
                position: 'relative' as const,
              }}
            >
              {opt.recommended && (
                <span style={{
                  position: 'absolute', top: -10, left: 14,
                  background: '#E8622A', color: 'white', fontSize: 10, fontWeight: 700,
                  padding: '3px 8px', borderRadius: 99,
                }}>RECOMMENDED</span>
              )}
              <p style={{ fontSize: 14, fontWeight: 700, color: 'white', marginBottom: 4 }}>{opt.label}</p>
              <p style={{ fontSize: 18, fontWeight: 800, color: selected ? '#E8622A' : '#4A9FE8' }}>${opt.price}<span style={{ fontSize: 11, fontWeight: 500, color: '#7BAED4' }}>/mo</span></p>
            </button>
          )
        })}
      </div>

      <SectionTitle>3 · Agent setup</SectionTitle>
      <FormGrid>
        <Field label="Answer phrase *" full>
          <Input value={answerPhrase} onChange={setAnswerPhrase} placeholder="Thank you for calling [Business Name], how can I help?" />
        </Field>
        <Field label="Services summary *" full>
          <TextArea value={servicesSummary} onChange={setServicesSummary} placeholder="Describe what this business does. Donna uses this to build the agent." />
        </Field>
        <Field label="After hours instruction *" full>
          <Input value={afterHours} onChange={setAfterHours} placeholder="e.g. Take a message and send SMS to owner on 0412 345 678" />
        </Field>
      </FormGrid>

      <SectionTitle>4 · Initial note (optional)</SectionTitle>
      <TextArea
        value={initialNote}
        onChange={setInitialNote}
        placeholder="e.g. Met at networking event. Interested in towing dispatch. Paid via SMS 29 April."
      />

      <div style={{ marginTop: 22, marginBottom: 20 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', color: 'white', fontSize: 13 }}>
          <input
            type="checkbox"
            checked={sendWelcomeEmail}
            onChange={e => setSendWelcomeEmail(e.target.checked)}
            style={{ width: 16, height: 16, accentColor: '#E8622A' }}
          />
          Send welcome email immediately
        </label>
      </div>

      {error && <ErrorBanner msg={error} />}

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 18 }}>
        <button onClick={onClose} style={ghostBtn()}>Cancel</button>
        <button onClick={submit} disabled={submitting} style={primaryBtn(submitting)}>
          {submitting ? 'Creating…' : 'Create account →'}
        </button>
      </div>
    </ModalShell>
  )
}

// ── Shared UI bits used by both Create and Edit modals ─────────────────────

export function ModalShell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 90,
        background: 'rgba(6,19,34,0.85)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 28, overflow: 'auto',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 720, background: '#0A1E38',
          border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16,
          padding: 28, color: '#F2F6FB', position: 'relative' as const,
          boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
        }}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            position: 'absolute', top: 14, right: 14,
            width: 30, height: 30, borderRadius: 8,
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
            color: 'white', cursor: 'pointer', fontSize: 18, lineHeight: 1,
          }}
        >×</button>
        {children}
      </div>
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 style={{
      fontSize: 11, fontWeight: 700, color: '#7BAED4',
      textTransform: 'uppercase', letterSpacing: '0.08em',
      marginTop: 22, marginBottom: 12,
    }}>{children}</h3>
  )
}

function FormGrid({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 6 }}>
      {children}
    </div>
  )
}

function Field({ label, hint, full, children }: { label: string; hint?: string; full?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ gridColumn: full ? '1 / -1' : undefined }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#7BAED4', marginBottom: 6 }}>{label}</label>
      {children}
      {hint && <p style={{ fontSize: 11, color: '#5A8AB7', marginTop: 4 }}>{hint}</p>}
    </div>
  )
}

function Input({ value, onChange, placeholder, type = 'text' }: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: '100%', padding: '10px 14px', borderRadius: 8,
        background: '#071829', border: '1px solid rgba(255,255,255,0.1)',
        color: 'white', fontSize: 13, fontFamily: 'Outfit, sans-serif',
        boxSizing: 'border-box' as const,
      }}
    />
  )
}

function TextArea({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      rows={4}
      style={{
        width: '100%', padding: '10px 14px', borderRadius: 8,
        background: '#071829', border: '1px solid rgba(255,255,255,0.1)',
        color: 'white', fontSize: 13, fontFamily: 'Outfit, sans-serif',
        resize: 'vertical' as const, boxSizing: 'border-box' as const,
      }}
    />
  )
}

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: Array<{ value: string; label: string }> }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{
        width: '100%', padding: '10px 14px', borderRadius: 8,
        background: '#071829', border: '1px solid rgba(255,255,255,0.1)',
        color: 'white', fontSize: 13, fontFamily: 'Outfit, sans-serif', cursor: 'pointer',
        boxSizing: 'border-box' as const,
      }}
    >
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

function ErrorBanner({ msg }: { msg: string }) {
  return (
    <div style={{
      padding: '10px 14px', background: 'rgba(239,68,68,0.10)',
      border: '1px solid rgba(239,68,68,0.4)', borderRadius: 8,
      color: '#EF4444', fontSize: 12, marginBottom: 14,
    }}>{msg}</div>
  )
}

function primaryBtn(busy: boolean): React.CSSProperties {
  return {
    padding: '10px 20px', borderRadius: 10, fontSize: 13, fontWeight: 700,
    background: busy ? '#7BAED4' : '#E8622A', border: 'none',
    color: 'white', cursor: busy ? 'wait' : 'pointer',
    fontFamily: 'Outfit, sans-serif',
  }
}

function ghostBtn(): React.CSSProperties {
  return {
    padding: '10px 20px', borderRadius: 10, fontSize: 13, fontWeight: 600,
    background: 'transparent', border: '1px solid rgba(255,255,255,0.15)',
    color: 'white', cursor: 'pointer', fontFamily: 'Outfit, sans-serif',
  }
}

function SuccessRow({ label, value, mono, badge }: { label: string; value: string; mono?: boolean; badge?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
      <span style={{ fontSize: 12, color: '#7BAED4' }}>{label}</span>
      {badge ? (
        <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 99, background: `${badge}22`, color: badge }}>{value}</span>
      ) : (
        <CopyableValue value={value} mono={mono} />
      )}
    </div>
  )
}

function CopyableValue({ value, mono }: { value: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false)
  if (!value) return <span style={{ fontSize: 12, color: '#5A8AB7' }}>—</span>
  return (
    <button
      onClick={async () => {
        try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch {}
      }}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        background: 'transparent', border: 'none', cursor: 'pointer',
        fontSize: 13, color: 'white', fontWeight: 600,
        fontFamily: mono ? 'monospace' : 'Outfit, sans-serif',
        padding: 0,
      }}
    >
      {value}
      <span style={{ fontSize: 10, color: copied ? '#22C55E' : '#7BAED4', fontFamily: 'Outfit, sans-serif', fontWeight: 700 }}>
        {copied ? '✓ COPIED' : 'COPY'}
      </span>
    </button>
  )
}
