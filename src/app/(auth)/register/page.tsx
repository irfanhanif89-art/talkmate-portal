'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { BUSINESS_TYPE_LABELS, type BusinessType } from '@/lib/business-types'

export default function RegisterPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    fullName: '', email: '', password: '', businessName: '', businessType: '' as BusinessType | ''
  })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.businessType) { setError('Please select a business type'); return }
    setLoading(true); setError('')

    // Session 4B — forward referral code from /refer/[code] -> /register?ref=CODE.
    const ref = typeof window !== 'undefined'
      ? (new URLSearchParams(window.location.search).get('ref') ?? undefined)
      : undefined

    // Call server-side API route (uses service role to bypass RLS)
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, ref }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error ?? 'Something went wrong'); setLoading(false); return }

    window.location.href = `/verify-email?email=${encodeURIComponent(form.email)}`
  }

  const inputStyle = {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.12)',
    color: 'white',
    width: '100%',
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12" style={{ background: '#061322' }}>
      <div className="w-full max-w-lg p-8 rounded-2xl border" style={{ background: '#0A1E38', borderColor: 'rgba(232,98,42,0.2)' }}>

        {/* Logo */}
        <div className="mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-lockup-dark.svg" alt="TalkMate" style={{ height: 48, width: 'auto', display: 'block' }} />
        </div>

        <h1 className="text-2xl font-bold text-white mb-1">Get started free</h1>
        <p className="text-sm mb-7" style={{ color: '#4A7FBB' }}>Set up your AI voice agent in 10 minutes</p>

        {error && (
          <div className="mb-5 p-3 rounded-lg text-sm" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label className="text-sm mb-2 block" style={{ color: '#4A7FBB' }}>Full name</Label>
            <Input value={form.fullName} onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))}
              placeholder="Michael Smith" required style={inputStyle} />
          </div>

          <div>
            <Label className="text-sm mb-2 block" style={{ color: '#4A7FBB' }}>Email</Label>
            <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              placeholder="michael@business.com.au" required style={inputStyle} />
          </div>

          <div>
            <Label className="text-sm mb-2 block" style={{ color: '#4A7FBB' }}>Password</Label>
            <Input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              minLength={8} required style={inputStyle} />
          </div>

          <div>
            <Label className="text-sm mb-2 block" style={{ color: '#4A7FBB' }}>Business name</Label>
            <Input value={form.businessName} onChange={e => setForm(f => ({ ...f, businessName: e.target.value }))}
              placeholder="My Business Pty Ltd" required style={inputStyle} />
          </div>

          <div>
            <Label className="text-sm mb-2 block" style={{ color: '#4A7FBB' }}>Business type</Label>
            <select
              value={form.businessType}
              onChange={e => setForm(f => ({ ...f, businessType: e.target.value as BusinessType }))}
              required
              style={{
                ...inputStyle,
                padding: '10px 12px',
                borderRadius: '8px',
                fontSize: '14px',
                appearance: 'auto',
                cursor: 'pointer',
              }}
            >
              <option value="" disabled style={{ background: '#0A1E38' }}>Select your business type…</option>
              {Object.entries(BUSINESS_TYPE_LABELS).map(([key, label]) => (
                <option key={key} value={key} style={{ background: '#0A1E38', color: 'white' }}>{label}</option>
              ))}
            </select>
          </div>

          <Button type="submit" disabled={loading} className="w-full font-semibold py-3 mt-2"
            style={{ background: '#E8622A', color: 'white', border: 'none' }}>
            {loading ? 'Creating your account…' : 'Create Account & Start Setup →'}
          </Button>
        </form>

        <p className="text-center text-sm mt-6" style={{ color: '#4A7FBB' }}>
          Already have an account?{' '}
          <a href="/login" style={{ color: '#4A9FE8', textDecoration: 'none' }}>Sign in</a>
        </p>
      </div>
    </div>
  )
}
