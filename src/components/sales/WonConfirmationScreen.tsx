'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Copy, Check } from 'lucide-react'

interface Props {
  businessName: string
  contactName: string | null
  repFullName: string
  repPhone: string | null
  commissionAmount: number
  bonusAmount: number
  billingCycle: 'monthly' | 'annual'
  onBack: () => void
}

export default function WonConfirmationScreen({
  businessName, contactName, repFullName, repPhone,
  commissionAmount, bonusAmount, billingCycle, onBack,
}: Props) {
  const router = useRouter()
  const [copied, setCopied] = useState(false)

  const script = [
    `Hi ${contactName ?? 'there'}, it is ${repFullName} from TalkMate.`,
    'I just wanted to personally welcome you on board.',
    'Your account is being set up now and someone from our team will be in touch within 24 hours to get everything configured.',
    `In the meantime, if you have any questions at all, call or text me directly on ${repPhone ?? 'my mobile'}. Glad to have you with us.`,
  ].join(' ')

  async function copyScript() {
    try {
      await navigator.clipboard.writeText(script)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
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

      <div style={{
        background: '#061322', border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 10, padding: '16px 18px', marginBottom: 18, textAlign: 'left',
      }}>
        <div style={{
          fontSize: 11, fontWeight: 800, color: '#E8622A', letterSpacing: '0.08em',
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
            flex: 1, padding: '11px 16px', borderRadius: 9, border: 'none',
            background: copied ? '#22c55e' : '#E8622A',
            color: 'white', fontFamily: 'Outfit, sans-serif', fontSize: 13, fontWeight: 700,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? 'Copied' : 'Copy script'}
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
