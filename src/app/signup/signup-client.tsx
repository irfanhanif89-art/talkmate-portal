'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import PasswordStrength from '@/components/portal/password-strength'
import { validatePassword as validatePasswordRules } from '@/lib/password'
import { isSaleActive, regularPrice, EOFY_SALE } from '@/lib/eofy-sale'

type Plan = 'starter' | 'growth' | 'pro'
type SignupType = 'trial' | 'pay_now'

interface PlanCard {
  key: Plan
  name: string
  price: number
  pitch: string
  features: string[]
  popular?: boolean
}

const PLANS: PlanCard[] = [
  {
    key: 'starter',
    name: 'Starter',
    price: 299,
    pitch: 'For single-location businesses.',
    features: [
      '300 calls per month',
      '24/7 AI receptionist',
      'Order taking and FAQs',
      'SMS confirmations',
    ],
  },
  {
    key: 'growth',
    name: 'Growth',
    price: 499,
    pitch: 'Everything in Starter, plus:',
    popular: true,
    features: [
      '800 calls per month',
      'TalkMate Command',
      'WhatsApp / Telegram assistant',
      'Advanced analytics',
    ],
  },
  {
    key: 'pro',
    name: 'Pro',
    price: 799,
    pitch: 'Everything in Growth, plus:',
    features: [
      'Unlimited calls',
      'Up to 3 locations',
      'Dedicated onboarding specialist',
      'Priority phone support',
    ],
  },
]

const INDUSTRIES: Array<{ value: string; label: string }> = [
  { value: 'restaurants', label: 'Restaurant / Takeaway' },
  { value: 'towing', label: 'Towing' },
  { value: 'trades', label: 'Trades' },
  { value: 'mechanic', label: 'Mechanic' },
  { value: 'dental', label: 'Dental' },
  { value: 'medispa', label: 'Medi-Spa / Beauty' },
  { value: 'real_estate', label: 'Real Estate' },
  { value: 'healthcare', label: 'Healthcare / GP Clinic' },
  { value: 'physio', label: 'Physio / Allied Health' },
  { value: 'accounting', label: 'Accounting / Bookkeeping' },
  { value: 'cleaning', label: 'Cleaning Services' },
  { value: 'pest', label: 'Pest Control' },
  { value: 'landscaping', label: 'Landscaping / Gardens' },
]

