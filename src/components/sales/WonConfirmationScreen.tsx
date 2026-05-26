'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Copy, Check, Send, MailCheck, AlertTriangle } from 'lucide-react'

interface Props {
  leadId: string
  businessName: string
  contactName: string | null
  repFullName: string
  repPhone: string | null
  plan: 'starter' | 'growth' | 'pro'
  commissionAmount: number
  bonusAmount: number
  billingCycle: 'monthly' | 'annual'
  onBack: () => void
}

function planLabel(p: 'starter' | 'growth' | 'pro'): string {
  return p.charAt(0).toUpperCase() + p.slice(1)
}

export default function WonConfirmationScreen({
  leadId, businessName, contactName, repFullName, repPhone,
  plan, commissionAmount, bonusAmount, billingCycle, onBack,
}: Props) {
  const router = useRouter()
  const [copiedScript, setCopiedScript] = useState(false)
  const [sending, setSending] = useState(false)
  const [emailedTo, setEmailedTo] = useState<string | null>(null)
  const [emailWarning, setEmailWarning] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const script = [
    `Hi ${contactName ?? 'there'}, it is ${repFullName} from TalkMate.`,
    'I just wanted to personally welcome you on board.',
    'Your account is being set up now and someone from our team will be in touch within 24 hours to get everything configured.',
    `In the meantime, if you have any questions at all, call or text me directly on ${repPhone ?? 'my mobile'}. Glad to have you with us.`,
  ].join(' ')

  async function sendPaymentLink() {
    setSending(true)
    setError(null)
    setEmailWarning(null)
    try {
      const res = await fetch(`/api/sales/leads/${leadId}/payment-link`, { method: 'POST' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || !body?.url) {
        setError(body?.error ?? 'Could not send the payment link. Try again or contact admin.')
        return
      }
      // Stripe session was created and persisted. Email send is best-effort:
      // surface success if it landed, or a warning if Resend errored so the
      // rep knows admin will need to follow up.
      if (body.emailed_to) {
        setEmailedTo(body.emailed_to as string)
      } else if (body.email_send_error) {
        setEmailWarning(
          typeof body.email_send_error === 'string'
            ? body.email_send_error
            : 'Email send failed. Admin has been notified.'
        )
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error sending the payment link.')
    } finally {
      setSending(false)
    }
  }

  async function copyScript() {
    try {
      await navigator.clipboard.writeText(script)
      setCopiedScript(true)
      setTimeout(() => setCopiedScript(false), 2000)
    } catch {
      // best-effort
    }
  }

  return (
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
        {businessName} is now in the onboarding queue.
      </p>

      <div style={{
        background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)',
        borderRadius: 10, padding: '16px 18px', marginBottom: 18, textAlign: 'left',
      }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: '#22c55e', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>
          Your commission
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, color: 'white' }}>
          ${commissionAmount}
          <span style={{ fontSize: 12, fontWeight: 600, color: '#7BAED4', marginLeft: 8 }}>pending approval</span>
        </div>
        {billingCycle === 'annual' && bonusAmount > 0 && (
          <div style={{ fontSize: 13, color: '#22c55e', fontWeight: 700, marginTop: 6 }}>
            + ${bonusAmount} annual bonus
          </div>
        )}
      </div>

      {/* Auto-send payment link section */}
      <div style={{
        background: '#061322', border: '1px solid rgba(232,98,42,0.25)',
        borderRadius: 10, padding: '16px 18px', marginBottom: 18, textAlign: 'left',
      }}>
        <div style={{
          fontSize: 11, fontWeight: 800, color: '#E8622A', letterSpacing: '0.08em',
          textTransform: 'uppercase', marginBottom: 10, textAlign: 'center',
        }}>
          ────────  Send payment link  ────────
        </div>

        {!emailedTo && (
          <>
            <p style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.55, margin: '0 0 12px 0' }}>
              When you tap below, TalkMate will email {contactName ?? 'the customer'} a secure Stripe payment link
              for their {planLabel(plan)} {billingCycle} plan from <strong style={{ color: 'white' }}>hello@talkmate.com.au</strong>.
              You don&apos;t need to copy or send anything yourself.
            </p>
            <button
              onClick={sendPaymentLink}
              disabled={sending}
              style={{
                width: '100%', padding: '12px 16px', borderRadius: 9, border: 'none',
                background: sending ? '#7a4a2a' : '#E8622A',
                color: 'white', fontFamily: 'Outfit, sans-serif', fontSize: 14, fontWeight: 700,
                cursor: sending ? 'wait' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              <Send size={14} />
              {sending ? 'Sending payment link…' : `Email payment link to ${contactName ?? 'customer'}`}
            </button>
          </>
        )}

        {emailedTo && (
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: 10,
            padding: '12px 14px', borderRadius: 8,
            background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)',
            color: '#86efac', fontSize: 13, lineHeight: 1.55,
          }}>
            <MailCheck size={16} style={{ flexShrink: 0, marginTop: 2, color: '#22c55e' }} />
            <span>
              Payment link sent to <strong style={{ color: 'white' }}>{emailedTo}</strong> from{' '}
              <strong style={{ color: 'white' }}>hello@talkmate.com.au</strong>. Replies come back to you.
              <br />
              <span style={{ color: '#7BAED4', fontSize: 12 }}>
                As soon as the customer pays, your commission flips from pending to approved automatically.
              </span>
            </span>
          </div>
        )}

        {emailWarning && (
          <div style={{
            marginTop: 10, display: 'flex', alignItems: 'flex-start', gap: 10,
            padding: '10px 12px', borderRadius: 8,
            background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)',
            color: '#fcd34d', fontSize: 12, lineHeight: 1.5,
          }}>
            <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 2, color: '#f59e0b' }} />
            <span>
              The payment link was created in Stripe but the email send failed. Admin has been notified and will
              follow up with the customer.
            </span>
          </div>
        )}

        {error && (
          <div style={{
            marginTop: 10, padding: '8px 12px', borderRadius: 8,
            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
            color: '#ef4444', fontSize: 12,
          }}>
            {error}
          </div>
        )}
      </div>

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
          } as React.CSSProperties}
        >
          {copiedScript ? <Check size={14} /> : <Copy size={14} />}
          {copiedScript ? 'Copied script' : 'Copy welcome call script'}
        </button>
        <button
          onClick={() => { onBack(); router.push('/sales/leads') }}
          style={{
            flex: 1, padding: '11px 16px', borderRadius: 9,
            background: 'rgba(255,255,255,0.04)', color: '#7BAED4',
            border: '1px solid rgba(255,255,255,0.12)',
            fontFamily: 'Outfit, sans-serif', fontSize: 13, fontWeight: 700, cursor: 'pointer',
          }}
        >Back to pipeline</button>
      </div>
    </div>
  )
}
