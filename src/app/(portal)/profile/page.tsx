'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function ProfilePage() {
  const supabase = createClient()

  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [nameBusy, setNameBusy] = useState(false)
  const [nameMsg, setNameMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pwBusy, setPwBusy] = useState(false)
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setEmail(user.email ?? '')
        setFullName((user.user_metadata?.full_name as string) ?? '')
      }
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function saveName(e: React.FormEvent) {
    e.preventDefault()
    setNameBusy(true); setNameMsg(null)
    try {
      const { error } = await supabase.auth.updateUser({ data: { full_name: fullName } })
      if (error) throw error
      setNameMsg({ ok: true, text: 'Name updated.' })
    } catch (err) {
      setNameMsg({ ok: false, text: (err as Error).message })
    } finally {
      setNameBusy(false)
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault()
    setPwMsg(null)
    if (newPassword !== confirmPassword) {
      setPwMsg({ ok: false, text: 'New passwords do not match.' }); return
    }
    if (newPassword.length < 8) {
      setPwMsg({ ok: false, text: 'Password must be at least 8 characters.' }); return
    }
    setPwBusy(true)
    try {
      // Verify current password first
      const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password: currentPassword })
      if (signInErr) throw new Error('Current password is incorrect.')
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error
      setPwMsg({ ok: true, text: 'Password changed successfully.' })
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('')
    } catch (err) {
      setPwMsg({ ok: false, text: (err as Error).message })
    } finally {
      setPwBusy(false)
    }
  }

  const card: React.CSSProperties = {
    background: '#0A1E38',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 16,
    padding: '28px 32px',
    marginBottom: 24,
  }

  const inp: React.CSSProperties = {
    width: '100%',
    padding: '12px 14px',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 10,
    color: 'white',
    fontSize: 14,
    fontFamily: 'Outfit, sans-serif',
    outline: 'none',
    boxSizing: 'border-box',
  }

  const label: React.CSSProperties = {
    display: 'block',
    fontSize: 11,
    fontWeight: 700,
    color: '#4A7FBB',
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    marginBottom: 7,
  }

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '32px 24px', fontFamily: 'Outfit, sans-serif', color: 'white' }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 6 }}>My Profile</h1>
      <p style={{ fontSize: 14, color: '#4A7FBB', marginBottom: 32 }}>Manage your name and password.</p>

      {/* Name */}
      <div style={card}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 20 }}>Account Details</div>
        <form onSubmit={saveName}>
          <div style={{ marginBottom: 16 }}>
            <label style={label}>Full Name</label>
            <input style={inp} value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Your name" />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={label}>Email</label>
            <input style={{ ...inp, opacity: 0.5, cursor: 'not-allowed' }} value={email} disabled />
            <p style={{ fontSize: 12, color: '#4A7FBB', marginTop: 6 }}>To change your email, contact hello@talkmate.com.au</p>
          </div>
          {nameMsg && (
            <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 8, fontSize: 13, background: nameMsg.ok ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', color: nameMsg.ok ? '#22C55E' : '#EF4444', border: `1px solid ${nameMsg.ok ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}` }}>
              {nameMsg.text}
            </div>
          )}
          <button type="submit" disabled={nameBusy} style={{ padding: '11px 28px', background: '#E8622A', color: 'white', border: 'none', borderRadius: 10, fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 14, cursor: nameBusy ? 'wait' : 'pointer', opacity: nameBusy ? 0.7 : 1 }}>
            {nameBusy ? 'Saving…' : 'Save Name'}
          </button>
        </form>
      </div>

      {/* Password */}
      <div style={card}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Change Password</div>
        <p style={{ fontSize: 13, color: '#4A7FBB', marginBottom: 20 }}>You&apos;ll need your current password to set a new one.</p>
        <form onSubmit={changePassword}>
          <div style={{ marginBottom: 14 }}>
            <label style={label}>Current Password</label>
            <input type="password" style={inp} value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} placeholder="••••••••" required />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={label}>New Password</label>
            <input type="password" style={inp} value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="••••••••" required minLength={8} />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={label}>Confirm New Password</label>
            <input type="password" style={inp} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="••••••••" required minLength={8} />
          </div>
          {pwMsg && (
            <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 8, fontSize: 13, background: pwMsg.ok ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', color: pwMsg.ok ? '#22C55E' : '#EF4444', border: `1px solid ${pwMsg.ok ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}` }}>
              {pwMsg.text}
            </div>
          )}
          <button type="submit" disabled={pwBusy} style={{ padding: '11px 28px', background: '#E8622A', color: 'white', border: 'none', borderRadius: 10, fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 14, cursor: pwBusy ? 'wait' : 'pointer', opacity: pwBusy ? 0.7 : 1 }}>
            {pwBusy ? 'Updating…' : 'Change Password'}
          </button>
        </form>
      </div>
    </div>
  )
}