export default function SignupClient({ initialPlan }: { initialPlan: Plan }) {
  const saleOn = isSaleActive()
  const [plan, setPlan] = useState<Plan>(initialPlan)
  const [signupType, setSignupType] = useState<SignupType>('trial')

  const [fullName, setFullName] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [industry, setIndustry] = useState('')

  const [emailStatus, setEmailStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [bannerError, setBannerError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [phoneDupe, setPhoneDupe] = useState<{ existing_business_name: string | null; existing_business_status: string | null } | null>(null)
  // The signup page can be opened by anyone on the web, so the
  // confirm-to-override gate matches the admin modal: protects against
  // a panicked second-account attempt that would silently break the
  // first one's login.
  const [phoneDupeConfirmText, setPhoneDupeConfirmText] = useState('')

  // Debounced email-availability check
  useEffect(() => {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailStatus('idle')
      return
    }
    setEmailStatus('checking')
    const id = setTimeout(async () => {
      try {
        const res = await fetch(`/api/auth/check-email?email=${encodeURIComponent(email)}`)
        const data = await res.json()
        setEmailStatus(data.available ? 'available' : 'taken')
      } catch {
        setEmailStatus('idle')
      }
    }, 500)
    return () => clearTimeout(id)
  }, [email])

  const passwordStrength = useMemo(() => scorePassword(password), [password])

  const selectedPlan = PLANS.find(p => p.key === plan)!
  const submitLabel = signupType === 'trial' ? 'Start my free trial' : 'Continue to payment'

  function validate(): boolean {
    const errs: Record<string, string> = {}
    if (!fullName.trim()) errs.fullName = 'Your full name is required.'
    if (!businessName.trim()) errs.businessName = 'Business name is required.'
    if (!email.trim()) errs.email = 'Email is required.'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = 'Enter a valid email address.'
    if (!phone.trim()) errs.phone = 'Phone number is required.'
    if (!password) errs.password = 'Password is required.'
    else {
      const pwErr = validatePasswordRules(password)
      if (pwErr) errs.password = pwErr
    }
    if (!industry) errs.industry = 'Choose your industry.'
    setFieldErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function submitSignup(opts?: { forcePhoneDuplicate?: boolean }) {
    setBannerError(null)
    setPhoneDupe(null)
    setPhoneDupeConfirmText('')
    if (!validate()) return
    if (emailStatus === 'taken') {
      setFieldErrors(f => ({ ...f, email: 'This email is already registered. Try logging in instead.' }))
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          password,
          full_name: fullName.trim(),
          business_name: businessName.trim(),
          phone: phone.trim(),
          industry,
          plan,
          signup_type: signupType,
          force_phone_duplicate: !!opts?.forcePhoneDuplicate,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        if (data.duplicate_field === 'phone' && data.can_force) {
          setPhoneDupe({
            existing_business_name: data.existing_business_name ?? null,
            existing_business_status: data.existing_business_status ?? null,
          })
          setPhoneDupeConfirmText('')
          setSubmitting(false)
          return
        }
        setBannerError(data.error ?? 'We could not create your account. Please try again.')
        setSubmitting(false)
        return
      }

      // Trial path: establish a browser session so the dashboard
      // redirect lands them logged in.
      if (signupType === 'trial') {
        try {
          const sb = createClient()
          await sb.auth.signInWithPassword({ email: email.trim(), password })
        } catch (e) {
          console.error('[signup] auto-login failed', e)
        }
      }

      window.location.href = data.redirect_url ?? '/dashboard'
    } catch (e) {
      setBannerError((e as Error).message || 'Something went wrong. Please try again.')
      setSubmitting(false)
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    submitSignup()
  }

  return (
    <div style={pageStyle}>
      {/* Header strip — logo + login link */}
      <header style={headerStyle}>
        <a href="https://talkmate.com.au" aria-label="TalkMate home" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
          <Logo />
        </a>
        <a href="/login" style={{ fontSize: 13, color: '#7BAED4', textDecoration: 'none', fontWeight: 600 }}>
          Already have an account? <span style={{ color: '#4A9FE8' }}>Log in →</span>
        </a>
      </header>

      <main style={mainStyle}>
        <div style={gridStyle} className="signup-grid">
          {/* ---- Left: plan selector ---------------------------------- */}
          <section style={{ minWidth: 0 }}>
            <p style={eyebrowStyle}>Step 1</p>
            <h1 style={h1Style}>Pick your plan</h1>
            {saleOn && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', marginTop: 8,
                padding: '4px 11px', borderRadius: 99,
                background: 'rgba(232,98,42,0.12)', border: '1px solid rgba(232,98,42,0.45)',
                color: '#E8622A', fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', whiteSpace: 'nowrap',
              }}>{EOFY_SALE.badge}</span>
            )}
            <p style={subStyle}>Start a 7-day free trial or pay now. Cancel anytime.</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 18 }}>
              {PLANS.map(p => {
                const selected = plan === p.key
                return (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => setPlan(p.key)}
                    aria-pressed={selected}
                    style={{
                      textAlign: 'left' as const,
                      background: selected ? 'rgba(232,98,42,0.10)' : '#071829',
                      border: `2px solid ${selected ? '#E8622A' : 'rgba(255,255,255,0.08)'}`,
                      borderRadius: 14, padding: 18,
                      cursor: 'pointer', fontFamily: 'Outfit, sans-serif',
                      position: 'relative' as const,
                      transition: 'border-color 0.15s, background 0.15s',
                    }}
                  >
                    {p.popular && (
                      <span style={{
                        position: 'absolute', top: -10, right: 16,
                        background: '#E8622A', color: 'white',
                        fontSize: 10, fontWeight: 800, letterSpacing: '0.08em',
                        padding: '3px 9px', borderRadius: 99,
                      }}>MOST POPULAR</span>
                    )}
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 4 }}>
                      <span style={{ fontSize: 16, fontWeight: 800, color: 'white' }}>{p.name}</span>
                      <span style={{ fontSize: 20, fontWeight: 800, color: selected ? '#E8622A' : '#4A9FE8', letterSpacing: '-0.5px' }}>
                        {saleOn && (
                          <span style={{ fontSize: 13, fontWeight: 700, color: '#7BAED4', textDecoration: 'line-through', marginRight: 6 }}>
                            ${regularPrice(p.price).toLocaleString('en-AU')}
                          </span>
                        )}
                        ${p.price}<span style={{ fontSize: 11, fontWeight: 500, color: '#7BAED4' }}>/mo</span>
                      </span>
                    </div>
                    <p style={{ fontSize: 12, color: '#7BAED4', margin: 0, marginBottom: 10 }}>{p.pitch}</p>
                    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {p.features.map(f => (
                        <li key={f} style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                          <span style={{ color: selected ? '#E8622A' : '#22C55E', fontSize: 12, lineHeight: '14px' }}>✓</span>
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                  </button>
                )
              })}
            </div>
          </section>

          {/* ---- Right: signup form ----------------------------------- */}
          <section style={{ minWidth: 0 }}>
            <p style={eyebrowStyle}>Step 2</p>
            <h2 style={h1Style}>Create your account</h2>
            <p style={subStyle}>You can change plans later from your portal.</p>

            <form onSubmit={handleSubmit} style={{ marginTop: 18 }} noValidate>
              {bannerError && (
                <div style={errorBannerStyle}>{bannerError}</div>
              )}

              <Field label="Full name" error={fieldErrors.fullName}>
                <input
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  autoComplete="name"
                  style={inputStyle(!!fieldErrors.fullName)}
                  disabled={submitting}
                />
              </Field>

              <Field label="Business name" error={fieldErrors.businessName}>
                <input
                  value={businessName}
                  onChange={e => setBusinessName(e.target.value)}
                  autoComplete="organization"
                  style={inputStyle(!!fieldErrors.businessName)}
                  disabled={submitting}
                />
              </Field>

              <Field
                label="Email address"
                error={fieldErrors.email}
                hint={(() => {
                  if (emailStatus === 'checking') return 'Checking…'
                  if (emailStatus === 'taken') return (
                    <>Email already registered. <a href="/login" style={{ color: '#4A9FE8', textDecoration: 'none' }}>Log in instead?</a></>
                  )
                  if (emailStatus === 'available') return <span style={{ color: '#22C55E' }}>✓ Available</span>
                  return null
                })()}
              >
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  autoComplete="email"
                  style={inputStyle(!!fieldErrors.email || emailStatus === 'taken')}
                  disabled={submitting}
                />
              </Field>

              <Field label="Phone number" error={fieldErrors.phone}>
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="0412 345 678"
                  autoComplete="tel"
                  style={inputStyle(!!fieldErrors.phone)}
                  disabled={submitting}
                />
              </Field>

              <Field
                label="Password"
                error={fieldErrors.password}
                hint={password ? null : 'At least 8 characters with one uppercase letter, number, and special character.'}
              >
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete="new-password"
                  style={inputStyle(!!fieldErrors.password)}
                  disabled={submitting}
                />
                <PasswordStrength password={password} />
              </Field>

              <Field label="Industry" error={fieldErrors.industry}>
                <select
                  value={industry}
                  onChange={e => setIndustry(e.target.value)}
                  style={{
                    ...inputStyle(!!fieldErrors.industry),
                    cursor: 'pointer',
                    appearance: 'auto' as const,
                  }}
                  disabled={submitting}
                >
                  <option value="" disabled style={{ background: '#0A1E38' }}>Choose your industry…</option>
                  {INDUSTRIES.map(i => (
                    <option key={i.value} value={i.value} style={{ background: '#0A1E38', color: 'white' }}>{i.label}</option>
                  ))}
                </select>
              </Field>

              {/* Trial vs Pay-now choice */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 18 }} className="signup-choice">
                <ChoiceButton
                  selected={signupType === 'trial'}
                  filled={false}
                  onClick={() => setSignupType('trial')}
                  title="Start 7-day free trial"
                  body="No credit card required. Full access from day one. Your agent goes live within 24 hours."
                  disabled={submitting}
                />
                <ChoiceButton
                  selected={signupType === 'pay_now'}
                  filled={true}
                  onClick={() => setSignupType('pay_now')}
                  title={`Pay now — $${selectedPlan.price}/mo`}
                  body="14-day money-back guarantee. No lock-in."
                  disabled={submitting}
                />
              </div>

              {phoneDupe && (() => {
                const confirmReady = phoneDupeConfirmText.trim().toUpperCase() === 'CONFIRM'
                const existingName = phoneDupe.existing_business_name ?? 'an existing business'
                const existingStatus = phoneDupe.existing_business_status ?? 'unknown'
                return (
                  <div style={{
                    marginTop: 16, padding: '16px 18px', borderRadius: 11,
                    background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.55)',
                  }}>
                    <div style={{
                      fontSize: 13, fontWeight: 800, color: '#EF4444', marginBottom: 8,
                      letterSpacing: '0.04em', textTransform: 'uppercase' as const,
                    }}>
                      ⚠ WARNING: Duplicate phone number
                    </div>
                    <div style={{ fontSize: 13, color: 'white', lineHeight: 1.55, marginBottom: 12 }}>
                      A business account already exists with this phone number:{' '}
                      <strong>{existingName}</strong>{' '}
                      (status: <strong>{existingStatus}</strong>).{' '}
                      Creating another account for the same phone number can cause login issues.{' '}
                      Only proceed if this is a different business owner.
                    </div>
                    <label style={{
                      display: 'block', fontSize: 11, fontWeight: 700, color: '#FCA5A5',
                      marginBottom: 6, textTransform: 'uppercase' as const, letterSpacing: '0.06em',
                    }}>
                      Type CONFIRM to enable the override
                    </label>
                    <input
                      type="text"
                      value={phoneDupeConfirmText}
                      onChange={e => setPhoneDupeConfirmText(e.target.value)}
                      placeholder="CONFIRM"
                      autoComplete="off"
                      style={{
                        ...inputStyle(false),
                        marginBottom: 12,
                        borderColor: confirmReady ? 'rgba(239,68,68,0.6)' : 'rgba(255,255,255,0.15)',
                      }}
                    />
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
                      <a href="/login" style={{
                        padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                        background: '#071829', color: '#4A9FE8', textDecoration: 'none',
                        border: '1px solid rgba(74,159,232,0.4)',
                        fontFamily: 'Outfit, sans-serif',
                      }}>Log in to existing account</a>
                      <button
                        type="button"
                        onClick={() => submitSignup({ forcePhoneDuplicate: true })}
                        disabled={submitting || !confirmReady}
                        style={{
                          padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 800,
                          background: confirmReady ? '#EF4444' : 'rgba(239,68,68,0.35)',
                          border: 'none',
                          color: 'white',
                          cursor: submitting ? 'wait' : confirmReady ? 'pointer' : 'not-allowed',
                          fontFamily: 'Outfit, sans-serif',
                          opacity: confirmReady ? 1 : 0.7,
                        }}
                      >
                        {submitting ? 'Creating…' : 'Create anyway'}
                      </button>
                    </div>
                  </div>
                )
              })()}

              <button
                type="submit"
                disabled={submitting}
                style={{
                  width: '100%', marginTop: 18,
                  padding: '14px 18px', borderRadius: 11,
                  background: signupType === 'pay_now' ? '#E8622A' : '#E8622A',
                  color: 'white', border: 'none',
                  fontSize: 15, fontWeight: 800, letterSpacing: '0.02em',
                  cursor: submitting ? 'wait' : 'pointer',
                  fontFamily: 'Outfit, sans-serif',
                  opacity: submitting ? 0.85 : 1,
                  boxShadow: '0 8px 24px rgba(232,98,42,0.30)',
                }}
              >
                {submitting ? 'Setting up your account…' : submitLabel}
              </button>

              <div style={{ display: 'flex', gap: 18, marginTop: 16, justifyContent: 'center', flexWrap: 'wrap', fontSize: 12, color: '#7BAED4' }}>
                <span>✓ No setup fees</span>
                <span>✓ Cancel anytime</span>
                <span>✓ Australian support</span>
              </div>
            </form>
          </section>
        </div>
      </main>

      {/* Mobile: stack plan selector above form */}
      <style>{`
        @media (max-width: 900px) {
          .signup-grid { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 520px) {
          .signup-choice { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}

// ---------- subcomponents ----------

function Field({
  label, error, hint, children,
}: {
  label: string
  error?: string
  hint?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <label style={{ display: 'block', marginBottom: 12 }}>
      <span style={{
        display: 'block', fontSize: 11, fontWeight: 700,
        color: '#7BAED4', textTransform: 'uppercase' as const, letterSpacing: '0.05em',
        marginBottom: 6,
      }}>{label}</span>
      {children}
      {error && (
        <span style={{ display: 'block', fontSize: 12, color: '#FCA5A5', marginTop: 5 }}>{error}</span>
      )}
      {!error && hint && (
        <span style={{ display: 'block', fontSize: 11, color: '#7BAED4', marginTop: 5 }}>{hint}</span>
      )}
    </label>
  )
}

function ChoiceButton({
  selected, filled, onClick, title, body, disabled,
}: {
  selected: boolean
  filled: boolean
  onClick: () => void
  title: string
  body: string
  disabled?: boolean
}) {
  const bg = selected ? (filled ? '#E8622A' : 'rgba(232,98,42,0.10)') : '#071829'
  const border = selected ? '#E8622A' : 'rgba(255,255,255,0.08)'
  const titleColor = selected && filled ? 'white' : 'white'
  const bodyColor = selected && filled ? 'rgba(255,255,255,0.9)' : '#7BAED4'
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        textAlign: 'left' as const,
        background: bg,
        border: `2px solid ${border}`,
        borderRadius: 12, padding: 14,
        cursor: 'pointer', fontFamily: 'Outfit, sans-serif',
        transition: 'border-color 0.15s, background 0.15s',
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 800, color: titleColor, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 11, color: bodyColor, lineHeight: 1.5 }}>{body}</div>
    </button>
  )
}

function PasswordMeter({ score, label }: { score: number; label: string }) {
  const color = score >= 3 ? '#22C55E' : score === 2 ? '#F59E0B' : '#EF4444'
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span style={{ display: 'inline-block', width: 80, height: 4, borderRadius: 99, background: 'rgba(255,255,255,0.08)', position: 'relative', overflow: 'hidden' }}>
        <span style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${Math.min(100, score * 33)}%`, background: color, borderRadius: 99 }} />
      </span>
      <span style={{ color, fontWeight: 700 }}>{label}</span>
    </span>
  )
}

