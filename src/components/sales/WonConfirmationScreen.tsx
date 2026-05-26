'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Copy, Check, Link as LinkIcon, MessageSquare } from 'lucide-react'

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
  const [copiedMessage, setCopiedMessage] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [paymentLink, setPaymentLink] = useState<string | null>(null)
  const [linkError, setLinkError] = useState<string | null>(null)

  const script = [
    `Hi ${contactName ?? 'there'}, it is ${repFullName} from TalkMate.`,
    'I just wanted to personally welcome you on board.',
    'Your account is being set up now and someone from our team will be in touch within 24 hours to get everything configured.',
    `In the meantime, if you have any questions at all, call or text me directly on ${repPhone ?? 'my mobile'}. Glad to have you with us.`,
  ].join(' ')

  function buildMessage(link: string): string {
    const cycle = billingCycle === 'annual' ? 'annual' : 'monthly'
    return [
      `Hi ${contactName ?? 'there'}, it is ${repFullName} from TalkMate.`,
      `Welcome on board for ${businessName}.`,
      `Here is your secure payment link to set up your ${planLabel(plan)} ${cycle} plan: ${link}`,
      'We will be in touch within 24 hours to get everything configured. Any questions, just reply.',
    ].join(' ')
  }

  async function generateLink() {
    setGenerating(true)
    setLinkError(null)
    try {
      const res = await fetch(`/api/sales/leads/${leadId}/payment-link`, { method: 'POST' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || !body?.url) {
        setLinkError(body?.error ?? 'Could not generate payment link.')
        return
      }
      setPaymentLink(body.url as string)
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : 'Network error generating link.')
    } finally {
      setGenerating(false)
    }
  }

  async function copyTo(setter: (v: boolean) => void, text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setter(true)
      setTimeout(() => setter(false), 2000)
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

      {/* Payment link section */}
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

        {!paymentLink && (
          <button
            onClick={generateLink}
            disabled={generating}
            style={{
              width: '100%', padding: '12px 16px', borderRadius: 9, border: 'none',
              background: generating ? '#7a4a2a' : '#E8622A',
              color: 'white', fontFamily: 'Outfit, sans-serif', fontSize: 14, fontWeight: 700,
              cursor: generating ? 'wait' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            <LinkIcon size={14} />
            {generating ? 'Generating secure link…' : `Generate payment link for ${businessName}`}
          </button>
        )}

        {linkError && (
          <div style={{
            marginTop: 10, padding: '8px 12px', borderRadius: 8,
            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
            color: '#ef4444', fontSize: 12,
          }}>
            {linkError}
          </div>
        )}

        {paymentLink && (
          <div>
            <div style={{
              padding: '10px 12px', background: 'rgba(0,0,0,0.3)',
              border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8,
              fontFamily: 'monospace', fontSize: 11, color: '#7BAED4',
              wordBreak: 'break-all', marginBottom: 10,
            }}>
              {paymentLink}
            </div>
            <p style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.55, margin: '0 0 10px 0' }}>
              Send this to {contactName ?? 'the customer'} via SMS, WhatsApp, or email. The customer pays securely on Stripe, and your commission is auto-approved as soon as the payment lands.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => copyTo(setCopiedMessage, buildMessage(paymentLink))}
                style={copyBtn(copiedMessage)}
              >
                {copiedMessage ? <Check size={13} /> : <MessageSquare size={13} />}
                {copiedMessage ? 'Copied message' : 'Copy message'}
              </button>
              <button
                onClick={() => copyTo(setCopiedLink, paymentLink)}
                style={copyBtn(copiedLink, true)}
              >
                {copiedLink ? <Check size={13} /> : <LinkIcon size={13} />}
                {copiedLink ? 'Copied link' : 'Copy link only'}
              </button>
            </div>
            <button
              onClick={generateLink}
              disabled={generating}
              style={{
                marginTop: 8, width: '100%', padding: '8px 12px', borderRadius: 8,
                background: 'transparent', color: '#7BAED4',
                border: '1px solid rgba(255,255,255,0.08)',
                fontFamily: 'Outfit, sans-serif', fontSize: 11, fontWeight: 600,
                cursor: generating ? 'wait' : 'pointer',
              }}
            >
              {generating ? 'Regenerating…' : 'Regenerate link (e.g. customer lost it)'}
            </button>
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
          onClick={() => copyTo(setCopiedScript, script)}
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
          {copiedScript ? 'Copied script' : 'Copy script'}
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

function copyBtn(active: boolean, secondary = false): React.CSSProperties {
  return {
    flex: 1, padding: '10px 12px', borderRadius: 8, border: 'none',
    background: active ? '#22c55e' : (secondary ? 'rgba(123,174,212,0.12)' : '#E8622A'),
    color: 'white', fontFamily: 'Outfit, sans-serif', fontSize: 12, fontWeight: 700,
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  }
}
