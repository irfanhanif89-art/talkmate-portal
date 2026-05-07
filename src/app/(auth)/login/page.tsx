'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const Logo = () => (
  <svg width="160" height="48" viewBox="0 0 400 120" fill="none" xmlns="http://www.w3.org/2000/svg">
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
)

const stats = [
  { value: '24/7', label: 'Always answering' },
  { value: '< 2s', label: 'Answer time' },
  { value: '89%', label: 'AI resolution rate' },
  { value: '0', label: 'Missed calls' },
]

const testimonials = [
  { text: "Talkmate handles every call while I'm on the tools. Best investment I've made.", name: 'James T.', biz: 'JT Plumbing, Brisbane' },
  { text: "My front desk used to miss calls constantly. Now every single one gets answered.", name: 'Sarah M.', biz: 'Bloom Dental, Gold Coast' },
  { text: "Set it up on a Friday, had 12 bookings by Monday. Pays for itself.", name: 'Mike R.', biz: 'Rapid Auto, Melbourne' },
]

function LoginPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const nextUrl = searchParams.get('next') ?? '/dashboard'
  const supabase = createClient()
  const [tab, setTab] = useState<'password' | 'magic'>('password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [magicSent, setMagicSent] = useState(false)
  const [testimonialIdx] = useState(0)

  async function handlePassword(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError(error.message); setLoading(false); return }
    window.location.href = nextUrl
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextUrl)}` }
    })
    if (error) { setError(error.message); setLoading(false); return }
    setMagicSent(true); setLoading(false)
  }

  const inp: React.CSSProperties = {
    width: '100%', padding: '13px 16px', borderRadius: 10, fontFamily: 'Outfit, sans-serif',
    fontSize: 14, outline: 'none', background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)', color: 'white',
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', fontFamily: 'Outfit, sans-serif', background: '#061322' }}>

      {/* ── Left panel ── */}
      <div style={{
        flex: 1, display: 'none', flexDirection: 'column', justifyContent: 'space-between',
        padding: '48px 56px', background: 'linear-gradient(160deg, #0A1E38 0%, #071829 60%, #061322 100%)',
        borderRight: '1px solid rgba(255,255,255,0.06)', position: 'relative', overflow: 'hidden',
      }} className="lg-flex">

        {/* Background glow */}
        <div style={{ position: 'absolute', top: -100, right: -100, width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(232,98,42,0.08) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: -100, left: -100, width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(74,159,232,0.06) 0%, transparent 70%)', pointerEvents: 'none' }} />

        {/* Logo */}
        <Logo />

        {/* Main copy */}
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px', background: 'rgba(232,98,42,0.12)', border: '1px solid rgba(232,98,42,0.25)', borderRadius: 99, fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#E8622A', marginBottom: 20 }}>
            ● Live AI Receptionist
          </div>
          <h1 style={{ fontSize: '2.6rem', fontWeight: 800, color: 'white', lineHeight: 1.15, marginBottom: 16, letterSpacing: '-1px' }}>
            Never miss a<br />
            <span style={{ color: '#E8622A' }}>business call</span><br />
            again.
          </h1>
          <p style={{ fontSize: 16, color: '#7BAED4', lineHeight: 1.7, maxWidth: 400, marginBottom: 40 }}>
            Your AI receptionist answers every call in under 2 seconds — 24/7, takes bookings, answers questions, and escalates when it matters.
          </p>

          {/* Stats grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 40, maxWidth: 380 }}>
            {stats.map(s => (
              <div key={s.label} style={{ padding: '18px 20px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14 }}>
                <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#E8622A', lineHeight: 1 }}>{s.value}</div>
                <div style={{ fontSize: 12, color: '#7BAED4', marginTop: 4, fontWeight: 500 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Testimonial */}
          <div style={{ padding: '20px 24px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16 }}>
            <div style={{ fontSize: 22, marginBottom: 10 }}>⭐⭐⭐⭐⭐</div>
            <p style={{ fontSize: 14, color: '#7BAED4', lineHeight: 1.7, marginBottom: 14, fontStyle: 'italic' }}>
              &ldquo;{testimonials[testimonialIdx].text}&rdquo;
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg, #E8622A, #4A9FE8)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: 'white', flexShrink: 0 }}>
                {testimonials[testimonialIdx].name[0]}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'white' }}>{testimonials[testimonialIdx].name}</div>
                <div style={{ fontSize: 12, color: '#4A7FBB' }}>{testimonials[testimonialIdx].biz}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ fontSize: 12, color: '#4A7FBB' }}>
          © 2026 Talkmate Pty Ltd · hello@talkmate.com.au
        </div>
      </div>

      {/* ── Right panel / form ── */}
      <div style={{ width: '100%', maxWidth: 520, margin: '0 auto', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '48px 40px' }}>

        {/* Mobile logo */}
        <div style={{ marginBottom: 40 }} className="lg-hidden">
          <Logo />
        </div>

        {/* Heading */}
        <div style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: '1.8rem', fontWeight: 800, color: 'white', marginBottom: 6, letterSpacing: '-0.5px' }}>Welcome back</h2>
          <p style={{ fontSize: 14, color: '#4A7FBB' }}>
            Sign in to your TalkMate portal &nbsp;·&nbsp;
            <a href="/register" style={{ color: '#E8622A', fontWeight: 600, textDecoration: 'none' }}>New? Sign up here →</a>
          </p>
        </div>

        {/* Error */}
        {error && (
          <div style={{ marginBottom: 20, padding: '12px 16px', borderRadius: 10, background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)', fontSize: 14 }}>
            {error}
          </div>
        )}

        {/* Tab Toggle */}
        <div style={{ display: 'flex', background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 4, marginBottom: 28 }}>
          {(['password', 'magic'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              flex: 1, padding: '10px', borderRadius: 9, border: 'none', cursor: 'pointer',
              fontFamily: 'Outfit, sans-serif', fontSize: 14, fontWeight: 600, transition: 'all 0.15s',
              background: tab === t ? 'white' : 'transparent',
              color: tab === t ? '#061322' : '#4A7FBB',
            }}>
              {t === 'password' ? '🔒 Password' : '✨ Magic Link'}
            </button>
          ))}
        </div>

        {/* Password form */}
        {tab === 'password' && (
          <form onSubmit={handlePassword}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#4A7FBB', marginBottom: 8, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="you@yourbusiness.com.au" required style={inp} />
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#4A7FBB', marginBottom: 8, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="••••••••" required style={inp} />
            </div>
            <div style={{ textAlign: 'right', marginBottom: 24 }}>
              <a href="/forgot-password" style={{ fontSize: 13, color: '#4A9FE8', textDecoration: 'none' }}>Forgot password?</a>
            </div>
            <button type="submit" disabled={loading} style={{
              width: '100%', padding: '15px', background: loading ? '#7B3A1A' : '#E8622A', color: 'white',
              border: 'none', borderRadius: 12, fontFamily: 'Outfit, sans-serif', fontSize: 16, fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer', transition: 'background 0.15s',
            }}>
              {loading ? '⚡ Signing in…' : 'Sign In →'}
            </button>
          </form>
        )}

        {/* Magic link form */}
        {tab === 'magic' && (
          magicSent ? (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <div style={{ fontSize: 52, marginBottom: 16 }}>📧</div>
              <p style={{ fontWeight: 700, color: 'white', fontSize: 18, marginBottom: 8 }}>Check your inbox</p>
              <p style={{ fontSize: 14, color: '#4A7FBB', lineHeight: 1.6 }}>
                We sent a magic login link to<br />
                <strong style={{ color: 'white' }}>{email}</strong>
              </p>
              <button onClick={() => setMagicSent(false)} style={{ marginTop: 24, padding: '10px 24px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#4A7FBB', borderRadius: 8, fontFamily: 'Outfit, sans-serif', fontSize: 13, cursor: 'pointer' }}>
                ← Use a different email
              </button>
            </div>
          ) : (
            <form onSubmit={handleMagicLink}>
              <div style={{ marginBottom: 24 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#4A7FBB', marginBottom: 8, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="you@yourbusiness.com.au" required style={inp} />
                <p style={{ fontSize: 12, color: '#4A7FBB', marginTop: 8 }}>We&apos;ll email you a one-click login link — no password needed.</p>
              </div>
              <button type="submit" disabled={loading} style={{
                width: '100%', padding: '15px', background: '#E8622A', color: 'white',
                border: 'none', borderRadius: 12, fontFamily: 'Outfit, sans-serif', fontSize: 16, fontWeight: 700,
                cursor: loading ? 'not-allowed' : 'pointer',
              }}>
                {loading ? '⚡ Sending…' : 'Send Magic Link →'}
              </button>
            </form>
          )
        )}

        {/* Divider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '28px 0' }}>
          <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.07)' }} />
          <span style={{ fontSize: 12, color: '#4A7FBB' }}>New to Talkmate?</span>
          <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.07)' }} />
        </div>

        <a href="/register" style={{
          display: 'block', width: '100%', padding: '14px', textAlign: 'center',
          background: 'transparent', border: '1.5px solid rgba(74,159,232,0.3)', borderRadius: 12,
          color: '#4A9FE8', fontFamily: 'Outfit, sans-serif', fontSize: 15, fontWeight: 600,
          textDecoration: 'none', transition: 'border-color 0.15s',
        }}>
          Create an account →
        </a>

        {/* Trust badges */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginTop: 36, flexWrap: 'wrap' }}>
          {['🔒 SSL Secured', '🇦🇺 Australian Made', '⚡ Setup in 15 min'].map(b => (
            <span key={b} style={{ fontSize: 12, color: '#4A7FBB', display: 'flex', alignItems: 'center', gap: 4 }}>{b}</span>
          ))}
        </div>
      </div>

      <style>{`
        @media (min-width: 1024px) {
          .lg-flex { display: flex !important; }
          .lg-hidden { display: none !important; }
        }
      `}</style>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#061322' }} />}>
      <LoginPageInner />
    </Suspense>
  )
}
