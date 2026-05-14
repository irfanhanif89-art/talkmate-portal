'use client'

// /settings/security — Session 11.
//
// Three sections:
//   1. Two-factor authentication (TOTP via Supabase mfa.enroll)
//   2. Change password (current → new, with strength meter)
//   3. Team Access — invite staff/manager users (owner only)
//
// The page is visible to every authenticated portal user. Staff/manager
// users still get to change their own password and toggle MFA on their
// own login; only the Team Access section is gated to owners.

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import PasswordStrength from '@/components/portal/password-strength'
import { validatePassword } from '@/lib/password'
import { useRole } from '@/hooks/use-role'

interface TotpFactor {
  id: string
  status: 'unverified' | 'verified'
}

interface StaffRow {
  id: string
  email: string
  full_name: string
  role: 'staff' | 'manager'
  active: boolean
  accepted_at: string | null
  invited_at: string
}

export default function SecuritySettingsPage() {
  const supabase = useMemo(() => createClient(), [])
  const { role, clientId, loading: roleLoading } = useRole()

  return (
    <div style={{ padding: 28, maxWidth: 880, margin: '0 auto' }}>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: 'white', margin: 0, marginBottom: 6 }}>Security</h1>
        <p style={{ color: '#7BAED4', fontSize: 14, margin: 0 }}>
          Two-factor authentication, password, and team access.
        </p>
      </header>

      <MfaCard supabase={supabase} />
      <PasswordCard supabase={supabase} />
      {!roleLoading && role === 'owner' && clientId && (
        <TeamAccessCard supabase={supabase} clientId={clientId} />
      )}
    </div>
  )
}

// ── MFA ─────────────────────────────────────────────────────────────────

function MfaCard({ supabase }: { supabase: ReturnType<typeof createClient> }) {
  const [loading, setLoading] = useState(true)
  const [factor, setFactor] = useState<TotpFactor | null>(null)
  const [enrolling, setEnrolling] = useState(false)
  const [qr, setQr] = useState<string | null>(null)
  const [secret, setSecret] = useState<string | null>(null)
  const [factorId, setFactorId] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  async function loadFactors() {
    setLoading(true)
    const { data } = await supabase.auth.mfa.listFactors()
    const totp = data?.totp?.[0] as TotpFactor | undefined
    setFactor(totp ?? null)
    setLoading(false)
  }

  useEffect(() => { loadFactors() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [])

  async function startEnrol() {
    setErr(null); setMsg(null); setEnrolling(true)
    try {
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' })
      if (error) throw error
      // Supabase returns an SVG QR + secret string we can also show.
      const totp = (data as { totp?: { qr_code?: string; secret?: string } }).totp ?? {}
      setQr(totp.qr_code ?? null)
      setSecret(totp.secret ?? null)
      setFactorId(data.id)
    } catch (e) {
      setErr((e as Error).message)
      setEnrolling(false)
    }
  }

  async function verifyEnrol() {
    if (!factorId || !code) return
    setErr(null); setMsg(null)
    try {
      const { data: challenge, error: cErr } = await supabase.auth.mfa.challenge({ factorId })
      if (cErr || !challenge) throw cErr ?? new Error('challenge failed')
      const { error: vErr } = await supabase.auth.mfa.verify({
        factorId, challengeId: challenge.id, code,
      })
      if (vErr) throw vErr
      setMsg('✓ Two-factor authentication enabled.')
      setEnrolling(false)
      setQr(null); setSecret(null); setFactorId(null); setCode('')
      await loadFactors()
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  async function disable() {
    if (!factor) return
    if (!confirm('Disable two-factor authentication? You will be able to log in with just your password.')) return
    setErr(null); setMsg(null)
    const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id })
    if (error) { setErr(error.message); return }
    setMsg('Two-factor authentication disabled.')
    await loadFactors()
  }

  if (loading) return <Section title="Two-factor authentication"><p style={{ color: '#7BAED4', fontSize: 13 }}>Loading…</p></Section>

  if (factor?.status === 'verified') {
    return (
      <Section title="Two-factor authentication">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 99, background: 'rgba(34,197,94,0.15)', color: '#22C55E' }}>
            ✓ ENABLED
          </span>
          <span style={{ fontSize: 13, color: '#C8D8EA' }}>Two-factor authentication is active on your account.</span>
        </div>
        <button onClick={disable} style={btn('outline')}>Disable 2FA</button>
        {msg && <p style={{ color: '#22C55E', fontSize: 12, marginTop: 10 }}>{msg}</p>}
        {err && <p style={{ color: '#EF4444', fontSize: 12, marginTop: 10 }}>{err}</p>}
      </Section>
    )
  }

  return (
    <Section title="Two-factor authentication">
      {!enrolling ? (
        <>
          <p style={{ color: '#C8D8EA', fontSize: 13, margin: 0, marginBottom: 14 }}>
            Add an extra layer of security. Once enabled, you&apos;ll need your authenticator app to log in.
          </p>
          <button onClick={startEnrol} style={btn('primary')}>Enable two-factor authentication</button>
        </>
      ) : (
        <>
          <p style={{ color: '#7BAED4', fontSize: 13, margin: 0, marginBottom: 14 }}>
            Scan this QR code with Google Authenticator, 1Password, or any TOTP app. Then enter the 6-digit code to confirm.
          </p>
          {qr && (
            <div style={{ background: 'white', borderRadius: 10, padding: 14, display: 'inline-block', marginBottom: 12 }}>
              {/* Supabase returns an SVG string; render via dangerouslySetInnerHTML is safe — it's the SDK output. */}
              <div dangerouslySetInnerHTML={{ __html: qr }} style={{ width: 180, height: 180 }} />
            </div>
          )}
          {secret && (
            <p style={{ fontSize: 11, color: '#4A7FBB', margin: '0 0 14px 0', fontFamily: 'monospace' }}>
              Or enter this secret manually: <strong style={{ color: 'white' }}>{secret}</strong>
            </p>
          )}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
            <input
              value={code}
              onChange={e => setCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
              placeholder="123456"
              autoFocus
              inputMode="numeric"
              style={inp(180)}
            />
            <button onClick={verifyEnrol} disabled={code.length !== 6} style={btn(code.length === 6 ? 'primary' : 'disabled')}>
              Verify & enable
            </button>
            <button onClick={() => { setEnrolling(false); setQr(null); setSecret(null); setFactorId(null) }} style={btn('outline')}>Cancel</button>
          </div>
          {err && <p style={{ color: '#EF4444', fontSize: 12, marginTop: 6 }}>{err}</p>}
        </>
      )}
    </Section>
  )
}

