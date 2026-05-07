'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

// Admin impersonation relay page.
// Flow:
//   1. Admin clicks "View Client Portal" → API generates a magic link hashed_token
//   2. New tab opens this page with ?token=<hashed_token>&next=<destination>
//   3. We sign out the admin session, then call verifyOtp(token_hash) to sign in as the client
//   4. On success → redirect to destination (client's dashboard)
//   5. On failure → redirect to login with error

function ViewAsInner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [status, setStatus] = useState('Switching to client view…')

  useEffect(() => {
    const token = searchParams.get('token')
    const next = searchParams.get('next') ?? '/dashboard'

    if (!token) {
      router.replace('/login?error=missing_token')
      return
    }

    async function swap() {
      try {
        const supabase = createClient()

        // 1. Sign out the current admin session so cookies are clean
        await supabase.auth.signOut()

        // 2. Exchange the hashed token for a session using verifyOtp.
        //    This works without a PKCE code_verifier — correct for server-generated links.
        setStatus('Verifying session…')
        const { error } = await supabase.auth.verifyOtp({
          token_hash: token!,
          type: 'email',
        })

        if (error) {
          console.error('[view-as] verifyOtp failed:', error.message)
          router.replace(`/login?error=impersonate_failed`)
          return
        }

        // 3. Session is now set — go to client dashboard
        setStatus('Redirecting…')
        router.replace(decodeURIComponent(next))
      } catch (e) {
        console.error('[view-as] unexpected error:', e)
        router.replace('/login?error=impersonate_failed')
      }
    }

    swap()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{
      minHeight: '100vh',
      background: '#061322',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'Outfit, sans-serif',
      color: 'white',
      gap: 16,
    }}>
      <div style={{ fontSize: 32 }}>⚡</div>
      <p style={{ fontSize: 16, color: '#7BAED4' }}>{status}</p>
    </div>
  )
}

export default function ViewAsPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', background: '#061322', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#7BAED4', fontFamily: 'Outfit, sans-serif' }}>Loading…</p>
      </div>
    }>
      <ViewAsInner />
    </Suspense>
  )
}
