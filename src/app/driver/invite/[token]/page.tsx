'use client'

// Sessions 36-37 — driver invite acceptance page.
//
// URL: /driver/invite/<token>
//
// 1. On mount we GET /api/driver/invite/<token> to confirm the invite
//    is still pending and hydrate the welcome copy.
// 2. The driver picks a password (we use the existing validatePassword).
// 3. On submit we POST /api/driver/invite/accept which creates the
//    auth user + drivers row, then we sign in via supabase client and
//    redirect to /driver/dashboard.

import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { validatePassword } from '@/lib/password'

const BRAND = {
  orange: '#E8622A',
  navy: '#061322',
  grey: '#6b7280',
}

interface InvitePreview {
  email: string
  name: string
  phone: string | null
  truck_type: string | null
  business_name: string
}

export default function DriverInvitePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = use(params)
  const router = useRouter()
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [invite, setInvite] = useState<InvitePreview | null>(null)

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/driver/invite/${token}`)
      .then(async r => {
        const data = await r.json()
        if (!r.ok || !data.ok) throw new Error(data.error ?? 'Invalid invite link')
        if (!cancelled) setInvite(data.invite as InvitePreview)
      })
      .catch(e => { if (!cancelled) setError((e as Error).message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [token])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!invite) return
    setError(null)
    const pwErr = validatePassword(password)
    if (pwErr) { setError(pwErr); return }
    if (password !== confirm) { setError('Passwords do not match'); return }

    setSubmitting(true)
    try {
      const res = await fetch('/api/driver/invite/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error(data.error ?? 'Could not complete signup')

      // Sign the new user in.
      const { error: signErr } = await supabase.auth.signInWithPassword({
        email: invite.email,
        password,
      })
      if (signErr) throw new Error(signErr.message)
      window.location.href = '/driver/dashboard'
    } catch (e) {
      setError((e as Error).message)
      setSubmitting(false)
    }
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
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.5px' }}>TalkMate</div>
        </div>

        {loading && <div style={{ textAlign: 'center', opacity: 0.7 }}>Checking your invite…</div>}

        {!loading && error && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            color: '#fecaca',
            padding: '14px 16px',
            borderRadius: 10,
            fontSize: 14,
          }}>
            {error}
          </div>
        )}

        {!loading && invite && (
          <>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, lineHeight: 1.3 }}>
              Welcome {invite.name},
            </h1>
            <p style={{ fontSize: 15, opacity: 0.85, marginTop: 8, marginBottom: 28 }}>
              You have been invited to join <strong>{invite.business_name}</strong> as a driver. Set a password to finish setting up your account.
            </p>

            <form onSubmit={submit}>
              <label style={{ display: 'block', fontSize: 13, marginBottom: 6, opacity: 0.8 }}>Email</label>
              <input
                type="email"
                value={invite.email}
                disabled
                style={{
                  width: '100%',
                  padding: '14px 16px',
                  borderRadius: 10,
                  border: '1px solid rgba(255,255,255,0.1)',
                  background: 'rgba(255,255,255,0.03)',
                  color: 'rgba(255,255,255,0.65)',
                  fontSize: 15,
                  fontFamily: 'inherit',
                  marginBottom: 14,
                }}
              />

              <label style={{ display: 'block', fontSize: 13, marginBottom: 6, opacity: 0.8 }}>New password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="new-password"
                style={{
                  width: '100%',
                  padding: '14px 16px',
                  borderRadius: 10,
                  border: '1px solid rgba(255,255,255,0.15)',
                  background: 'rgba(255,255,255,0.05)',
                  color: '#fff',
                  fontSize: 15,
                  fontFamily: 'inherit',
                  marginBottom: 14,
                  outline: 'none',
                }}
              />

              <label style={{ display: 'block', fontSize: 13, marginBottom: 6, opacity: 0.8 }}>Confirm password</label>
              <input
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                required
                autoComplete="new-password"
                style={{
                  width: '100%',
                  padding: '14px 16px',
                  borderRadius: 10,
                  border: '1px solid rgba(255,255,255,0.15)',
                  background: 'rgba(255,255,255,0.05)',
                  color: '#fff',
                  fontSize: 15,
                  fontFamily: 'inherit',
                  marginBottom: 18,
                  outline: 'none',
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
                disabled={submitting}
                style={{
                  width: '100%',
                  padding: '15px 16px',
                  borderRadius: 10,
                  background: BRAND.orange,
                  color: '#fff',
                  border: 'none',
                  fontSize: 16,
                  fontWeight: 700,
                  cursor: submitting ? 'wait' : 'pointer',
                  fontFamily: 'inherit',
                  opacity: submitting ? 0.7 : 1,
                }}
              >
                {submitting ? 'Setting up…' : 'Set up account'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
