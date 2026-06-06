import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { computeRoiForBusinessList } from '@/lib/roi'
import { fetchReadinessByBusiness } from '@/lib/onboarding-admin'
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
  // Session 56: dropped PostgREST embedded join `sales_reps:sales_rep_id(full_name)`.
  // The schema cache for that FK has been stale since Session 41 — prod silently
  // returned empty rep names in the CLOSED BY REP column. Adding `.eq('is_demo', false)`
  // made the same broken embed fail hard with PGRST200. Fetch separately and map.
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
      kb_sync_status, winback_enabled, review_requests_enabled,
      agent_name, integration_mode, go_live_gate_passed,
      servicem8_enabled, industry_pack_applied
    `)
    .eq('is_demo', false)
    .order('created_at', { ascending: false })

  const repIds = Array.from(new Set(
    (businessesRaw ?? [])
      .map(b => (b as { sales_rep_id: string | null }).sales_rep_id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0),
  ))
  const repNameById: Record<string, string> = {}
  if (repIds.length > 0) {
    const { data: repRows } = await admin
      .from('sales_reps')
      .select('id, full_name')
      .in('id', repIds)
    for (const r of (repRows ?? []) as Array<{ id: string; full_name: string }>) {
      repNameById[r.id] = r.full_name
    }
  }

  // Sprint Session 1 follow-up — aggregate unread SMS per business so
  // the admin clients list can show a single number per row. Pull all
  // active conversations once and reduce client-side; the partial
  // idx_sms_conversations_business_id index keeps this O(n).
  const { data: unreadRows } = await admin
    .from('sms_conversations')
    .select('business_id, unread_count')
    .eq('status', 'active')
  const unreadByBusiness: Record<string, number> = {}
  for (const r of (unreadRows ?? []) as Array<{ business_id: string; unread_count: number | null }>) {
    unreadByBusiness[r.business_id] = (unreadByBusiness[r.business_id] ?? 0) + (r.unread_count ?? 0)
  }

  // Session 4A — go-live readiness percent per business, batched in a single
  // query (no per-row fetch) so the list can show a "Readiness"-style "Mode"
  // chip + readiness without N+1.
  const readinessByBusiness = await fetchReadinessByBusiness(
    admin,
    (businessesRaw ?? []).map(b => (b as { id: string }).id),
  )

  const businesses = (businessesRaw ?? []).map(b => {
    const rid = (b as { sales_rep_id: string | null }).sales_rep_id
    const bid = (b as { id: string }).id
    return {
      ...b,
      sales_rep_name: rid ? (repNameById[rid] ?? null) : null,
      unread_sms: unreadByBusiness[bid] ?? 0,
      readiness_percent: readinessByBusiness[bid]?.completionPercent ?? null,
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

  // Sprint Session 2 — per-business this-month recovered-revenue ROI, chat-lead
  // count and chatbot-enabled flag for the three new list columns. Batch pass,
  // not N+1.
  const roiByBusiness = await computeRoiForBusinessList(admin)

  // Session 6C — three new admin clients-list columns: unread AI emails,
  // pending transcript gaps, and calls flagged for review (last 30d). Batched
  // parallel aggregates scoped to the (non-demo) businesses on this list, not
  // joined onto the main query.
  const bizIds = (businessesRaw ?? []).map(b => (b as { id: string }).id)
  const cutoff30 = new Date(Date.now() - 30 * day).toISOString()
  const [emailRowsRes, gapRowsRes, flaggedRowsRes] = bizIds.length > 0
    ? await Promise.all([
        admin.from('email_threads').select('business_id, unread_count').gt('unread_count', 0).in('business_id', bizIds),
        admin.from('transcript_gaps').select('business_id').eq('status', 'pending').in('business_id', bizIds),
        admin.from('calls').select('business_id').eq('needs_review', true).gte('created_at', cutoff30).in('business_id', bizIds),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }]

  const emailUnreadByBusiness: Record<string, number> = {}
  for (const r of (emailRowsRes.data ?? []) as Array<{ business_id: string; unread_count: number | null }>) {
    emailUnreadByBusiness[r.business_id] = (emailUnreadByBusiness[r.business_id] ?? 0) + (r.unread_count ?? 0)
  }
  const gapsByBusiness: Record<string, number> = {}
  for (const r of (gapRowsRes.data ?? []) as Array<{ business_id: string }>) {
    gapsByBusiness[r.business_id] = (gapsByBusiness[r.business_id] ?? 0) + 1
  }
  const flaggedByBusiness: Record<string, number> = {}
  for (const r of (flaggedRowsRes.data ?? []) as Array<{ business_id: string }>) {
    flaggedByBusiness[r.business_id] = (flaggedByBusiness[r.business_id] ?? 0) + 1
  }

  return (
    <div style={{ padding: 28, maxWidth: 1300, margin: '0 auto', color: '#F2F6FB' }}>
      <Link href="/admin" style={{ fontSize: 13, color: '#7BAED4', textDecoration: 'none' }}>← Admin</Link>
      <AdminClientsView
        initialBusinesses={businesses ?? []}
        partners={partners ?? []}
        qualityByBusiness={qualityByBusiness}
        roiByBusiness={roiByBusiness}
        emailUnreadByBusiness={emailUnreadByBusiness}
        gapsByBusiness={gapsByBusiness}
        flaggedByBusiness={flaggedByBusiness}
      />
    </div>
  )
}
