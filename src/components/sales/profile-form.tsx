'use client'

import { useState } from 'react'
import { CheckCircle2, AlertCircle } from 'lucide-react'
import { isValidAbnFormat } from '@/lib/abn'

interface Props {
  initialFullName: string
  initialEmail: string
  initialPhone: string
  initialNotificationEmail: string
  initialAbn: string
  initialBsb: string
  initialAccount: string
  /** Whether the rep has a contractor record. Banking section is only
   *  shown for contractor-flow reps; legacy manual reps don't have
   *  these fields. */
  hasContractor: boolean
}

export default function ProfileForm({
  initialFullName, initialEmail, initialPhone, initialNotificationEmail,
  initialAbn, initialBsb, initialAccount, hasContractor,
}: Props) {
  const [fullName, setFullName] = useState(initialFullName)
  const [phone, setPhone] = useState(initialPhone)
  const [notificationEmail, setNotificationEmail] = useState(initialNotificationEmail)
  const [abn, setAbn] = useState(initialAbn)
  const [bsb, setBsb] = useState(initialBsb)
  const [account, setAccount] = useState(initialAccount)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function clearMsg() {
    setSaved(false)
    setError(null)
  }

  async function save() {
    setSaving(true); setSaved(false); setError(null)

    // Client-side validation
    if (!fullName.trim()) {
      setError('Full name is required.')
      setSaving(false)
      return
    }
    const trimmedNotif = notificationEmail.trim()
    if (trimmedNotif && !trimmedNotif.includes('@')) {
      setError('Reply-to email looks wrong. Use a real address or leave it blank.')
      setSaving(false)
      return
    }
    if (hasContractor && abn.trim() && !isValidAbnFormat(abn.trim())) {
      setError('ABN must be a valid 11-digit Australian Business Number.')
      setSaving(false)
      return
    }

    const body: Record<string, string | null> = {
      full_name: fullName.trim(),
      phone: phone.trim() || null,
      notification_email: trimmedNotif || null,
    }
    if (hasContractor) {
      body.abn = abn.trim()
      body.bank_bsb = bsb.trim() || null
      body.bank_account_number = account.trim() || null
    }

    const res = await fetch('/api/sales/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const respBody = await res.json().catch(() => ({}))
      setError(respBody?.error ?? 'Could not save.')
      setSaving(false)
      return
    }
    setSaved(true)
    setSaving(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Identity section */}
      <div style={card}>
        <h2 style={cardTitle}>Identity</h2>
        <p style={cardHint}>
          Changes here are saved immediately and admin is notified.
        </p>

        <Field label="Full legal name">
          <input
            value={fullName}
            onChange={e => { setFullName(e.target.value); clearMsg() }}
            placeholder="Your full name"
            style={inputStyle}
          />
        </Field>

        <Field label="Login email" hint="Email is managed by admin. Contact hello@talkmate.com.au to change.">
          <input
            value={initialEmail}
            readOnly
            style={{ ...inputStyle, opacity: 0.6, cursor: 'not-allowed' }}
          />
        </Field>

        <Field label="Phone number">
          <input
            value={phone}
            onChange={e => { setPhone(e.target.value); clearMsg() }}
            placeholder="0400 000 000"
            style={inputStyle}
          />
        </Field>

        <Field label="Reply-to email for proposals" hint="When clients reply to your proposal email, their reply goes here. Use your personal or work email.">
          <input
            type="email"
            value={notificationEmail}
            onChange={e => { setNotificationEmail(e.target.value); clearMsg() }}
            placeholder="you@example.com"
            style={inputStyle}
          />
        </Field>
      </div>

      {/* Tax + Banking section — contractor-flow reps only */}
      {hasContractor && (
        <div style={card}>
          <h2 style={cardTitle}>Tax &amp; Banking</h2>
          <p style={cardHint}>
            These details are used for commission payouts. Admin is alerted on every change so the payment trail stays clean.
          </p>

          <Field label="ABN (Australian Business Number)" hint="11 digits, must pass the ATO checksum.">
            <input
              value={abn}
              onChange={e => { setAbn(e.target.value); clearMsg() }}
              placeholder="11 digit ABN"
              inputMode="numeric"
              maxLength={14}
              style={inputStyle}
            />
            {abn.trim().length > 0 && !isValidAbnFormat(abn.trim()) && (
              <p style={inlineWarning}>
                That doesn&apos;t look like a valid ABN. Double-check the 11 digits and the checksum.
              </p>
            )}
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
            <Field label="Bank BSB">
              <input
                value={bsb}
                onChange={e => { setBsb(e.target.value); clearMsg() }}
                placeholder="000-000"
                style={inputStyle}
              />
            </Field>
            <Field label="Account number">
              <input
                value={account}
                onChange={e => { setAccount(e.target.value); clearMsg() }}
                placeholder="Account number"
                style={inputStyle}
              />
            </Field>
          </div>
        </div>
      )}

      {error && (
        <div style={errorBox}>
          <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{error}</span>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <button
          onClick={save}
          disabled={saving}
          style={{
            padding: '11px 20px', borderRadius: 9, border: 'none',
            background: saving ? '#7B3A1A' : '#E8622A',
            color: 'white', fontFamily: 'Outfit, sans-serif',
            fontSize: 13, fontWeight: 700,
            cursor: saving ? 'not-allowed' : 'pointer',
          }}
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
        {saved && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: '#22c55e', fontWeight: 600 }}>
            <CheckCircle2 size={14} /> Saved
          </span>
        )}
      </div>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', marginBottom: 14 }}>
      <span style={{ display: 'block', fontSize: 12, color: '#7BAED4', fontWeight: 600, marginBottom: 6 }}>
        {label}
      </span>
      {children}
      {hint && (
        <span style={{ display: 'block', marginTop: 6, fontSize: 11, color: '#4A7FBB', lineHeight: 1.5 }}>
          {hint}
        </span>
      )}
    </label>
  )
}

const card: React.CSSProperties = {
  background: '#0A1E38',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: 12,
  padding: 22,
}

const cardTitle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  color: 'white',
  margin: 0,
  marginBottom: 6,
}

const cardHint: React.CSSProperties = {
  fontSize: 12,
  color: '#7BAED4',
  margin: 0,
  marginBottom: 18,
  lineHeight: 1.55,
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 8,
  background: '#061322', border: '1px solid rgba(255,255,255,0.08)',
  color: 'white', fontFamily: 'Outfit, sans-serif', fontSize: 13, outline: 'none',
  boxSizing: 'border-box',
}

const inlineWarning: React.CSSProperties = {
  marginTop: 6,
  fontSize: 11,
  color: '#fca5a5',
  lineHeight: 1.4,
}

const errorBox: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  alignItems: 'flex-start',
  padding: '10px 14px',
  borderRadius: 9,
  background: 'rgba(239,68,68,0.1)',
  border: '1px solid rgba(239,68,68,0.25)',
  color: '#ef4444',
  fontSize: 13,
}
