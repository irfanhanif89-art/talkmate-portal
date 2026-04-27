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

    // Call server-side API route (uses service role to bypass RLS)
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
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
