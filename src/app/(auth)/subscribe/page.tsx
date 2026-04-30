'use client'

import { useState } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from '@stripe/react-stripe-js'

const stripePromise = loadStripe('pk_live_51NbbW7CzrOLgF5MUozZxFYByT5Pd71yoSnv4aVcPb9c0uRRyvD36q5jvijBNk3tJ9iEXnp1PVCveDhE1fjKGJba00zFkyvFpQ')

type Plan = {
  name: string
  price: number
  planKey: string
  description: string
  features: string[]
  highlight: boolean
  badge?: string
  buttonLabel: string
}

const PLANS: Plan[] = [
  {
    name: 'Starter',
    price: 299,
    planKey: 'starter',
    description: 'For single-location businesses that want to stop missing calls.',
    features: [
      '1 location',
      'Up to 300 calls/month',
      '24/7 AI voice agent',
      'Order taking and FAQs',
      'Upselling on every call',
      'SMS confirmations',
      'Live dashboard',
      'Email support',
    ],
    highlight: false,
    buttonLabel: 'Choose Starter',
  },
  {
    name: 'Growth',
    price: 499,
    planKey: 'growth',
    description: 'For businesses ready to go further.',
    features: [
      'Everything in Starter',
      'Up to 800 calls/month',
      'TalkMate Command',
      'WhatsApp and Telegram assistant',
      '50 commands per day',
      'Advanced analytics',
      'Priority support',
    ],
    highlight: true,
    badge: 'Most Popular',
    buttonLabel: 'Choose Growth',
  },
  {
    name: 'Pro',
    price: 799,
    planKey: 'pro',
    description: 'Built for multi-location and high-volume operators.',
    features: [
      'Everything in Growth',
      'Unlimited calls',
      'Up to 3 locations',
      'Unlimited commands per day',
      'Dedicated onboarding specialist',
      'Priority phone support',
    ],
    highlight: false,
    buttonLabel: 'Choose Pro',
  },
]

const GUARANTEES = [
  'No setup fees',
  '14-day money-back guarantee',
  'No lock-in contracts',
  'Cancel anytime',
]

