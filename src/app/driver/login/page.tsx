'use client'

// Sessions 36-37 — driver sign-in page. Mobile-first, deliberately
// minimal: a driver opens this at the start of every shift, so the
// fewer pixels between them and "online" the better.
//
// Drivers do not self-register — there is no "create account" link.
// They reach the app via an invite-acceptance URL that points to
// /driver/invite/[token].

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const BRAND = {
  orange: '#E8622A',
  navy: '#061322',
  grey: '#6b7280',
}

export default function DriverLoginPage() {
  return (
    <Suspense fallback={null}>
      <DriverLoginInner />
    </Suspense>
  )
}

function DriverLoginInner() {
  const router = useRouter()
  const params = useSearchParams()
  const nextUrl = params.get('next') ?? '/driver/dashboard'
  const supabase = createClient()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    if (signInError) {
      setError('Incorrect email or password.')
      setLoading(false)
      return
    }
    // The middleware does the drivers-row check on the next request.
    window.location.href = nextUrl
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: BRAND.navy,
      fontFamily: 'Outfit, sans-serif',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
      color: '#fff',
    }}>
      <div style={{ width: '100%', maxWidth: 380 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.5px' }}>TalkMate</div>
          <div style={{ marginTop: 6, fontSize: 14, opacity: 0.7 }}>Driver portal</div>
        </div>

        <form onSubmit={submit}>
          <label style={{ display: 'block', fontSize: 13, marginBottom: 6, opacity: 0.8 }}>Email</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            autoComplete="email"
            inputMode="email"
            style={{
              width: '100%',
              padding: '14px 16px',
              borderRadius: 10,
              border: '1px solid rgba(255,255,255,0.15)',
              background: 'rgba(255,255,255,0.05)',
              color: '#fff',
              fontSize: 15,
              fontFamily: 'inherit',
              outline: 'none',
              marginBottom: 14,
            }}
          />

          <label style={{ display: 'block', fontSize: 13, marginBottom: 6, opacity: 0.8 }}>Password</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            style={{
              width: '100%',
              padding: '14px 16px',
              borderRadius: 10,
              border: '1px solid rgba(255,255,255,0.15)',
              background: 'rgba(255,255,255,0.05)',
              color: '#fff',
              fontSize: 15,
              fontFamily: 'inherit',
              outline: 'none',
              marginBottom: 18,
            }}
          />

          {error && (
            <div style={{
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              color: '#fecaca',
              padding: '10px 14px',
              borderRadius: 8,
              fontSize: 14,
              marginBottom: 16,
            }}>{error}</div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '15px 16px',
              borderRadius: 10,
              background: BRAND.orange,
              color: '#fff',
              border: 'none',
              fontSize: 16,
              fontWeight: 700,
              cursor: loading ? 'wait' : 'pointer',
              fontFamily: 'inherit',
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 24, fontSize: 13, opacity: 0.6 }}>
          New drivers — open the invite link from your SMS or email.
        </div>
      </div>
    </div>
  )
}
