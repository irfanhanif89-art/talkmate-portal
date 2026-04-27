'use client'

import { useState } from 'react'

const PLANS = [
  {
    name: 'Starter',
    price: 299,
    priceEnvKey: 'STRIPE_PRICE_STARTER',
    description: 'Perfect for small businesses getting started with AI voice.',
    features: [
      'Up to 500 calls / month',
      'AI voice agent setup',
      'Basic analytics dashboard',
      'Appointment & order capture',
      'Email support',
    ],
    highlight: false,
  },
  {
    name: 'Professional',
    price: 429,
    priceEnvKey: 'STRIPE_PRICE_PROFESSIONAL',
    description: 'For growing businesses that need more capacity and customisation.',
    features: [
      'Up to 1,500 calls / month',
      'Custom voice & tone',
      'Advanced analytics',
      'Priority support',
      'CRM integrations',
      'Call transcripts',
    ],
    highlight: true,
  },
  {
    name: 'Growth',
    price: 499,
    priceEnvKey: 'STRIPE_PRICE_GROWTH',
    description: 'Unlimited scale for high-volume operations.',
    features: [
      'Unlimited calls',
      'Multiple AI agents',
      'Full analytics suite',
      'Dedicated account manager',
      'Custom integrations',
      'Partner program access',
    ],
    highlight: false,
  },
]

export default function SubscribePage() {
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [stripeUnconfigured, setStripeUnconfigured] = useState(false)

  async function handleChoosePlan(planName: string) {
    setError('')
    setLoadingPlan(planName)
    try {
      const res = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planName }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (res.status === 500 && data.error?.includes('not configured')) {
          setStripeUnconfigured(true)
          setError('')
        } else {
          setError(data.error ?? 'Something went wrong. Please try again.')
        }
        setLoadingPlan(null)
        return
      }
      window.location.href = data.url
    } catch {
      setError('Network error. Please try again.')
      setLoadingPlan(null)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-16" style={{ background: '#061322' }}>

      {/* Logo */}
      <div className="mb-10">
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

      <h1 className="text-3xl font-bold text-white mb-2 text-center">Choose your plan</h1>
      <p className="text-base mb-10 text-center" style={{ color: '#4A7FBB' }}>
        All plans include a 14-day money-back guarantee. Cancel anytime.
      </p>

      {stripeUnconfigured && (
        <div className="mb-8 px-5 py-3 rounded-lg text-sm max-w-lg text-center" style={{ background: 'rgba(232,98,42,0.1)', color: '#E8622A', border: '1px solid rgba(232,98,42,0.3)' }}>
          Stripe price IDs are not yet configured (STRIPE_PRICE_STARTER / STRIPE_PRICE_PROFESSIONAL / STRIPE_PRICE_GROWTH). Checkout is unavailable until they are set.
        </div>
      )}

      {error && (
        <div className="mb-8 px-5 py-3 rounded-lg text-sm max-w-lg text-center" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}>
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-5xl">
        {PLANS.map((plan) => {
          const isLoading = loadingPlan === plan.name
          const disabled = stripeUnconfigured || !!loadingPlan

          return (
            <div
              key={plan.name}
              className="flex flex-col rounded-2xl p-7"
              style={{
                background: plan.highlight ? '#0E2A4A' : '#0A1E38',
                border: plan.highlight ? '2px solid #E8622A' : '1px solid rgba(255,255,255,0.08)',
                position: 'relative',
              }}
            >
              {plan.highlight && (
                <div
                  className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-xs font-semibold"
                  style={{ background: '#E8622A', color: 'white' }}
                >
                  Most Popular
                </div>
              )}

              <div className="mb-5">
                <h2 className="text-lg font-bold text-white mb-1">{plan.name}</h2>
                <p className="text-sm" style={{ color: '#4A7FBB' }}>{plan.description}</p>
              </div>

              <div className="mb-6">
                <span className="text-4xl font-extrabold text-white">${plan.price}</span>
                <span className="text-sm ml-1" style={{ color: '#4A7FBB' }}>/mo AUD</span>
              </div>

              <ul className="flex-1 space-y-3 mb-8">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-2 text-sm" style={{ color: '#C8D8EA' }}>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
                      <circle cx="8" cy="8" r="8" fill="rgba(232,98,42,0.15)"/>
                      <path d="M4.5 8l2.5 2.5 4.5-5" stroke="#E8622A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    {feature}
                  </li>
                ))}
              </ul>

              <button
                onClick={() => handleChoosePlan(plan.name)}
                disabled={disabled}
                style={{
                  background: plan.highlight ? '#E8622A' : 'transparent',
                  color: plan.highlight ? 'white' : '#E8622A',
                  border: plan.highlight ? 'none' : '1px solid #E8622A',
                  borderRadius: '10px',
                  padding: '12px',
                  fontWeight: 600,
                  fontSize: '14px',
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  opacity: disabled ? 0.6 : 1,
                  transition: 'opacity 0.2s',
                  width: '100%',
                }}
              >
                {isLoading ? 'Redirecting to checkout…' : `Choose ${plan.name}`}
              </button>
            </div>
          )
        })}
      </div>

      <p className="text-xs mt-10 text-center" style={{ color: '#2A5080' }}>
        Secure payment via Stripe. You can upgrade, downgrade, or cancel at any time from your billing settings.
      </p>
    </div>
  )
}
