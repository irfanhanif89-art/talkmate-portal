'use client'

// Session 4A (Round 1) — pre-launch announcement page.
// The owner copies a pre-written SMS or email and sends it from their own
// phone/email to their own customers. This page NEVER bulk-sends.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

const ORANGE = '#E8622A'
const PANEL_BG = '#0B1F35'
const INPUT_BG = '#071829'
const BORDER = '1px solid rgba(255,255,255,0.1)'
const LABEL_BLUE = '#4A7FBB'
const FONT = 'Outfit, sans-serif'

interface EmailTemplate {
  subject: string
  body: string
}

interface AnnouncementData {
  sms: string
  email: EmailTemplate
  businessName: string
  agentName: string
}

type Tab = 'sms' | 'email'

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  color: LABEL_BLUE,
  fontWeight: 600,
}

const primaryButtonStyle: React.CSSProperties = {
  padding: '10px 18px',
  borderRadius: 10,
  background: ORANGE,
  color: 'white',
  border: 'none',
  fontSize: 14,
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'inherit',
}

const secondaryButtonStyle: React.CSSProperties = {
  padding: '10px 18px',
  borderRadius: 10,
  background: 'transparent',
  color: '#C8D8EA',
  border: BORDER,
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
}

const textareaStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: 10,
  background: INPUT_BG,
  border: BORDER,
  color: 'white',
  fontSize: 14,
  lineHeight: 1.55,
  fontFamily: 'inherit',
  outline: 'none',
  resize: 'vertical',
  boxSizing: 'border-box',
}

const inputStyle: React.CSSProperties = {
  ...textareaStyle,
  resize: undefined,
}

