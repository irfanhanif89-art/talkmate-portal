import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import OverviewTable from './overview-table'

export const metadata: Metadata = { title: 'Client Overview' }
export const dynamic = 'force-dynamic'

interface OverviewRow {
  id: string
  name: string
  plan: string | null
  agent_phone_number: string | null
  account_status: string | null
  tos_accepted_at: string | null
  tos_accepted_version: string | null
  welcome_email_sent: boolean | null
  manual_next_billing_date: string | null
  owner_user_id: string
  owner_email: string | null
  owner_last_sign_in_at: string | null
  calls_this_month: number
  next_billing_date: string | null
}

export default async function ClientOverviewPage() {
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
      id, name, plan, agent_phone_number, account_status,
      tos_accepted_at, tos_accepted_version, welcome_email_sent,
      manual_next_billing_date, owner_user_id
    `)
    .order('created_at', { ascending: false })

  // Fetch owners + last sign in. We can pull this from auth.users via the
  // listUsers admin endpoint — cheaper than per-user calls.
  const { data: usersList } = await admin.auth.admin.listUsers({ perPage: 1000 })
  const userById = new Map<string, { email: string | null; last_sign_in_at: string | null }>()
  for (const u of usersList?.users ?? []) {
    userById.set(u.id, { email: u.email ?? null, last_sign_in_at: u.last_sign_in_at ?? null })
  }

  // Calls this month per business — single roundtrip then aggregate locally.
  const startOfMonth = new Date(); startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0)
  const { data: callRows } = await admin
    .from('calls')
    .select('business_id')
    .gte('created_at', startOfMonth.toISOString())
  const callsBy = new Map<string, number>()
  for (const r of callRows ?? []) {
    callsBy.set(r.business_id as string, (callsBy.get(r.business_id as string) ?? 0) + 1)
  }

  // Next billing date — Stripe subscription's current_period_end overrides
  // the manual date when present.
  const { data: subs } = await admin
    .from('subscriptions')
    .select('business_id, current_period_end, status')
    .in('status', ['active', 'trialing', 'past_due'])
  const subEndBy = new Map<string, string>()
  for (const s of subs ?? []) {
    if (s.current_period_end) subEndBy.set(s.business_id as string, s.current_period_end)
  }

  const rows: OverviewRow[] = (businesses ?? []).map(b => {
    const owner = userById.get(b.owner_user_id) ?? { email: null, last_sign_in_at: null }
    return {
      id: b.id,
      name: b.name,
      plan: b.plan,
      agent_phone_number: b.agent_phone_number ?? null,
      account_status: b.account_status,
      tos_accepted_at: b.tos_accepted_at,
      tos_accepted_version: b.tos_accepted_version,
      welcome_email_sent: b.welcome_email_sent,
      manual_next_billing_date: b.manual_next_billing_date,
      owner_user_id: b.owner_user_id,
      owner_email: owner.email,
      owner_last_sign_in_at: owner.last_sign_in_at,
      calls_this_month: callsBy.get(b.id) ?? 0,
      next_billing_date: subEndBy.get(b.id) ?? b.manual_next_billing_date ?? null,
    }
  })

  return (
    <div style={{ padding: 28, maxWidth: 1400, margin: '0 auto', color: '#F2F6FB' }}>
      <Link href="/admin/clients" style={{ fontSize: 13, color: '#7BAED4', textDecoration: 'none' }}>← Client management</Link>
      <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'white', marginTop: 8, marginBottom: 4 }}>Client overview</h1>
      <p style={{ fontSize: 13, color: '#7BAED4', marginBottom: 22, lineHeight: 1.6 }}>
        One row per client. All columns sortable. Spot accounts that haven&apos;t been onboarded fully or have stalled.
      </p>
      <OverviewTable rows={rows} />
    </div>
  )
}
