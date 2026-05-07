'use client'

import { useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

// This page:
// 1. Signs out the current admin session
// 2. Redirects to the magic link (which signs in as the client)
// This is needed because magic links don't work when another session is active.

function ViewAsInner() {
  const searchParams = useSearchParams()
  const url = searchParams.get('url')

  useEffect(() => {
    if (!url) return
    const supabase = createClient()
    supabase.auth.signOut().then(() => {
      window.location.href = decodeURIComponent(url)
    })
  }, [url])

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
      <p style={{ fontSize: 16, color: '#7BAED4' }}>Switching to client view…</p>
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
