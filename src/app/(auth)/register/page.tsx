'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { BUSINESS_TYPE_LABELS, type BusinessType } from '@/lib/business-types'

export default function RegisterPage() {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    firstName: '', email: '', password: '', businessName: '', businessType: '' as BusinessType | ''
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

    // Now sign in on the client so session cookie is set
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: form.email,
      password: form.password,
    })
    if (signInError) { setError('Account created — please sign in'); router.push('/login'); return }

    router.push('/onboarding')
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
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: '#E8622A' }}>
            <svg viewBox="0 0 36 36" width="24" height="24" fill="none">
              <rect x="6" y="8" width="24" height="5" rx="2.5" fill="white"/>
              <rect x="14" y="8" width="8" height="22" rx="2.5" fill="white"/>
            </svg>
          </div>
          <div className="flex items-baseline">
            <span style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 800, letterSpacing: '-1px', color: 'white', fontSize: '1.5rem' }}>talk</span>
            <span style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 300, letterSpacing: '3px', color: '#4A9FE8', fontSize: '1.5rem' }}>mate</span>
          </div>
        </div>

        <h1 className="text-2xl font-bold text-white mb-1">Get started free</h1>
        <p className="text-sm mb-7" style={{ color: '#4A7FBB' }}>Set up your AI voice agent in 10 minutes</p>

        {error && (
          <div className="mb-5 p-3 rounded-lg text-sm" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-sm mb-2 block" style={{ color: '#4A7FBB' }}>First name</Label>
              <Input value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))}
                placeholder="Michael" required style={inputStyle} />
            </div>
            <div>
              <Label className="text-sm mb-2 block" style={{ color: '#4A7FBB' }}>Email</Label>
              <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="michael@business.com.au" required style={inputStyle} />
            </div>
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
