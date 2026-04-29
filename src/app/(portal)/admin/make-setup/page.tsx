import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import MakeSetupClient from './make-setup-client'

export const metadata: Metadata = { title: 'Make.com Setup' }
export const dynamic = 'force-dynamic'

export default async function MakeSetupPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: userProfile } = await supabase.from('users').select('role').eq('id', user.id).single()
  const isSuperAdmin = user.email === process.env.INTERNAL_ALERT_EMAIL || user.email === 'hello@talkmate.com.au'
  if (userProfile?.role !== 'admin' && !isSuperAdmin) redirect('/dashboard')

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.talkmate.com.au'

  return (
    <div style={{ padding: 28, maxWidth: 1000, margin: '0 auto', color: '#F2F6FB' }}>
      <Link href="/admin" style={{ fontSize: 13, color: '#7BAED4', textDecoration: 'none' }}>← Admin</Link>
      <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'white', marginTop: 8, marginBottom: 8 }}>
        Make.com setup — Contact pipeline
      </h1>
      <p style={{ fontSize: 14, color: '#7BAED4', marginBottom: 24, lineHeight: 1.6, maxWidth: 720 }}>
        After every Vapi call ends, Make.com runs an extraction prompt against the transcript and
        POSTs the structured contact data to TalkMate. This page documents the wiring and lets
        you test the connection.
      </p>

      <MakeSetupClient baseUrl={baseUrl} />
    </div>
  )
}