// ── Password change ─────────────────────────────────────────────────────

function PasswordCard({ supabase }: { supabase: ReturnType<typeof createClient> }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null); setMsg(null)
    const ruleErr = validatePassword(next)
    if (ruleErr) { setErr(ruleErr); return }
    if (next !== confirm) { setErr('New password and confirmation do not match.'); return }
    setBusy(true)
    try {
      // Re-verify current password by attempting a sign-in. Supabase
      // doesn't expose a direct "verify current" endpoint, but a
      // password sign-in is cheap and doesn't invalidate the existing
      // session (a fresh access token is issued and replaces the
      // current one transparently).
      const { data: { user } } = await supabase.auth.getUser()
      if (!user?.email) throw new Error('Not authenticated.')
      const { error: verifyErr } = await supabase.auth.signInWithPassword({
        email: user.email, password: current,
      })
      if (verifyErr) throw new Error('Current password is incorrect.')

      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: next }),
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error ?? 'Failed to change password.')
      setMsg('✓ Password updated.')
      setCurrent(''); setNext(''); setConfirm('')
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Section title="Change password">
      <form onSubmit={submit}>
        <Field label="Current password">
          <input type="password" autoComplete="current-password" value={current}
            onChange={e => setCurrent(e.target.value)} required style={inp()} />
        </Field>
        <Field label="New password">
          <input type="password" autoComplete="new-password" value={next}
            onChange={e => setNext(e.target.value)} required style={inp()} />
          <PasswordStrength password={next} />
        </Field>
        <Field label="Confirm new password">
          <input type="password" autoComplete="new-password" value={confirm}
            onChange={e => setConfirm(e.target.value)} required style={inp()} />
        </Field>
        <button type="submit" disabled={busy || !current || !next || !confirm} style={btn(busy ? 'disabled' : 'primary')}>
          {busy ? 'Saving…' : 'Save new password'}
        </button>
        {msg && <p style={{ color: '#22C55E', fontSize: 12, marginTop: 10 }}>{msg}</p>}
        {err && <p style={{ color: '#EF4444', fontSize: 12, marginTop: 10 }}>{err}</p>}
      </form>
    </Section>
  )
}

// ── Team Access (owner only) ────────────────────────────────────────────

