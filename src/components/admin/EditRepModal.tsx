'use client'

// EditRepModal — Session 47.
//
// Admin-side editor for ALL fields on a sales rep / contractor record:
// name, email (touches auth.users), phone, notification_email,
// ABN, BSB, account number, status (active/inactive).
//
// Posts to /api/admin/contractors/[id]/profile. On email change, both
// the old and new addresses receive a "your login email was changed"
// notification email; admin gets a Telegram alert; admin_audit_log
// row is written with the diff.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { X, Save, AlertCircle, CheckCircle2 } from 'lucide-react'
import { isValidAbnFormat } from '@/lib/abn'

interface EditableFields {
  full_name: string
  email: string
  phone: string
  notification_email: string
  abn: string
  bank_bsb: string
  bank_account_number: string
  status: 'active' | 'inactive'
}

interface Props {
  contractorId: string
  initial: EditableFields
  /** Used in the modal header for context. */
  repDisplayName: string
  onClose: () => void
}

export default function EditRepModal({
  contractorId, initial, repDisplayName, onClose,
}: Props) {
  const router = useRouter()
  const [fullName, setFullName] = useState(initial.full_name)
  const [email, setEmail] = useState(initial.email)
  const [phone, setPhone] = useState(initial.phone)
  const [notificationEmail, setNotificationEmail] = useState(initial.notification_email)
  const [abn, setAbn] = useState(initial.abn)
  const [bsb, setBsb] = useState(initial.bank_bsb)
  const [account, setAccount] = useState(initial.bank_account_number)
  const [status, setStatus] = useState<'active' | 'inactive'>(initial.status)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const emailWillChange = email.trim().toLowerCase() !== initial.email.trim().toLowerCase()

  async function save() {
    setError(null); setSuccess(null); setSaving(true)

    // Client-side validation
    if (!fullName.trim()) {
      setError('Full name cannot be blank.')
      setSaving(false); return
    }
    if (!email.trim().includes('@')) {
      setError('Email must be a valid address.')
      setSaving(false); return
    }
    if (notificationEmail.trim() && !notificationEmail.includes('@')) {
      setError('Notification email looks wrong.')
      setSaving(false); return
    }
    if (abn.trim() && !isValidAbnFormat(abn.trim())) {
      setError('ABN must be a valid 11-digit Australian Business Number.')
      setSaving(false); return
    }

    const res = await fetch(`/api/admin/contractors/${contractorId}/profile`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: fullName.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim() || null,
        notification_email: notificationEmail.trim() || null,
        abn: abn.trim(),
        bank_bsb: bsb.trim() || null,
        bank_account_number: account.trim() || null,
        status,
      }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok || body?.ok === false) {
      setError(body?.error ?? 'Save failed.')
      setSaving(false)
      return
    }
    const changed = Array.isArray(body.changed) ? body.changed.length : 0
    setSuccess(
      changed === 0
        ? 'Nothing changed.'
        : `Saved ${changed} field${changed === 1 ? '' : 's'}.${emailWillChange ? ' Both old and new email addresses notified.' : ''}`
    )
    setSaving(false)
    // Refresh the page so the displayed values pick up the change.
    router.refresh()
  }

  return (
    <div style={backdrop}>
      <div style={modal}>
        <div style={header}>
          <div>
            <h2 style={title}>Edit Rep Profile</h2>
            <p style={subtitle}>{repDisplayName}</p>
          </div>
          <button onClick={onClose} style={closeBtn} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div style={body}>
          <Section heading="Identity">
            <Field label="Full legal name">
              <input value={fullName} onChange={e => setFullName(e.target.value)} style={inputStyle} />
            </Field>
            <Field
              label="Login email"
              hint={emailWillChange
                ? '⚠️ Changing this updates the rep\'s Supabase login email immediately. Both the old and new addresses will receive a notification email.'
                : 'Used by the rep to sign in. Touches auth.users.email.'
              }
            >
              <input value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} type="email" />
            </Field>
            <Field label="Phone">
              <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="0400 000 000" style={inputStyle} />
            </Field>
            <Field label="Reply-to email for proposals" hint="Where client replies to proposals are delivered. Optional.">
              <input value={notificationEmail} onChange={e => setNotificationEmail(e.target.value)} placeholder="you@example.com" style={inputStyle} type="email" />
            </Field>
          </Section>

          <Section heading="Tax & Banking">
            <Field label="ABN" hint="11 digits, ATO checksum. Leave blank to clear (admin only — withholding applies).">
              <input value={abn} onChange={e => setAbn(e.target.value)} placeholder="11 digit ABN" inputMode="numeric" maxLength={14} style={inputStyle} />
              {abn.trim().length > 0 && !isValidAbnFormat(abn.trim()) && (
                <p style={inlineWarning}>That doesn&apos;t look like a valid ABN.</p>
              )}
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
              <Field label="Bank BSB">
                <input value={bsb} onChange={e => setBsb(e.target.value)} placeholder="000-000" style={inputStyle} />
              </Field>
              <Field label="Account number">
                <input value={account} onChange={e => setAccount(e.target.value)} placeholder="Account number" style={inputStyle} />
              </Field>
            </div>
          </Section>

          <Section heading="Status">
            <Field label="Account status" hint="Inactive reps cannot access /sales/* but their rows + data are kept.">
              <select value={status} onChange={e => setStatus(e.target.value as 'active' | 'inactive')} style={inputStyle}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </Field>
          </Section>

          {error && (
            <div style={errorBox}>
              <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{error}</span>
            </div>
          )}
          {success && (
            <div style={successBox}>
              <CheckCircle2 size={14} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{success}</span>
            </div>
          )}
        </div>

        <div style={footer}>
          <button onClick={onClose} style={btnGhost} disabled={saving}>Cancel</button>
          <button onClick={save} style={btnPrimary} disabled={saving}>
            <Save size={14} />
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Section({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <h3 style={sectionTitle}>{heading}</h3>
      {children}
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', marginBottom: 12 }}>
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

const backdrop: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 300,
  background: 'rgba(6,19,34,0.75)', backdropFilter: 'blur(4px)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: 20, fontFamily: 'Outfit, sans-serif',
}

const modal: React.CSSProperties = {
  background: '#0A1E38', color: 'white',
  border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14,
  width: '100%', maxWidth: 560, maxHeight: '90vh',
  display: 'flex', flexDirection: 'column',
  boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
}

const header: React.CSSProperties = {
  display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
  padding: '20px 22px 14px',
  borderBottom: '1px solid rgba(255,255,255,0.06)',
}

const title: React.CSSProperties = {
  fontSize: 18, fontWeight: 800, margin: 0, letterSpacing: '-0.3px',
}

const subtitle: React.CSSProperties = {
  fontSize: 12, color: '#7BAED4', margin: 0, marginTop: 4,
}

const closeBtn: React.CSSProperties = {
  background: 'transparent', border: 'none', color: '#7BAED4',
  cursor: 'pointer', padding: 4, borderRadius: 6,
}

const body: React.CSSProperties = {
  padding: 22, overflowY: 'auto',
}

const sectionTitle: React.CSSProperties = {
  fontSize: 11, fontWeight: 800, color: '#E8622A',
  letterSpacing: '0.08em', textTransform: 'uppercase',
  margin: 0, marginBottom: 12,
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 8,
  background: '#061322', border: '1px solid rgba(255,255,255,0.08)',
  color: 'white', fontFamily: 'Outfit, sans-serif', fontSize: 13, outline: 'none',
  boxSizing: 'border-box',
}

const inlineWarning: React.CSSProperties = {
  marginTop: 6, fontSize: 11, color: '#fca5a5', lineHeight: 1.4,
}

const errorBox: React.CSSProperties = {
  display: 'flex', gap: 8, alignItems: 'flex-start',
  padding: '10px 14px', borderRadius: 9, marginBottom: 8,
  background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
  color: '#ef4444', fontSize: 13,
}

const successBox: React.CSSProperties = {
  display: 'flex', gap: 8, alignItems: 'flex-start',
  padding: '10px 14px', borderRadius: 9, marginBottom: 8,
  background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)',
  color: '#86efac', fontSize: 13,
}

const footer: React.CSSProperties = {
  display: 'flex', gap: 10, justifyContent: 'flex-end',
  padding: '14px 22px 20px',
  borderTop: '1px solid rgba(255,255,255,0.06)',
}

const btnPrimary: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '10px 18px', borderRadius: 9, border: 'none',
  background: '#E8622A', color: 'white',
  fontFamily: 'Outfit, sans-serif', fontSize: 13, fontWeight: 700,
  cursor: 'pointer',
}

const btnGhost: React.CSSProperties = {
  padding: '10px 16px', borderRadius: 9, cursor: 'pointer',
  background: 'transparent', color: '#7BAED4',
  border: '1px solid rgba(255,255,255,0.12)',
  fontFamily: 'Outfit, sans-serif', fontSize: 13, fontWeight: 600,
}
