// Session 43 — Public landing page customers see after they complete
// (or cancel) Stripe Checkout from a rep-shared payment link.
//
// Intentionally minimal. No auth gate (the customer hasn't logged in
// yet — admin will provision their account once payment lands and the
// webhook fires). Two states: success (default) and cancelled (when
// the customer hits Stripe's back button or closes the tab).

import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Payment confirmed — TalkMate',
}

interface Props {
  searchParams: Promise<{ cancelled?: string }>
}

export default async function PaymentSuccessPage({ searchParams }: Props) {
  const params = await searchParams
  const cancelled = params.cancelled === '1'

  if (cancelled) {
    return (
      <Wrapper>
        <h1 style={{ fontSize: 26, fontWeight: 800, margin: '0 0 14px 0' }}>Payment cancelled.</h1>
        <p style={{ color: 'rgba(255,255,255,0.75)', lineHeight: 1.7, margin: '0 0 18px 0' }}>
          No worries. Your TalkMate account is not active yet. If you cancelled by mistake, reply to the SMS or email from your TalkMate rep and they will send you a fresh link.
        </p>
        <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13, margin: 0 }}>
          Any questions? Email <a href="mailto:hello@talkmate.com.au" style={{ color: '#E8622A' }}>hello@talkmate.com.au</a>.
        </p>
      </Wrapper>
    )
  }

  return (
    <Wrapper>
      <h1 style={{ fontSize: 26, fontWeight: 800, margin: '0 0 14px 0' }}>You are in. Welcome to TalkMate.</h1>
      <p style={{ color: 'rgba(255,255,255,0.75)', lineHeight: 1.7, margin: '0 0 18px 0' }}>
        Thank you for your payment. Your TalkMate account is being set up right now. Someone from our team will be in touch within 24 hours to configure your AI voice agent and walk you through next steps.
      </p>
      <div style={{
        background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)',
        borderRadius: 10, padding: '14px 16px', margin: '0 0 24px 0',
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#22c55e', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>
          What happens next
        </div>
        <ol style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14, lineHeight: 1.8, margin: 0, paddingLeft: 18 }}>
          <li>Our team configures your AI agent with your menu and business details.</li>
          <li>You receive login details for your TalkMate portal.</li>
          <li>You forward your existing business number to the TalkMate line we provision.</li>
          <li>Your agent starts answering calls.</li>
        </ol>
      </div>
      <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13, margin: 0 }}>
        Any questions? Email <a href="mailto:hello@talkmate.com.au" style={{ color: '#E8622A' }}>hello@talkmate.com.au</a>.
      </p>
    </Wrapper>
  )
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#061322',
      padding: 24,
      fontFamily: 'Outfit, sans-serif',
    }}>
      <div style={{
        maxWidth: 560, width: '100%',
        background: '#0A1E38', color: 'white',
        borderRadius: 16, padding: 40,
        border: '1px solid rgba(255,255,255,0.08)',
      }}>
        <div style={{ marginBottom: 28 }}>
          <span style={{ fontSize: 28, fontWeight: 800, color: 'white' }}>Talk</span>
          <span style={{ fontSize: 18, fontWeight: 300, color: '#4A9FE8', letterSpacing: 4 }}>Mate</span>
        </div>
        {children}
      </div>
    </div>
  )
}
