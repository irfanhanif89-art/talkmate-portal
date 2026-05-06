import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import AdminClientsView from './admin-clients-view'

export const metadata: Metadata = { title: 'Client Management' }
export const dynamic = 'force-dynamic'

export default async function AdminClientsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: userProfile } = await supabase.from('users').select('role').eq('id', user.id).single()
  const isSuperAdmin = user.email === process.env.INTERNAL_ALERT_EMAIL || user.email === 'hello@talkmate.com.au'
  if (userProfile?.role !== 'admin' && !isSuperAdmin) redirect('/dashboard')

  const admin = createAdminClient()
  const { data: businesses } = await admin
    .from('businesses')
    .select(`
      id, name, phone_number, address, website, abn, industry, plan,
      account_status, onboarded_by, agent_status, agent_phone_number,
      welcome_email_sent, stripe_payment_link, stripe_customer_id,
      billing_override_note, manual_next_billing_date,
      onboarding_completed, owner_user_id,
      tos_accepted_at, tos_accepted_version, temp_password,
      created_at, signup_at,
      notifications_config
    `)
    .order('created_at', { ascending: false })

  const { data: partners } = await admin
    .from('businesses')
    .select('id, name')
    .eq('is_partner', true)
    .order('name')

  return (
    <div style={{ padding: 28, maxWidth: 1300, margin: '0 auto', color: '#F2F6FB' }}>
      <Link href="/admin" style={{ fontSize: 13, color: '#7BAED4', textDecoration: 'none' }}>← Admin</Link>
      <AdminClientsView
        initialBusinesses={businesses ?? []}
        partners={partners ?? []}
      />
    </div>
  )
}
