'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const PLANS = [
  {
    name: 'Starter',
    price: 299,
    planKey: 'starter',
    description: 'Catches every missed call. Perfect for one busy location.',
    features: [
      '1 location',
      'Up to 300 calls / month',
      'Answers missed calls only',
      'Order taking + FAQs',
      'SMS confirmations',
      'Call transcripts + email support',
    ],
    highlight: false,
  },
  {
    name: 'Professional',
    price: 429,
    planKey: 'professional',
    description: 'Answers every call, day and night. Most popular.',
    features: [
      '1 location',
      'Up to 600 calls / month',
      'Answers ALL calls (not just missed)',
      'Custom AI voice — trained on your menu',
      'After-hours answering (24/7)',
      'Smart upselling — AI suggests add-ons',
      'Weekly call summary reports',
      'Priority support',
    ],
    highlight: true,
  },
  {
    name: 'Growth',
    price: 499,
    planKey: 'growth',
    description: 'Full automation for multi-location businesses.',
    features: [
      'Up to 3 locations',
      'Unlimited calls / month',
      'Everything in Professional',
      'Full dispatch + scheduling',
      'Automated invoicing',
      'Email automation + CRM Lite',
      'Advanced analytics dashboard',
      'Dedicated account manager',
    ],
    highlight: false,
  },
]

export default function SubscribePage() {
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function handleChoosePlan(planName: string) {
    setError('')
    setLoadingPlan(planName)
    try {
      // Get the current session token client-side and send it explicitly
      // so the API route can authenticate regardless of cookie forwarding
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        window.location.href = '/login'
        return
      }
      const res = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ planName }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Something went wrong. Please try again.')
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
        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, padding: '12px 18px', fontSize: 14, color: '#ef4444', marginBottom: 24, maxWidth: 480, textAlign: 'center' }}>
          {error}
        </div>
      )}

      {/* Cards — vertical stack always, side by side only on very large screens */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        width: '100%',
        maxWidth: 480,
      }}>
        {PLANS.map((plan) => {
          const isLoading = loadingPlan === plan.name
          const disabled = !!loadingPlan

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
              {plan.highlight && (
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
                  Most Popular
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
                disabled={disabled}
                style={{
                  width: '100%',
                  padding: '13px',
                  background: plan.highlight ? '#E8622A' : 'transparent',
                  color: plan.highlight ? 'white' : '#E8622A',
                  border: plan.highlight ? 'none' : '1.5px solid #E8622A',
                  borderRadius: 10,
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  opacity: disabled ? 0.6 : 1,
                  fontFamily: 'inherit',
                }}
              >
                {isLoading ? 'Redirecting…' : `Choose ${plan.name}`}
              </button>
            </div>
          )
        })}
      </div>

      <p style={{ fontSize: 12, color: '#2A5080', marginTop: 28, textAlign: 'center' }}>
        Secure payment via Stripe · Upgrade or cancel anytime
      </p>

      <p style={{ fontSize: 12, color: '#2A5080', marginTop: 16, textAlign: 'center' }}>
        Wrong account?{' '}
        <a href="/api/auth/signout" style={{ color: '#4A7FBB', textDecoration: 'underline' }}>Log out</a>
      </p>
    </div>
  )
}
