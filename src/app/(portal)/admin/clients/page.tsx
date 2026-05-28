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
  const { data: businessesRaw } = await admin
    .from('businesses')
    .select(`
      id, name, phone_number, address, website, abn, industry, plan,
      account_status, onboarded_by, agent_status, agent_phone_number,
      welcome_email_sent, stripe_payment_link, stripe_customer_id,
      billing_override_note, manual_next_billing_date,
      onboarding_completed, owner_user_id,
      tos_accepted_at, tos_accepted_version, temp_password,
      created_at, signup_at,
      notifications_config,
      services, trade_type,
      trial_start_date, trial_end_date, trial_converted_at,
      onboarding_complete, onboarding_complete_at,
      sms_used_this_month,
      golive_verified, golive_verified_at,
      billing_cycle, setup_fee_waived, setup_fee_amount,
      sales_rep_id,
      sales_reps:sales_rep_id(full_name)
    `)
    .eq('is_demo', false)
    .order('created_at', { ascending: false })

  const businesses = (businessesRaw ?? []).map(b => {
    const repRel = (b as { sales_reps?: { full_name: string } | { full_name: string }[] | null }).sales_reps
    const rep = Array.isArray(repRel) ? repRel[0] : repRel
    return {
      ...b,
      sales_rep_name: rep?.full_name ?? null,
    }
  })

  const { data: partners } = await admin
    .from('businesses')
    .select('id, name')
    .eq('is_partner', true)
    .eq('is_demo', false)
    .order('name')

  // Session 18 — compute per-business quality summary for the dot
  // indicator. Last 7d average + count of critical calls today.
  const day = 24 * 60 * 60 * 1000
  const cutoff7 = new Date(Date.now() - 7 * day).toISOString()
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
  const todayMs = todayStart.getTime()

  const { data: scoredCalls } = await admin
    .from('calls')
    .select('business_id, intelligence_score, intelligence_status, created_at')
    .gte('created_at', cutoff7)
    .not('intelligence_status', 'is', null)
    .limit(5000)

  const qualityByBusiness: Record<string, { avg: number | null; criticalToday: number; count: number }> = {}
  for (const r of (scoredCalls ?? []) as Array<{
    business_id: string
    intelligence_score: number | null
    intelligence_status: string | null
    created_at: string
  }>) {
    const bucket = qualityByBusiness[r.business_id] ?? { avg: null, criticalToday: 0, count: 0 }
    if (typeof r.intelligence_score === 'number') {
      bucket.avg = ((bucket.avg ?? 0) * bucket.count + r.intelligence_score) / (bucket.count + 1)
      bucket.count++
    }
    const t = Date.parse(r.created_at)
    if (Number.isFinite(t) && t >= todayMs && r.intelligence_status === 'critical') {
      bucket.criticalToday++
    }
    qualityByBusiness[r.business_id] = bucket
  }

  return (
    <div style={{ padding: 28, maxWidth: 1300, margin: '0 auto', color: '#F2F6FB' }}>
      <Link href="/admin" style={{ fontSize: 13, color: '#7BAED4', textDecoration: 'none' }}>← Admin</Link>
      <AdminClientsView
        initialBusinesses={businesses ?? []}
        partners={partners ?? []}
        qualityByBusiness={qualityByBusiness}
      />
    </div>
  )
}
