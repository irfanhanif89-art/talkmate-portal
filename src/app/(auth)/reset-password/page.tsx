'use client'

// Dedicated password-reset page. The user lands here AFTER Supabase has
// exchanged their reset link for a session via /auth/callback, so they
// already have an authenticated session — no current password required.
// This avoids the catch-22 of the legacy /profile?reset=1 flow which
// asked users to enter the password they just told us they forgot.

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

function ResetPasswordInner() {
  const supabase = createClient()
  const searchParams = useSearchParams()
  const nextUrl = searchParams.get('next') ?? '/login?next=%2F'

  const [checking, setChecking] = useState(true)
  const [authenticated, setAuthenticated] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setEmail(user.email ?? '')
        setAuthenticated(true)
      }
      setChecking(false)
    })
  }, [supabase])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (password !== confirm) { setError('Passwords do not match.'); return }
    setBusy(true)
    const { error: updateErr } = await supabase.auth.updateUser({ password })
    if (updateErr) {
      setError(updateErr.message)
      setBusy(false)
      return
    }
    setDone(true)
    setBusy(false)
    setTimeout(() => { window.location.href = nextUrl }, 1500)
  }

  const inp: React.CSSProperties = {
    width: '100%', padding: '13px 16px', borderRadius: 10, fontFamily: 'Outfit, sans-serif',
    fontSize: 14, outline: 'none', background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)', color: 'white', boxSizing: 'border-box',
  }

  return (
    <div style={{ minHeight: '100vh', background: '#061322', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Outfit, sans-serif', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <a href="/login" style={{ color: '#4A7FBB', fontSize: 13, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 32 }}>← Back to login</a>

        {checking ? (
          <p style={{ color: '#7BAED4', fontSize: 14 }}>Checking your reset link…</p>
        ) : !authenticated ? (
          <>
            <h2 style={{ fontSize: 26, fontWeight: 800, color: 'white', marginBottom: 8 }}>Reset link expired</h2>
            <p style={{ fontSize: 14, color: '#4A7FBB', marginBottom: 24, lineHeight: 1.6 }}>
              This reset link is no longer valid. Request a new one and we&apos;ll email it to you.
            </p>
            <a href="/forgot-password" style={{
              display: 'inline-block', padding: '12px 22px', background: '#E8622A', color: 'white',
              border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 14, textDecoration: 'none',
            }}>Request a new link →</a>
          </>
        ) : done ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 52, marginBottom: 16 }}>✓</div>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: 'white', marginBottom: 8 }}>Password updated</h2>
            <p style={{ fontSize: 14, color: '#4A7FBB', lineHeight: 1.7 }}>
              Taking you back to TalkMate…
            </p>
          </div>
        ) : (
          <>
            <h2 style={{ fontSize: 26, fontWeight: 800, color: 'white', marginBottom: 8 }}>Set a new password</h2>
            <p style={{ fontSize: 14, color: '#4A7FBB', marginBottom: 28, lineHeight: 1.6 }}>
              {email ? <>Setting a new password for <strong style={{ color: 'white' }}>{email}</strong>.</> : 'Choose a new password for your TalkMate account.'}
            </p>

            {error && (
              <div style={{ marginBottom: 20, padding: '12px 16px', borderRadius: 10, background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)', fontSize: 14 }}>{error}</div>
            )}

            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#4A7FBB', marginBottom: 8, letterSpacing: '0.05em', textTransform: 'uppercase' }}>New password</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  aria-label="New password"
                  style={inp}
                />
              </div>
              <div style={{ marginBottom: 24 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#4A7FBB', marginBottom: 8, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Confirm new password</label>
                <input
                  type="password"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  placeholder="Re-enter the password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  aria-label="Confirm new password"
                  style={inp}
                />
              </div>
              <button type="submit" disabled={busy} style={{
                width: '100%', padding: '14px', background: busy ? '#7B3A1A' : '#E8622A', color: 'white',
                border: 'none', borderRadius: 12, fontFamily: 'Outfit, sans-serif', fontSize: 16, fontWeight: 700,
                cursor: busy ? 'not-allowed' : 'pointer',
              }}>
                {busy ? 'Saving…' : 'Save new password →'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#061322' }} />}>
      <ResetPasswordInner />
    </Suspense>
  )
}
