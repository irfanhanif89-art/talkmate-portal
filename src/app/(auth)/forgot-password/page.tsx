'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function ForgotPasswordPage() {
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError('')
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent('/profile?reset=1')}`,
    })
    if (error) { setError(error.message); setBusy(false); return }
    setSent(true); setBusy(false)
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

        {sent ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 52, marginBottom: 16 }}>📧</div>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: 'white', marginBottom: 8 }}>Check your email</h2>
            <p style={{ fontSize: 14, color: '#4A7FBB', lineHeight: 1.7 }}>
              We sent a password reset link to<br />
              <strong style={{ color: 'white' }}>{email}</strong><br /><br />
              Click the link in the email to set a new password.
            </p>
            <button onClick={() => setSent(false)} style={{ marginTop: 24, padding: '10px 24px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#4A7FBB', borderRadius: 8, fontFamily: 'Outfit, sans-serif', fontSize: 13, cursor: 'pointer' }}>
              Try a different email
            </button>
          </div>
        ) : (
          <>
            <h2 style={{ fontSize: 26, fontWeight: 800, color: 'white', marginBottom: 8 }}>Reset your password</h2>
            <p style={{ fontSize: 14, color: '#4A7FBB', marginBottom: 28, lineHeight: 1.6 }}>Enter your email and we&apos;ll send you a reset link.</p>

            {error && (
              <div style={{ marginBottom: 20, padding: '12px 16px', borderRadius: 10, background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)', fontSize: 14 }}>{error}</div>
            )}

            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: 24 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#4A7FBB', marginBottom: 8, letterSpacing: '0.05em', textTransform: 'uppercase' as const }}>Email address</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@yourbusiness.com.au" required style={inp} />
              </div>
              <button type="submit" disabled={busy} style={{
                width: '100%', padding: '14px', background: busy ? '#7B3A1A' : '#E8622A', color: 'white',
                border: 'none', borderRadius: 12, fontFamily: 'Outfit, sans-serif', fontSize: 16, fontWeight: 700,
                cursor: busy ? 'not-allowed' : 'pointer',
              }}>
                {busy ? 'Sending…' : 'Send Reset Link →'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