export default function AnnouncementPage() {
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [data, setData] = useState<AnnouncementData | null>(null)

  const [tab, setTab] = useState<Tab>('sms')

  // Editable copies of the templates.
  const [sms, setSms] = useState('')
  const [emailSubject, setEmailSubject] = useState('')
  const [emailBody, setEmailBody] = useState('')

  const [smsEditing, setSmsEditing] = useState(false)
  const [emailEditing, setEmailEditing] = useState(false)

  const [smsCopied, setSmsCopied] = useState(false)
  const [emailCopied, setEmailCopied] = useState(false)

  const [submitting, setSubmitting] = useState(false)
  const [showSkipConfirm, setShowSkipConfirm] = useState(false)

  // ─────────── load ───────────

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setLoadError(null)
      try {
        const r = await fetch('/api/onboarding/announcement')
        const d = await r.json().catch(() => ({} as Record<string, unknown>))
        if (!r.ok) {
          if (!cancelled) {
            setLoadError(typeof d.error === 'string' ? d.error : 'We could not load your templates. Please try again.')
          }
          return
        }
        const payload = d as Partial<AnnouncementData>
        if (!payload.sms || !payload.email) {
          if (!cancelled) setLoadError('We could not load your templates. Please try again.')
          return
        }
        if (cancelled) return
        const announcement: AnnouncementData = {
          sms: payload.sms,
          email: { subject: payload.email.subject ?? '', body: payload.email.body ?? '' },
          businessName: payload.businessName ?? '',
          agentName: payload.agentName ?? '',
        }
        setData(announcement)
        setSms(announcement.sms)
        setEmailSubject(announcement.email.subject)
        setEmailBody(announcement.email.body)
      } catch (e) {
        if (!cancelled) setLoadError((e as Error).message || 'We could not load your templates. Please try again.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [])

  // ─────────── helpers ───────────

  const copyToClipboard = useCallback(async (text: string, which: Tab) => {
    try {
      await navigator.clipboard.writeText(text)
      if (which === 'sms') {
        setSmsCopied(true)
        setTimeout(() => setSmsCopied(false), 2500)
      } else {
        setEmailCopied(true)
        setTimeout(() => setEmailCopied(false), 2500)
      }
    } catch {
      // Clipboard can be blocked (permissions / insecure context). Fail quietly;
      // the text is still visible and selectable for a manual copy.
    }
  }, [])

  const mailtoHref = useMemo(() => {
    const subject = encodeURIComponent(emailSubject)
    const body = encodeURIComponent(emailBody)
    return `mailto:?subject=${subject}&body=${body}`
  }, [emailSubject, emailBody])

  async function markSentAndContinue() {
    if (submitting) return
    setSubmitting(true)
    try {
      await fetch('/api/onboarding/announcement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sent: true }),
      })
    } catch {
      // Even if the POST fails we still move the owner forward; the gate can be
      // re-satisfied later. Do not trap them on this screen.
    } finally {
      router.push('/onboarding')
    }
  }

  async function dismissAndContinue() {
    if (submitting) return
    setSubmitting(true)
    try {
      await fetch('/api/onboarding/announcement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dismissed: true, reason: 'user_dismissed' }),
      })
    } catch {
      // ignore — proceed regardless
    } finally {
      router.push('/onboarding')
    }
  }

  // ─────────── render: loading / error ───────────

  if (loading) {
    return (
      <Shell>
        <div style={{
          padding: 40, textAlign: 'center', color: '#7BAED4',
          fontSize: 14, border: BORDER, borderRadius: 14, background: PANEL_BG,
        }}>
          Loading your templates...
        </div>
      </Shell>
    )
  }

  if (loadError || !data) {
    return (
      <Shell>
        <div style={{
          padding: 32, textAlign: 'center',
          border: '1px solid rgba(239,68,68,0.25)', borderRadius: 14,
          background: 'rgba(239,68,68,0.06)',
        }}>
          <div style={{ color: '#FCA5A5', fontSize: 14, marginBottom: 16 }}>
            {loadError || 'We could not load your templates. Please try again.'}
          </div>
          <button
            type="button"
            onClick={() => router.refresh()}
            style={primaryButtonStyle}
          >
            Try again
          </button>
        </div>
      </Shell>
    )
  }

  const smsCharCount = sms.length

  // ─────────── render: main ───────────

  return (
    <Shell>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: 'white', margin: 0, fontFamily: 'inherit' }}>
        Let your customers know
      </h1>
      <p style={{ fontSize: 14, color: '#7BAED4', marginTop: 8, marginBottom: 6, lineHeight: 1.55 }}>
        Send a quick message before TalkMate goes live. Customers who are warned are customers who aren&apos;t confused.
      </p>
      <p style={{ fontSize: 13, color: LABEL_BLUE, marginTop: 0, marginBottom: 24, fontWeight: 600 }}>
        Clients who send this have fewer confused first-time callers.
      </p>

      {/* Tab toggle */}
      <div style={{
        display: 'inline-flex', gap: 4, padding: 4, marginBottom: 20,
        background: INPUT_BG, border: BORDER, borderRadius: 12,
      }}>
        {(['sms', 'email'] as Tab[]).map(t => {
          const active = t === tab
          return (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              style={{
                padding: '8px 22px', borderRadius: 9, border: 'none',
                background: active ? ORANGE : 'transparent',
                color: active ? 'white' : '#7BAED4',
                fontSize: 13, fontWeight: 700, cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {t === 'sms' ? 'SMS' : 'Email'}
            </button>
          )
        })}
      </div>

      {/* SMS card */}
      {tab === 'sms' && (
        <section style={{
          background: PANEL_BG, border: BORDER, borderRadius: 14, padding: 20,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={labelStyle}>SMS MESSAGE</span>
            <button
              type="button"
              onClick={() => setSmsEditing(v => !v)}
              style={{
                background: 'transparent', border: 'none', color: ORANGE,
                fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                padding: 0,
              }}
            >
              {smsEditing ? 'Done' : 'Edit'}
            </button>
          </div>

          <textarea
            value={sms}
            onChange={e => setSms(e.target.value)}
            readOnly={!smsEditing}
            rows={6}
            style={{
              ...textareaStyle,
              opacity: smsEditing ? 1 : 0.95,
              cursor: smsEditing ? 'text' : 'default',
            }}
          />

          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginTop: 10, gap: 12, flexWrap: 'wrap',
          }}>
            <span style={{ fontSize: 12, color: '#7BAED4' }}>{smsCharCount} characters</span>
            <button
              type="button"
              onClick={() => copyToClipboard(sms, 'sms')}
              style={primaryButtonStyle}
            >
              {smsCopied ? 'Copied' : 'Copy message'}
            </button>
          </div>

          <p style={{ fontSize: 13, color: '#7BAED4', marginTop: 16, marginBottom: 0, lineHeight: 1.55 }}>
            Copy this message and send it from your own phone to your regular customers.
          </p>
        </section>
      )}

      {/* Email card */}
      {tab === 'email' && (
        <section style={{
          background: PANEL_BG, border: BORDER, borderRadius: 14, padding: 20,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={labelStyle}>EMAIL TEMPLATE</span>
            <button
              type="button"
              onClick={() => setEmailEditing(v => !v)}
              style={{
                background: 'transparent', border: 'none', color: ORANGE,
                fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                padding: 0,
              }}
            >
              {emailEditing ? 'Done' : 'Edit'}
            </button>
          </div>

          <label style={{ ...labelStyle, display: 'block', marginBottom: 6 }}>Subject</label>
          <input
            type="text"
            value={emailSubject}
            onChange={e => setEmailSubject(e.target.value)}
            readOnly={!emailEditing}
            style={{
              ...inputStyle,
              marginBottom: 14,
              cursor: emailEditing ? 'text' : 'default',
            }}
          />

          <label style={{ ...labelStyle, display: 'block', marginBottom: 6 }}>Message</label>
          <textarea
            value={emailBody}
            onChange={e => setEmailBody(e.target.value)}
            readOnly={!emailEditing}
            rows={12}
            style={{
              ...textareaStyle,
              cursor: emailEditing ? 'text' : 'default',
            }}
          />

          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            marginTop: 14, flexWrap: 'wrap',
          }}>
            <button
              type="button"
              onClick={() => copyToClipboard(`${emailSubject}\n\n${emailBody}`, 'email')}
              style={primaryButtonStyle}
            >
              {emailCopied ? 'Copied' : 'Copy to clipboard'}
            </button>
            <a
              href={mailtoHref}
              style={{ ...secondaryButtonStyle, textDecoration: 'none', display: 'inline-block' }}
            >
              Open in email client
            </a>
          </div>

          <p style={{ fontSize: 13, color: '#7BAED4', marginTop: 16, marginBottom: 0, lineHeight: 1.55 }}>
            Copy this message and send it from your own email to your regular customers.
          </p>
        </section>
      )}

      {/* Bottom actions */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        marginTop: 28, flexWrap: 'wrap',
      }}>
        <button
          type="button"
          onClick={markSentAndContinue}
          disabled={submitting}
          style={{ ...primaryButtonStyle, opacity: submitting ? 0.5 : 1 }}
        >
          I&apos;ve already sent this
        </button>
        <button
          type="button"
          onClick={() => setShowSkipConfirm(true)}
          disabled={submitting}
          style={{ ...secondaryButtonStyle, opacity: submitting ? 0.5 : 1 }}
        >
          Skip this step
        </button>
      </div>

      {/* Skip confirm dialog */}
      {showSkipConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed', inset: 0, zIndex: 50,
            background: 'rgba(3,10,20,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 20,
          }}
          onClick={() => setShowSkipConfirm(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 420,
              background: PANEL_BG, border: BORDER, borderRadius: 14,
              padding: 24,
            }}
          >
            <h2 style={{ fontSize: 18, fontWeight: 800, color: 'white', margin: 0 }}>
              Are you sure?
            </h2>
            <p style={{ fontSize: 14, color: '#7BAED4', marginTop: 10, marginBottom: 22, lineHeight: 1.55 }}>
              Regular customers sometimes get confused when they hear a new voice.
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setShowSkipConfirm(false)}
                disabled={submitting}
                style={{ ...secondaryButtonStyle, opacity: submitting ? 0.5 : 1 }}
              >
                Go back
              </button>
              <button
                type="button"
                onClick={dismissAndContinue}
                disabled={submitting}
                style={{ ...primaryButtonStyle, opacity: submitting ? 0.5 : 1 }}
              >
                Skip anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      padding: '28px 20px', maxWidth: 680, margin: '0 auto',
      color: '#F1F5F9', fontFamily: FONT,
    }}>
      {children}
    </div>
  )
}