export default function SubscribePage() {
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null)
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleChoosePlan = async (planKey: string) => {
    setLoading(true)
    setError(null)
    setSelectedPlan(planKey)

    try {
      const res = await fetch('/api/stripe/embedded-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planKey }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to create checkout session')
      }

      const { clientSecret: secret } = await res.json()
      setClientSecret(secret)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
      setSelectedPlan(null)
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setSelectedPlan(null)
    setClientSecret(null)
    setError(null)
  }

  return (
    <div style={{
      minHeight: '100vh',
      width: '100%',
      background: '#061322',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '48px 20px',
      boxSizing: 'border-box',
    }}>

      {/* Logo */}
      <div style={{ marginBottom: 32 }}>
        <svg width="140" height="42" viewBox="0 0 400 120" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect width="120" height="120" rx="22" fill="#E8622A"/>
          <rect x="18" y="20" width="84" height="18" fill="white"/>
          <rect x="51" y="20" width="18" height="62" fill="white"/>
          <path d="M 108 78 A 30 30 0 0 0 78 108" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" opacity="0.3"/>
          <path d="M 108 88 A 20 20 0 0 0 88 108" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" opacity="0.6"/>
          <path d="M 108 98 A 10 10 0 0 0 98 108" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round"/>
          <circle cx="108" cy="108" r="4.5" fill="white"/>
          <rect x="140" y="16" width="1.5" height="88" fill="#E8622A" opacity="0.45"/>
          <text x="158" y="78" fontFamily="'Outfit', sans-serif" fontSize="52" fontWeight="800" fill="white" letterSpacing="-2">Talk</text>
          <text x="160" y="108" fontFamily="'Outfit', sans-serif" fontSize="26" fontWeight="300" fill="#4A9FE8" letterSpacing="4">Mate</text>
        </svg>
      </div>

      <h1 style={{ fontSize: 28, fontWeight: 800, color: 'white', marginBottom: 8, textAlign: 'center' }}>
        Choose your plan
      </h1>
      <p style={{ fontSize: 15, color: '#4A7FBB', marginBottom: 40, textAlign: 'center' }}>
        14-day money-back guarantee · No setup fees · Cancel anytime
      </p>

      {error && (
        <div style={{
          background: 'rgba(232,98,42,0.15)',
          border: '1px solid rgba(232,98,42,0.4)',
          borderRadius: 8,
          padding: '10px 16px',
          marginBottom: 20,
          fontSize: 13,
          color: '#E8622A',
          maxWidth: 480,
          width: '100%',
          boxSizing: 'border-box',
        }}>
          {error}
        </div>
      )}

      {/* Cards */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        width: '100%',
        maxWidth: 480,
      }}>
        {PLANS.map((plan) => {
          const isLoading = loading && selectedPlan === plan.planKey

          return (
            <div
              key={plan.name}
              style={{
                background: plan.highlight ? '#0E2A4A' : '#0A1E38',
                border: plan.highlight ? '2px solid #E8622A' : '1px solid rgba(255,255,255,0.08)',
                borderRadius: 16,
                padding: '24px 24px 20px',
                position: 'relative',
                width: '100%',
                boxSizing: 'border-box',
              }}
            >
              {plan.badge && (
                <div style={{
                  position: 'absolute',
                  top: -12,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  background: '#E8622A',
                  color: 'white',
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '3px 14px',
                  borderRadius: 99,
                  whiteSpace: 'nowrap',
                  letterSpacing: '0.05em',
                }}>
                  {plan.badge}
                </div>
              )}

              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: 'white', marginBottom: 2 }}>{plan.name}</div>
                  <div style={{ fontSize: 12, color: '#4A7FBB', lineHeight: 1.4 }}>{plan.description}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 16 }}>
                  <span style={{ fontSize: 30, fontWeight: 800, color: 'white' }}>${plan.price}</span>
                  <span style={{ fontSize: 12, color: '#4A7FBB' }}>/mo</span>
                </div>
              </div>

              <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', marginBottom: 12 }} />

              {/* Features */}
              <div style={{ marginBottom: 16 }}>
                {plan.features.map((feature) => (
                  <div key={feature} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#C8D8EA', marginBottom: 6 }}>
                    <div style={{ width: 14, height: 14, borderRadius: '50%', background: 'rgba(232,98,42,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
                        <path d="M1.5 5l2.5 2.5 4.5-5" stroke="#E8622A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                    {feature}
                  </div>
                ))}
              </div>

              {/* CTA */}
              <button
                onClick={() => handleChoosePlan(plan.planKey)}
                disabled={loading}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '13px',
                  background: plan.highlight ? '#E8622A' : 'transparent',
                  color: plan.highlight ? 'white' : '#E8622A',
                  border: plan.highlight ? 'none' : '1.5px solid #E8622A',
                  borderRadius: 10,
                  fontWeight: 700,
                  fontSize: 14,
                  textAlign: 'center',
                  fontFamily: 'inherit',
                  boxSizing: 'border-box',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading && !isLoading ? 0.6 : 1,
                }}
              >
                {isLoading ? 'Loading...' : plan.buttonLabel}
              </button>
            </div>
          )
        })}
      </div>

      {/* Guarantee badges */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: '10px 20px',
        marginTop: 32,
        maxWidth: 480,
      }}>
        {GUARANTEES.map((g) => (
          <div key={g} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#4A7FBB' }}>
            <svg width="13" height="13" viewBox="0 0 10 10" fill="none">
              <path d="M1.5 5l2.5 2.5 4.5-5" stroke="#4A7FBB" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            {g}
          </div>
        ))}
      </div>

      <p style={{ fontSize: 12, color: '#2A5080', marginTop: 28, textAlign: 'center' }}>
        Secure payment via Stripe · Upgrade or cancel anytime
      </p>

      <p style={{ fontSize: 12, color: '#2A5080', marginTop: 16, textAlign: 'center' }}>
        Wrong account?{' '}
        <a href="/api/auth/signout" style={{ color: '#4A7FBB', textDecoration: 'underline' }}>Log out</a>
      </p>

      {/* Embedded checkout overlay */}
      {clientSecret && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 1000,
          background: 'rgba(0,0,0,0.85)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <div style={{ position: 'relative', maxWidth: 600, width: '100%', margin: '0 20px' }}>
            {/* Close button */}
            <button
              onClick={handleClose}
              style={{
                position: 'absolute',
                top: -40,
                right: 0,
                background: 'transparent',
                border: 'none',
                color: 'white',
                fontSize: 28,
                cursor: 'pointer',
                lineHeight: 1,
                padding: '4px 8px',
                fontFamily: 'inherit',
              }}
              aria-label="Close checkout"
            >
              ×
            </button>

            <div style={{
              maxWidth: 600,
              width: '100%',
              maxHeight: '90vh',
              overflow: 'auto',
              borderRadius: 16,
              padding: 0,
            }}>
              <EmbeddedCheckoutProvider stripe={stripePromise} options={{ clientSecret }}>
                <EmbeddedCheckout />
              </EmbeddedCheckoutProvider>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