function scorePassword(p: string): { score: number; label: string } {
  if (!p) return { score: 0, label: '' }
  let s = 0
  if (p.length >= 8) s++
  if (p.length >= 12) s++
  if (/[a-z]/.test(p) && /[A-Z]/.test(p)) s++
  if (/\d/.test(p)) s++
  if (/[^A-Za-z0-9]/.test(p)) s++
  const score = Math.min(3, Math.floor(s / 1.5))
  return {
    score,
    label: score === 0 ? 'Weak' : score === 1 ? 'Weak' : score === 2 ? 'OK' : 'Strong',
  }
}

function Logo() {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }} aria-label="TalkMate">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo-mark.svg" alt="" aria-hidden="true" width={40} height={40} style={{ display: 'block' }} />
      <span style={{ fontWeight: 800, fontSize: 26, color: '#fff', letterSpacing: '-0.5px', lineHeight: 1 }}>Talk<span style={{ color: '#7EC8F5' }}>Mate</span></span>
    </span>
  )
}

// ---------- styles ----------

const pageStyle: React.CSSProperties = {
  minHeight: '100vh',
  background: '#061322',
  color: 'white',
  fontFamily: 'Outfit, sans-serif',
}

const headerStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '20px 32px',
  borderBottom: '1px solid rgba(255,255,255,0.06)',
  background: 'rgba(6,19,34,0.96)',
}

