'use client'

// Accept-invite page — Session 11.
// URL: /accept-invite?token=<plaintext>
//
// 1. Looks up the invite via /api/auth/accept-invite (action='lookup').
// 2. Shows the business + role.
// 3. User sets a password; we POST again with action='accept' which
//    creates the Supabase Auth user and links the staff_members row.
// 4. We then sign the user in with the new password and redirect to
//    the dashboard.

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import PasswordStrength from '@/components/portal/password-strength'
import { validatePassword } from '@/lib/password'

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={null}>
      <AcceptInviteInner />
    </Suspense>
  )
}

function AcceptInviteInner() {
  const router = useRouter()
  const params = useSearchParams()
  const token = params.get('token') ?? ''

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [invite, setInvite] = useState<{
    email: string
    full_name: string
    role: 'staff' | 'manager'
    business_name: string | null
  } | null>(null)

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!token) {
      setError('Missing invite token. Ask the account owner to resend the invite.')
      setLoading(false)
      return
    }
    let cancelled = false
    fetch('/api/auth/accept-invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'lookup', token }),
    })
      .then(async r => {
        const data = await r.json()
        if (!r.ok || !data.ok) throw new Error(data.error ?? 'Invalid invite.')
        if (!cancelled) {
          setInvite({
            email: data.email,
            full_name: data.full_name,
            role: data.role,
            business_name: data.business_name,
          })
        }
      })
      .catch(e => { if (!cancelled) setError((e as Error).message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [token])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!invite) return
    setError(null)
    const ruleErr = validatePassword(password)
    if (ruleErr) { setError(ruleErr); return }
    if (password !== confirm) { setError('Passwords do not match.'); return }

    setSubmitting(true)
    try {
      const res = await fetch('/api/auth/accept-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'accept', token, password }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error(data.error ?? 'Could not accept invite.')

      // Sign the user in so the portal layout has a session.
      const supabase = createClient()
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: invite.email, password,
      })
      if (signInErr) {
        // Account was created but auto-login failed — point them at login.
        router.push('/login')
        return
      }
      router.push('/dashboard')
    } catch (e) {
      setError((e as Error).message)
      setSubmitting(false)
    }
  }

  return (
    <div style={shell}>
      <div style={card}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, marginBottom: 6 }}>Accept your invite</h1>
        <p style={{ fontSize: 13, color: '#7BAED4', margin: 0, marginBottom: 20 }}>Set a password to finish creating your TalkMate account.</p>

        {loading && <p style={{ color: '#7BAED4', fontSize: 13 }}>Checking your invite…</p>}

        {error && !invite && (
          <div style={{ padding: 14, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, color: '#EF4444', fontSize: 13, marginBottom: 14 }}>
            {error}
          </div>
        )}

        {invite && (
          <>
            <div style={{ background: '#071829', padding: 14, borderRadius: 10, marginBottom: 18, border: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ fontSize: 11, color: '#4A7FBB', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>You&apos;re joining</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'white', marginBottom: 4 }}>{invite.business_name ?? '—'}</div>
              <div style={{ fontSize: 12, color: '#7BAED4' }}>
                as <strong style={{ color: 'white' }}>{invite.role === 'manager' ? 'Manager' : 'Staff'}</strong> · {invite.email}
              </div>
            </div>

            <form onSubmit={submit}>
              <Field label="Password">
                <input type="password" autoComplete="new-password" required
                  value={password} onChange={e => setPassword(e.target.value)} style={inp} />
                <PasswordStrength password={password} />
              </Field>
              <Field label="Confirm password">
                <input type="password" autoComplete="new-password" required
                  value={confirm} onChange={e => setConfirm(e.target.value)} style={inp} />
              </Field>

              {error && (
                <p style={{ color: '#EF4444', fontSize: 12, margin: '0 0 12px 0' }}>{error}</p>
              )}

              <button type="submit" disabled={submitting || !password || !confirm} style={submitting ? btnDisabled : btn}>
                {submitting ? 'Setting up…' : 'Accept & continue'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontSize: 12, color: '#4A7FBB', fontWeight: 600, marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  )
}

const shell: React.CSSProperties = {
  minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: '#061322', padding: 24, fontFamily: 'Outfit, sans-serif', color: 'white',
}
const card: React.CSSProperties = {
  width: '100%', maxWidth: 460, padding: 32, borderRadius: 16,
  background: '#0A1E38', border: '1px solid rgba(255,255,255,0.08)',
}
const inp: React.CSSProperties = {
  width: '100%', padding: '10px 12px', background: '#071829',
  border: '1px solid rgba(255,255,255,0.08)', color: 'white',
  borderRadius: 9, fontSize: 13, outline: 'none', boxSizing: 'border-box',
  fontFamily: 'Outfit, sans-serif',
}
const btn: React.CSSProperties = {
  width: '100%', padding: '12px 18px', background: '#E8622A', color: 'white',
  border: 'none', borderRadius: 9, fontSize: 14, fontWeight: 700, cursor: 'pointer',
  fontFamily: 'Outfit, sans-serif',
}
const btnDisabled: React.CSSProperties = {
  ...btn, background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.4)', cursor: 'not-allowed',
}
