'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [magicSent, setMagicSent] = useState(false)

  async function handlePassword(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError(error.message); setLoading(false); return }
    router.push('/dashboard')
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/dashboard` }
    })
    if (error) { setError(error.message); setLoading(false); return }
    setMagicSent(true); setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#061322' }}>
      <div className="w-full max-w-md p-8 rounded-2xl border" style={{ background: '#0A1E38', borderColor: 'rgba(232,98,42,0.2)' }}>
        {/* Logo */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: '#E8622A' }}>
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

        <h1 className="text-2xl font-bold text-white mb-2">Welcome back</h1>
        <p className="text-sm mb-8" style={{ color: '#4A7FBB' }}>Sign in to your Talkmate portal</p>

        {error && (
          <div className="mb-4 p-3 rounded-lg text-sm" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}>
            {error}
          </div>
        )}

        <Tabs defaultValue="password">
          <TabsList className="w-full mb-6" style={{ background: 'rgba(255,255,255,0.05)' }}>
            <TabsTrigger value="password" className="flex-1">Password</TabsTrigger>
            <TabsTrigger value="magic" className="flex-1">Magic Link</TabsTrigger>
          </TabsList>

          <TabsContent value="password">
            <form onSubmit={handlePassword} className="space-y-4">
              <div>
                <Label className="text-sm mb-2 block" style={{ color: '#4A7FBB' }}>Email</Label>
                <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@business.com.au" required
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }} />
              </div>
              <div>
                <Label className="text-sm mb-2 block" style={{ color: '#4A7FBB' }}>Password</Label>
                <Input type="password" value={password} onChange={e => setPassword(e.target.value)} required
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }} />
              </div>
              <Button type="submit" disabled={loading} className="w-full font-semibold py-3"
                style={{ background: '#E8622A', color: 'white', border: 'none' }}>
                {loading ? 'Signing in…' : 'Sign In'}
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="magic">
            {magicSent ? (
              <div className="text-center py-6">
                <div className="text-4xl mb-4">📧</div>
                <p className="font-semibold text-white mb-2">Check your inbox</p>
                <p className="text-sm" style={{ color: '#4A7FBB' }}>We sent a login link to {email}</p>
              </div>
            ) : (
              <form onSubmit={handleMagicLink} className="space-y-4">
                <div>
                  <Label className="text-sm mb-2 block" style={{ color: '#4A7FBB' }}>Email</Label>
                  <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@business.com.au" required
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }} />
                </div>
                <Button type="submit" disabled={loading} className="w-full font-semibold py-3"
                  style={{ background: '#E8622A', color: 'white', border: 'none' }}>
                  {loading ? 'Sending…' : 'Send Magic Link'}
                </Button>
              </form>
            )}
          </TabsContent>
        </Tabs>

        <p className="text-center text-sm mt-6" style={{ color: '#4A7FBB' }}>
          No account?{' '}
          <a href="/register" style={{ color: '#4A9FE8' }}>Sign up free</a>
        </p>
      </div>
    </div>
  )
}