const mainStyle: React.CSSProperties = {
  maxWidth: 1180, margin: '0 auto',
  padding: '40px 32px 80px',
}

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.1fr)',
  gap: 48,
  alignItems: 'start',
}

const eyebrowStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 800, color: '#E8622A',
  textTransform: 'uppercase' as const, letterSpacing: '0.12em',
  margin: 0,
}

const h1Style: React.CSSProperties = {
  fontSize: 32, fontWeight: 800, color: 'white',
  letterSpacing: '-0.8px', lineHeight: 1.1,
  margin: '6px 0 8px 0',
}

const subStyle: React.CSSProperties = {
  fontSize: 14, color: '#7BAED4', margin: 0, lineHeight: 1.55,
}

function inputStyle(invalid: boolean): React.CSSProperties {
  return {
    width: '100%',
    padding: '11px 13px',
    borderRadius: 9,
    background: '#071829',
    border: `1px solid ${invalid ? 'rgba(239,68,68,0.6)' : 'rgba(255,255,255,0.1)'}`,
    color: 'white',
    fontSize: 14,
    fontFamily: 'Outfit, sans-serif',
    outline: 'none',
  }
}

const errorBannerStyle: React.CSSProperties = {
  marginBottom: 14,
  padding: '10px 14px',
  borderRadius: 9,
  background: 'rgba(239,68,68,0.1)',
  border: '1px solid rgba(239,68,68,0.35)',
  color: '#FCA5A5',
  fontSize: 13,
  fontWeight: 600,
}
