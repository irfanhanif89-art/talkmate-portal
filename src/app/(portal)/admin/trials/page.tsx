import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import TrialsView from './trials-view'

export const metadata: Metadata = { title: 'Active Trials' }
export const dynamic = 'force-dynamic'

export default async function AdminTrialsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: userProfile } = await supabase.from('users').select('role').eq('id', user.id).single()
  // Set ADMIN_EMAIL in Vercel environment variables
  const isSuperAdmin =
    user.email === process.env.INTERNAL_ALERT_EMAIL ||
    user.email === process.env.ADMIN_EMAIL ||
    user.email === 'hello@talkmate.com.au'
  if (userProfile?.role !== 'admin' && !isSuperAdmin) redirect('/dashboard')

  const admin = createAdminClient()
  const { data: trials } = await admin
    .from('businesses')
    .select(`
      id, name, industry, plan, account_status,
      trial_start_date, trial_end_date, trial_converted_at,
      created_at
    `)
    .eq('account_status', 'trial')
    .order('trial_end_date', { ascending: true })

  return (
    <div style={{ padding: 28, maxWidth: 1300, margin: '0 auto', color: '#F2F6FB' }}>
      <Link href="/admin/clients" style={{ fontSize: 13, color: '#7BAED4', textDecoration: 'none' }}>← Client Management</Link>
      <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'white', margin: '8px 0 22px 0' }}>Active Trials</h1>
      <TrialsView initial={trials ?? []} />
    </div>
  )
}
