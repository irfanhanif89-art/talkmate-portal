'use client'

import { useState } from 'react'
import type { LeadRow } from './leads-board'

// Session 27 (H22) — sales rep self-serve lead creation.
//
// Submit POSTs to /api/sales/leads. Required fields: business name, contact
// name, contact phone. Optional: email, industry, suburb, state, website,
// source, notes. The API enforces the rep_id from the session — we never
// pass it in the body.

interface Props {
  onClose: () => void
  onCreated: (lead: LeadRow) => void
}

const SOURCE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Select source…' },
  { value: 'cold_call', label: 'Cold call' },
  { value: 'referral', label: 'Referral' },
  { value: 'walk_in', label: 'Walk-in' },
  { value: 'online', label: 'Online' },
  { value: 'other', label: 'Other' },
]

const INDUSTRY_OPTIONS = [
  '', 'Restaurants', 'Towing', 'Trades', 'Mechanic', 'Dental',
  'Medispa', 'Real Estate', 'Healthcare', 'Physio',
  'Accounting', 'Cleaning', 'Pest', 'Landscaping',
]

export default function AddLeadModal({ onClose, onCreated }: Props) {
  const [businessName, setBusinessName] = useState('')
  const [contactName, setContactName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [industry, setIndustry] = useState('')
  const [source, setSource] = useState('')
  const [suburb, setSuburb] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = businessName.trim().length > 0
    && contactName.trim().length > 0
    && phone.trim().length > 0
    && !saving

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/sales/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_name: businessName.trim(),
          contact_name: contactName.trim(),
          phone: phone.trim(),
          email: email.trim() || undefined,
          industry: industry || undefined,
          suburb: suburb.trim() || undefined,
          source: source || undefined,
          notes: notes.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setError(data.error ?? 'Could not create lead')
        setSaving(false)
        return
      }
      onCreated(data.lead as LeadRow)
      onClose()
    } catch (err) {
      setError((err as Error).message)
      setSaving(false)
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <form
        onClick={e => e.stopPropagation()}
        onSubmit={submit}
        style={{
          width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto',
          background: '#0A1E38', borderRadius: 16, padding: 24,
          border: '1px solid rgba(255,255,255,0.08)',
          fontFamily: 'Outfit, sans-serif', color: 'white',
        }}
      >
        <h2 style={{ fontSize: 18, fontWeight: 800, margin: '0 0 4px 0' }}>Add a new lead</h2>
        <p style={{ fontSize: 13, color: '#7BAED4', margin: '0 0 20px 0' }}>
          Capture a business you want to pitch. It lands in your pipeline as a new lead.
        </p>

        <Row label="Business name" required>
          <Input value={businessName} onChange={setBusinessName} placeholder="Joe's Towing" autoFocus />
        </Row>
        <Row label="Contact name" required>
          <Input value={contactName} onChange={setContactName} placeholder="Joe Bloggs" />
        </Row>
        <Row label="Contact phone" required>
          <Input value={phone} onChange={setPhone} placeholder="+61 4XX XXX XXX" type="tel" />
        </Row>
        <Row label="Contact email">
          <Input value={email} onChange={setEmail} placeholder="joe@example.com.au" type="email" />
        </Row>
        <Row label="Industry">
          <select
            value={industry}
            onChange={e => setIndustry(e.target.value)}
            style={inputStyle}
          >
            {INDUSTRY_OPTIONS.map(i => (
              <option key={i} value={i.toLowerCase()}>{i || 'Choose industry…'}</option>
            ))}
          </select>
        </Row>
        <Row label="Source">
          <select
            value={source}
            onChange={e => setSource(e.target.value)}
            style={inputStyle}
          >
            {SOURCE_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </Row>
        <Row label="Suburb">
          <Input value={suburb} onChange={setSuburb} placeholder="Burleigh Heads" />
        </Row>
        <Row label="Notes">
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={3}
            placeholder="What did you observe? Any specific pain point?"
            style={{ ...inputStyle, resize: 'vertical', minHeight: 64 }}
          />
        </Row>

        {error && (
          <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(239,68,68,0.1)', color: '#ef4444', fontSize: 13, marginBottom: 14 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            style={{
              padding: '11px 18px', borderRadius: 9, cursor: 'pointer',
              background: 'transparent', color: '#7BAED4',
              border: '1px solid rgba(255,255,255,0.12)',
              fontFamily: 'Outfit, sans-serif', fontSize: 14, fontWeight: 600,
            }}
          >Cancel</button>
          <button
            type="submit"
            disabled={!canSubmit}
            style={{
              padding: '11px 22px', borderRadius: 9,
              cursor: canSubmit ? 'pointer' : 'not-allowed',
              background: '#E8622A', color: 'white', border: 'none',
              fontFamily: 'Outfit, sans-serif', fontSize: 14, fontWeight: 700,
              opacity: canSubmit ? 1 : 0.55,
            }}
          >{saving ? 'Adding…' : 'Add Lead'}</button>
        </div>
      </form>
    </div>
  )
}

function Row({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: 11, color: '#4A7FBB', fontWeight: 700, marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label} {required ? <span style={{ color: '#E8622A' }}>*</span> : null}
      </label>
      {children}
    </div>
  )
}

function Input({ value, onChange, placeholder, type, autoFocus }: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
  autoFocus?: boolean
}) {
  return (
    <input
      autoFocus={autoFocus}
      type={type ?? 'text'}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={inputStyle}
    />
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '11px 14px', borderRadius: 9,
  background: '#071829', border: '1px solid rgba(255,255,255,0.1)',
  color: 'white', fontFamily: 'Outfit, sans-serif', fontSize: 14, outline: 'none',
  boxSizing: 'border-box',
}
