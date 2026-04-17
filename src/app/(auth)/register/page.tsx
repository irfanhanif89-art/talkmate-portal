'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
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

    // 1. Create auth user
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: { data: { first_name: form.firstName } }
    })
    if (authError || !authData.user) { setError(authError?.message ?? 'Signup failed'); setLoading(false); return }

    // 2. Create business
    const { data: biz, error: bizError } = await supabase.from('businesses').insert({
      name: form.businessName,
      business_type: form.businessType,
      owner_user_id: authData.user.id,
    }).select().single()
    if (bizError || !biz) { setError(bizError?.message ?? 'Failed to create business'); setLoading(false); return }

    // 3. Create user profile
    await supabase.from('users').insert({
      id: authData.user.id,
      business_id: biz.id,
      email: form.email,
      role: 'owner',
    })

    // 4. Create onboarding record
    await supabase.from('onboarding_responses').insert({ business_id: biz.id })

    router.push('/onboarding')
  }

  return (
    <div className="min-h-screen flex items-center justify-center py-12" style={{ background: '#061322' }}>
      <div className="w-full max-w-lg p-8 rounded-2xl border" style={{ background: '#0A1E38', borderColor: 'rgba(232,98,42,0.2)' }}>
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: '#E8622A' }}>
            <svg viewBox="0 0 36 36" width="28" height="28">
              <rect x="6" y="8" width="24" height="5" rx="2.5" fill="white"/>
              <rect x="14" y="8" width="8" height="22" rx="2.5" fill="white"/>
            </svg>
          </div>
          <div>
            <span style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 800, letterSpacing: '-2px', color: 'white', fontSize: '1.4rem' }}>talk</span>
            <span style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 300, letterSpacing: '4px', color: '#4A9FE8', fontSize: '1.4rem' }}>mate</span>
          </div>
        </div>

        <h1 className="text-2xl font-bold text-white mb-2">Get started free</h1>
        <p className="text-sm mb-8" style={{ color: '#4A7FBB' }}>Set up your AI voice agent in 10 minutes</p>

        {error && (
          <div className="mb-4 p-3 rounded-lg text-sm" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}>{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-sm mb-2 block" style={{ color: '#4A7FBB' }}>First name</Label>
              <Input value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} placeholder="Michael" required
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }} />
            </div>
            <div>
              <Label className="text-sm mb-2 block" style={{ color: '#4A7FBB' }}>Email</Label>
              <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="michael@business.com.au" required
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }} />
            </div>
          </div>
          <div>
            <Label className="text-sm mb-2 block" style={{ color: '#4A7FBB' }}>Password</Label>
            <Input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} minLength={8} required
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }} />
          </div>
          <div>
            <Label className="text-sm mb-2 block" style={{ color: '#4A7FBB' }}>Business name</Label>
            <Input value={form.businessName} onChange={e => setForm(f => ({ ...f, businessName: e.target.value }))} placeholder="My Business Pty Ltd" required
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }} />
          </div>
          <div>
            <Label className="text-sm mb-2 block" style={{ color: '#4A7FBB' }}>Business type</Label>
            <Select onValueChange={val => setForm(f => ({ ...f, businessType: val as BusinessType }))}>
              <SelectTrigger style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }}>
                <SelectValue placeholder="Select your business type…" />
              </SelectTrigger>
              <SelectContent style={{ background: '#0A1E38', border: '1px solid rgba(255,255,255,0.1)' }}>
                {Object.entries(BUSINESS_TYPE_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key} style={{ color: 'white' }}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" disabled={loading} className="w-full font-semibold py-3 mt-2"
            style={{ background: '#E8622A', color: 'white', border: 'none' }}>
            {loading ? 'Creating your account…' : 'Create Account & Start Setup →'}
          </Button>
        </form>

        <p className="text-center text-sm mt-6" style={{ color: '#4A7FBB' }}>
          Already have an account?{' '}
          <a href="/login" style={{ color: '#4A9FE8' }}>Sign in</a>
        </p>
      </div>
    </div>
  )
}
