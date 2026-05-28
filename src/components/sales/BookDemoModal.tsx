'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import ModalShell from './modal-shell'

interface Props {
  open: boolean
  onClose: () => void
  leadId: string
  defaultName: string
  defaultEmail: string
  onSuccess: () => void
}

type RepData = { demo_calendly_url: string | null } | null

function translateError(code: string): string {
  switch (code) {
    case 'no_calendly_url': return 'Add your Calendly link in Profile first.'
    case 'invalid_email': return 'Please enter a valid email address.'
    case 'not_assigned_to_you': return 'This lead is not assigned to you.'
    default: return 'Something went wrong - please try again.'
  }
}

export default function BookDemoModal({
  open,
  onClose,
  leadId,
  defaultName,
  defaultEmail,
  onSuccess,
}: Props) {
  const [repData, setRepData] = useState<RepData>(null)
  const [loadingRep, setLoadingRep] = useState(false)
  const [name, setName] = useState(defaultName)
  const [email, setEmail] = useState(defaultEmail)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch rep data when modal opens
  useEffect(() => {
    if (!open) return
    setName(defaultName)
    setEmail(defaultEmail)
    setError(null)
    setLoadingRep(true)
    fetch('/api/sales/me')
      .then(r => r.ok ? r.json() : Promise.reject(r))
      .then(data => {
        setRepData({ demo_calendly_url: data.rep?.demo_calendly_url ?? null })
      })
      .catch(() => {
        setRepData({ demo_calendly_url: null })
      })
      .finally(() => setLoadingRep(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!open) return null

  const hasCalendly = Boolean(repData?.demo_calendly_url)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/sales/leads/${leadId}/book-demo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prospect_name: name, prospect_email: email }),
      })
      const body = await res.json().catch(() => ({}))
      if (res.ok) {
        onSuccess()
      } else {
        setError(translateError(body?.error ?? ''))
      }
    } catch {
      setError('Something went wrong - please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // Loading state
  if (loadingRep) {
    return (
      <ModalShell title="Send Demo Invite" onClose={onClose}>
        <div style={{ padding: '24px 0', textAlign: 'center', color: '#7BAED4', fontSize: 14 }}>
          Loading...
        </div>
      </ModalShell>
    )
  }

  // State A: no Calendly URL
  if (!hasCalendly) {
    return (
      <ModalShell title="Add your Calendly link first" onClose={onClose}>
        <p style={{ fontSize: 14, color: '#7BAED4', marginBottom: 22 }}>
          You need to add your Calendly booking link before you can send demo invites.
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={cancelBtn}>Cancel</button>
          <Link
            href="/sales/profile"
            style={{
              flex: 1, padding: '12px 16px', borderRadius: 9,
              background: '#E8622A', color: 'white',
              fontFamily: 'Outfit, sans-serif', fontSize: 14, fontWeight: 700,
              textDecoration: 'none', textAlign: 'center',
              display: 'inline-block',
            }}
          >Go to Profile</Link>
        </div>
      </ModalShell>
    )
  }

  // State B: has Calendly URL
  return (
    <ModalShell title="Send Demo Invite" onClose={onClose}>
      <form onSubmit={submit}>
        <div style={{ marginBottom: 14 }}>
          <Label>Prospect Name</Label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            required
            style={inputStyle}
            placeholder="Contact name"
          />
        </div>

        <div style={{ marginBottom: 20 }}>
          <Label>Prospect Email</Label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            style={inputStyle}
            placeholder="email@example.com"
          />
          <div style={{ fontSize: 12, color: '#7BAED4', marginTop: 5 }}>
            We will send them your Calendly booking link so they can pick a time.
          </div>
        </div>

        {error && (
          <div style={{
            marginBottom: 14, padding: '8px 12px', borderRadius: 8,
            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
            color: '#ef4444', fontSize: 13,
          }}>{error}</div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" onClick={onClose} style={cancelBtn}>Cancel</button>
          <button
            type="submit"
            disabled={submitting}
            style={{
              flex: 1, padding: '12px 16px', borderRadius: 9, border: 'none',
              background: submitting ? '#4a5060' : '#E8622A',
              color: 'white', fontFamily: 'Outfit, sans-serif',
              fontSize: 14, fontWeight: 700,
              cursor: submitting ? 'not-allowed' : 'pointer',
            }}
          >
            {submitting ? 'Sending...' : 'Send Invite'}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 700, color: '#7BAED4',
      textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 7,
    }}>{children}</div>
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
