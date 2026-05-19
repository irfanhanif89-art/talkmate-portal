'use client'

import { useState, useMemo, useEffect } from 'react'
import Link from 'next/link'
import { CheckCircle2 } from 'lucide-react'

export interface ApprovedDeal {
  id: string
  business_name: string
  contact_name: string | null
  phone: string | null
  email: string | null
  industry: string | null
  suburb: string | null
  state: string | null
  website: string | null
  won_plan: 'starter' | 'growth' | 'pro' | null
}

interface OnboardResult {
  business_id: string
  user_id: string
  client_email: string
}

export default function OnboardForm({ deals }: { deals: ApprovedDeal[] }) {
  const [selectedId, setSelectedId] = useState<string>('')
  const [businessName, setBusinessName] = useState('')
  const [industry, setIndustry] = useState('')
  const [abn, setAbn] = useState('')
  const [address, setAddress] = useState('')
  const [website, setWebsite] = useState('')

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [preferred, setPreferred] = useState<'phone' | 'email'>('phone')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<OnboardResult | null>(null)

  const selectedDeal = useMemo(() => deals.find(d => d.id === selectedId) ?? null, [deals, selectedId])

  // When a deal is selected, prefill fields from the lead.
  useEffect(() => {
    if (!selectedDeal) return
    setBusinessName(selectedDeal.business_name ?? '')
    setIndustry(selectedDeal.industry ?? '')
    setWebsite(selectedDeal.website ?? '')
    setAddress([selectedDeal.suburb, selectedDeal.state].filter(Boolean).join(', '))
    const contact = selectedDeal.contact_name ?? ''
    const [fn, ...rest] = contact.split(' ')
    setFirstName(fn ?? '')
    setLastName(rest.join(' '))
    setEmail(selectedDeal.email ?? '')
    setPhone(selectedDeal.phone ?? '')
  }, [selectedDeal])

  async function submit() {
    if (!selectedId) { setError('Pick an approved deal first.'); return }
    if (!businessName.trim()) { setError('Business name is required.'); return }
    if (!firstName.trim() || !lastName.trim()) { setError('First and last name are required.'); return }
    if (!email.trim() || !email.includes('@')) { setError('A valid client email is required.'); return }
    if (!phone.trim()) { setError('Client phone is required.'); return }

    setSubmitting(true); setError(null)
    const res = await fetch('/api/sales/onboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lead_id: selectedId,
        business_name: businessName.trim(),
        industry: industry.trim() || null,
        abn: abn.trim() || null,
        address: address.trim() || null,
        website: website.trim() || null,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
        preferred_contact: preferred,
      }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setError(body?.error ?? 'Onboarding failed. Please try again or contact admin.')
      setSubmitting(false)
      return
    }
    const body = await res.json()
    setSuccess({ business_id: body.business_id, user_id: body.user_id, client_email: email.trim().toLowerCase() })
    setSubmitting(false)
  }

  if (success) {
    return (
      <div style={{
        background: '#0A1E38', border: '1px solid rgba(34,197,94,0.3)',
        borderRadius: 14, padding: 30, textAlign: 'center',
      }}>
        <CheckCircle2 size={42} color="#22c55e" style={{ marginBottom: 14 }} />
        <h2 style={{ fontSize: 20, fontWeight: 800, color: 'white', margin: 0, marginBottom: 6 }}>
          Client onboarded!
        </h2>
        <p style={{ fontSize: 14, color: '#7BAED4', margin: 0, marginBottom: 18, lineHeight: 1.6 }}>
          The client account has been created. They'll receive a welcome email at:
        </p>
        <div style={{
          display: 'inline-block', padding: '8px 14px', borderRadius: 8,
          background: 'rgba(74,159,232,0.12)', color: '#4A9FE8',
          fontFamily: 'monospace', fontSize: 13, marginBottom: 22,
        }}>{success.client_email}</div>
        <div>
          <Link href="/sales/clients" style={{ color: '#E8622A', fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>
            View my clients →
          </Link>
        </div>
      </div>
    )
  }

  if (deals.length === 0) {
    return (
      <div style={{
        padding: 36, borderRadius: 12,
        background: '#0A1E38', border: '1px dashed rgba(255,255,255,0.1)',
        textAlign: 'center',
      }}>
        <h2 style={{ fontSize: 17, fontWeight: 700, color: 'white', margin: 0, marginBottom: 8 }}>
          No approved deals to onboard yet
        </h2>
        <p style={{ fontSize: 13, color: '#7BAED4', margin: 0, lineHeight: 1.6 }}>
          Once admin approves one of your won deals, it'll show up here ready to onboard.
        </p>
        <Link href="/sales/leads" style={{ display: 'inline-block', marginTop: 18, color: '#E8622A', fontWeight: 700, fontSize: 13, textDecoration: 'none' }}>
          ← Back to pipeline
        </Link>
      </div>
    )
  }

  return (
    <div style={{
      background: '#0A1E38', border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 14, padding: 24, maxWidth: 720,
    }}>
      <Label>Select approved deal to onboard</Label>
      <select
        value={selectedId}
        onChange={e => setSelectedId(e.target.value)}
        style={{ ...inputStyle, marginBottom: 22 }}
      >
        <option value="">Choose…</option>
        {deals.map(d => (
          <option key={d.id} value={d.id}>
            {d.business_name} — {d.won_plan ?? 'plan TBD'}
          </option>
        ))}
      </select>

      {selectedDeal && (
        <>
          <SectionHeader title="Business details" />
          <div style={grid2}>
            <Field label="Business name *">
              <input value={businessName} onChange={e => setBusinessName(e.target.value)} style={inputStyle} />
            </Field>
            <Field label="Industry">
              <input value={industry} onChange={e => setIndustry(e.target.value)} style={inputStyle} placeholder="e.g. towing, restaurant" />
            </Field>
            <Field label="ABN">
              <input value={abn} onChange={e => setAbn(e.target.value)} style={inputStyle} />
            </Field>
            <Field label="Website">
              <input value={website} onChange={e => setWebsite(e.target.value)} style={inputStyle} />
            </Field>
            <Field label="Address" full>
              <input value={address} onChange={e => setAddress(e.target.value)} style={inputStyle} />
            </Field>
          </div>

          <SectionHeader title="Client contact" />
          <div style={grid2}>
            <Field label="First name *">
              <input value={firstName} onChange={e => setFirstName(e.target.value)} style={inputStyle} />
            </Field>
            <Field label="Last name *">
              <input value={lastName} onChange={e => setLastName(e.target.value)} style={inputStyle} />
            </Field>
            <Field label="Email *">
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} />
            </Field>
            <Field label="Phone *">
              <input value={phone} onChange={e => setPhone(e.target.value)} style={inputStyle} />
            </Field>
            <Field label="Preferred contact method" full>
              <div style={{ display: 'flex', gap: 8 }}>
                {(['phone', 'email'] as const).map(p => (
                  <button
                    key={p}
                    onClick={() => setPreferred(p)}
                    style={{
                      flex: 1, padding: '10px', borderRadius: 8, cursor: 'pointer',
                      background: preferred === p ? '#E8622A' : '#061322',
                      color: preferred === p ? 'white' : '#7BAED4',
                      border: preferred === p ? '1px solid #E8622A' : '1px solid rgba(255,255,255,0.08)',
                      fontFamily: 'Outfit, sans-serif', fontSize: 13, fontWeight: 700,
                      textTransform: 'capitalize',
                    }}
                  >{p}</button>
                ))}
              </div>
            </Field>
          </div>

          {error && (
            <div style={{ marginTop: 8, marginBottom: 14, color: '#ef4444', fontSize: 13, padding: '10px 14px', borderRadius: 9, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)' }}>{error}</div>
          )}

          <button
            onClick={submit}
            disabled={submitting}
            style={{
              width: '100%', padding: '14px', borderRadius: 10, border: 'none',
              background: submitting ? '#7B3A1A' : '#E8622A',
              color: 'white', fontFamily: 'Outfit, sans-serif', fontSize: 15, fontWeight: 700,
              cursor: submitting ? 'not-allowed' : 'pointer', marginTop: 16,
            }}
          >
            {submitting ? 'Creating client account…' : 'Create Client Account →'}
          </button>
        </>
      )}
    </div>
  )
}

function SectionHeader({ title }: { title: string }) {
  return (
    <h3 style={{
      fontSize: 12, fontWeight: 800, color: '#E8622A', textTransform: 'uppercase',
      letterSpacing: '0.08em', margin: 0, marginTop: 8, marginBottom: 12,
    }}>{title}</h3>
  )
}
function Label({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 11, fontWeight: 700, color: '#7BAED4', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 7 }}>{children}</div>
}
function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, gridColumn: full ? '1 / -1' : 'auto' }}>
      <span style={{ fontSize: 11, color: '#7BAED4', fontWeight: 600 }}>{label}</span>
      {children}
    </label>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 8,
  background: '#061322', border: '1px solid rgba(255,255,255,0.08)',
  color: 'white', fontSize: 13, outline: 'none', fontFamily: 'Outfit, sans-serif',
}
const grid2: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
  gap: 12, marginBottom: 16,
}