function TeamAccessCard({ supabase, clientId }: { supabase: ReturnType<typeof createClient>; clientId: string }) {
  const [staff, setStaff] = useState<StaffRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showInvite, setShowInvite] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteName, setInviteName] = useState('')
  const [inviteRole, setInviteRole] = useState<'staff' | 'manager'>('staff')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('staff_members')
      .select('id, email, full_name, role, active, accepted_at, invited_at')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
    setStaff((data as StaffRow[]) ?? [])
    setLoading(false)
  }
  useEffect(() => { load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [clientId])

  async function sendInvite() {
    setErr(null); setMsg(null); setBusy(true)
    try {
      const res = await fetch('/api/portal/staff/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail.trim().toLowerCase(), full_name: inviteName.trim(), role: inviteRole }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error(data.error ?? 'Could not send invite.')
      setMsg(`✓ Invite sent to ${inviteEmail}.`)
      setInviteEmail(''); setInviteName(''); setInviteRole('staff')
      setShowInvite(false)
      await load()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string) {
    if (!confirm('Remove this team member? Their portal access will be revoked.')) return
    const res = await fetch(`/api/portal/staff/${id}`, { method: 'DELETE' })
    if (res.ok) await load()
  }

  return (
    <Section title="Team access">
      <p style={{ color: '#7BAED4', fontSize: 13, margin: 0, marginBottom: 14 }}>
        Invite team members to access this portal. <strong>Staff</strong> can view calls and contacts; <strong>Managers</strong> can also edit services, team, and routing.
      </p>

      {loading ? (
        <p style={{ color: '#7BAED4', fontSize: 13 }}>Loading…</p>
      ) : staff.length === 0 ? (
        <p style={{ color: '#4A7FBB', fontSize: 13, fontStyle: 'italic' }}>No team members yet.</p>
      ) : (
        <div style={{ overflowX: 'auto', marginBottom: 14 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: '#4A7FBB', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                <th style={th}>Name</th>
                <th style={th}>Email</th>
                <th style={th}>Role</th>
                <th style={th}>Status</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {staff.map(s => (
                <tr key={s.id} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={td}>{s.full_name}</td>
                  <td style={td}>{s.email}</td>
                  <td style={td}>{s.role === 'manager' ? 'Manager' : 'Staff'}</td>
                  <td style={td}>{s.accepted_at ? <span style={{ color: '#22C55E' }}>✓ Active</span> : <span style={{ color: '#F59E0B' }}>Invited</span>}</td>
                  <td style={{ ...td, textAlign: 'right' }}>
                    <button onClick={() => remove(s.id)} style={{ ...btn('outline'), padding: '4px 10px', fontSize: 11 }}>Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!showInvite ? (
        <button onClick={() => setShowInvite(true)} style={btn('primary')}>Invite team member</button>
      ) : (
        <div style={{ background: '#071829', borderRadius: 10, padding: 16, border: '1px solid rgba(255,255,255,0.05)' }}>
          <Field label="Email"><input value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} type="email" style={inp()} /></Field>
          <Field label="Full name"><input value={inviteName} onChange={e => setInviteName(e.target.value)} style={inp()} /></Field>
          <Field label="Role">
            <select value={inviteRole} onChange={e => setInviteRole(e.target.value as 'staff' | 'manager')} style={inp()}>
              <option value="staff">Staff — view only</option>
              <option value="manager">Manager — can edit services, team, routing</option>
            </select>
          </Field>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={sendInvite} disabled={busy || !inviteEmail || !inviteName} style={btn(busy || !inviteEmail || !inviteName ? 'disabled' : 'primary')}>
              {busy ? 'Sending…' : 'Send invite'}
            </button>
            <button onClick={() => setShowInvite(false)} style={btn('outline')}>Cancel</button>
          </div>
        </div>
      )}

      {msg && <p style={{ color: '#22C55E', fontSize: 12, marginTop: 10 }}>{msg}</p>}
      {err && <p style={{ color: '#EF4444', fontSize: 12, marginTop: 10 }}>{err}</p>}
    </Section>
  )
}

// ── presentational helpers ──────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ background: '#0A1E38', borderRadius: 16, border: '1px solid rgba(255,255,255,0.06)', padding: 24, marginBottom: 16 }}>
      <h2 style={{ fontSize: 15, fontWeight: 700, color: 'white', margin: 0, marginBottom: 14 }}>{title}</h2>
      {children}
    </section>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: 12, color: '#4A7FBB', fontWeight: 600, marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  )
}

function inp(width: number | string = '100%'): React.CSSProperties {
  return {
    width, padding: '10px 12px', background: '#071829',
    border: '1px solid rgba(255,255,255,0.08)', color: 'white',
    borderRadius: 9, fontSize: 13, fontFamily: 'Outfit, sans-serif', outline: 'none',
    boxSizing: 'border-box',
  }
}

function btn(kind: 'primary' | 'outline' | 'disabled'): React.CSSProperties {
  if (kind === 'primary') {
    return {
      padding: '10px 18px', background: '#E8622A', color: 'white', border: 'none',
      borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer',
      fontFamily: 'Outfit, sans-serif',
    }
  }
  if (kind === 'disabled') {
    return {
      padding: '10px 18px', background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.4)',
      border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'not-allowed',
      fontFamily: 'Outfit, sans-serif',
    }
  }
  return {
    padding: '10px 18px', background: 'transparent',
    border: '1px solid rgba(255,255,255,0.1)', color: '#C8D8EA',
    borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer',
    fontFamily: 'Outfit, sans-serif',
  }
}

const th: React.CSSProperties = { padding: '6px 8px', fontWeight: 700 }
const td: React.CSSProperties = { padding: '10px 8px', color: '#C8D8EA' }
