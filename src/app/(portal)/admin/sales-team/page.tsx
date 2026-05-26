import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import AdminSalesTeamView, { type AdminCommissionRow, type AdminLeadRow, type AdminRepRow } from './admin-sales-team-view'

export const metadata: Metadata = { title: 'Sales Team' }
export const dynamic = 'force-dynamic'

// Set ADMIN_EMAIL in Vercel environment variables
const ADMIN_EMAILS = ['hello@talkmate.com.au', process.env.ADMIN_EMAIL].filter(Boolean) as string[]

export default async function AdminSalesTeamPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const isSuperAdmin = user.email && ADMIN_EMAILS.includes(user.email)
  if (!isSuperAdmin) {
    const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).maybeSingle()
    if (profile?.role !== 'admin') redirect('/dashboard')
  }

  const admin = createAdminClient()

  // Fetch reps with their lead/won/commission rollups in parallel.
  // Session 43: also fetch all reps (legacy + contractor-flow) so the
  // Reassign Lead modal can offer every active destination rep, AND
  // so the leads tab can resolve rep names for contractor-flow reps
  // (previously showed "Unassigned" for any lead owned by a non-legacy rep).
  const [
    { data: reps },
    { data: allReps },
    { data: leads },
    { data: commissions },
    { data: contracts },
  ] = await Promise.all([
    admin.from('sales_reps')
      .select('id, full_name, email, phone, status, contract_signed_at, policy_acknowledged_at, created_at, team_id')
      // Session 25: this page now manages legacy manually-onboarded reps
      // only. Contractor-flow reps live on /admin/contractors.
      .eq('is_legacy', true)
      .order('created_at', { ascending: false }),
    admin.from('sales_reps')
      .select('id, full_name, status')
      .order('full_name', { ascending: true }),
    admin.from('leads')
      .select('id, business_name, contact_name, phone, email, industry, status, approval_status, won_plan, won_at, business_id, created_at, assigned_to, approval_notes')
      .order('created_at', { ascending: false }),
    admin.from('commissions')
      .select('id, rep_id, lead_id, business_id, plan, commission_amount, bonus_amount, status, created_at, paid_at, payment_reference, revoke_reason, clawback_period_ends_at, leads(business_name, won_billing_cycle)')
      .order('created_at', { ascending: false }),
    admin.from('rep_contracts')
      .select('id, rep_id, document_name, status, sent_at, signed_at')
      .order('sent_at', { ascending: false }),
  ])

  // Per-rep rollups
  const leadCountByRep = new Map<string, number>()
  const wonCountByRep = new Map<string, number>()
  for (const l of leads ?? []) {
    if (l.assigned_to) {
      leadCountByRep.set(l.assigned_to, (leadCountByRep.get(l.assigned_to) ?? 0) + 1)
      if (l.status === 'won') {
        wonCountByRep.set(l.assigned_to, (wonCountByRep.get(l.assigned_to) ?? 0) + 1)
      }
    }
  }

  const commByRep = new Map<string, number>()
  for (const c of commissions ?? []) {
    if (c.rep_id && (c.status === 'approved' || c.status === 'paid')) {
      const total = Number(c.commission_amount ?? 0) + Number(c.bonus_amount ?? 0)
      commByRep.set(c.rep_id, (commByRep.get(c.rep_id) ?? 0) + total)
    }
  }

  // Latest contract per rep
  const latestContractByRep = new Map<string, { status: string; signed_at: string | null; document_name: string }>()
  for (const ct of contracts ?? []) {
    if (!latestContractByRep.has(ct.rep_id)) {
      latestContractByRep.set(ct.rep_id, { status: ct.status, signed_at: ct.signed_at, document_name: ct.document_name })
    }
  }

  // Build the rep-name lookup from ALL reps (legacy + contractor-flow)
  // so leads/commissions/audit-trail can always resolve a name.
  const repNameById = new Map<string, string>()
  for (const r of allReps ?? []) {
    repNameById.set(r.id, r.full_name)
  }

  const repRows: AdminRepRow[] = (reps ?? []).map(r => {
    repNameById.set(r.id, r.full_name)
    return {
      id: r.id,
      full_name: r.full_name,
      email: r.email,
      phone: r.phone,
      status: r.status,
      contract_signed_at: r.contract_signed_at,
      policy_acknowledged_at: r.policy_acknowledged_at,
      created_at: r.created_at,
      leads_count: leadCountByRep.get(r.id) ?? 0,
      won_count: wonCountByRep.get(r.id) ?? 0,
      commission_earned: commByRep.get(r.id) ?? 0,
      contract_status: latestContractByRep.get(r.id)?.status ?? null,
      contract_signed_on: latestContractByRep.get(r.id)?.signed_at ?? null,
    }
  })

  const leadRows: AdminLeadRow[] = (leads ?? []).map(l => ({
    id: l.id,
    business_name: l.business_name,
    contact_name: l.contact_name,
    phone: l.phone,
    industry: l.industry,
    status: l.status,
    approval_status: l.approval_status as 'pending' | 'approved' | 'rejected' | null,
    won_plan: l.won_plan as 'starter' | 'growth' | 'pro' | null,
    won_at: l.won_at,
    business_id: l.business_id,
    created_at: l.created_at,
    rep_id: l.assigned_to,
    rep_name: l.assigned_to ? (repNameById.get(l.assigned_to) ?? 'Unassigned') : 'Unassigned',
    approval_notes: l.approval_notes,
  }))

  const commissionRows: AdminCommissionRow[] = (commissions ?? []).map(c => {
    const leadsField = c.leads as { business_name?: string; won_billing_cycle?: string } | Array<{ business_name?: string; won_billing_cycle?: string }> | null
    const leadObj = Array.isArray(leadsField) ? leadsField[0] : leadsField
    const business_name = leadObj?.business_name ?? '—'
    const billing_cycle = (leadObj?.won_billing_cycle === 'annual' ? 'annual' : 'monthly') as 'monthly' | 'annual'
    const base = Number(c.commission_amount ?? 0)
    const bonus = Number(c.bonus_amount ?? 0)
    return {
      id: c.id,
      rep_id: c.rep_id,
      rep_name: repNameById.get(c.rep_id) ?? 'Unknown rep',
      business_name,
      plan: c.plan,
      base,
      bonus,
      total: base + bonus,
      billing_cycle,
      status: c.status as AdminCommissionRow['status'],
      created_at: c.created_at,
      paid_at: c.paid_at,
      payment_reference: c.payment_reference,
      revoke_reason: c.revoke_reason,
      clawback_period_ends_at: c.clawback_period_ends_at ?? null,
    }
  })

  // Leaderboard — top 5 reps by won this month
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0)
  const wonThisMonth = new Map<string, number>()
  for (const l of leads ?? []) {
    if (l.status === 'won' && l.won_at && new Date(l.won_at) >= monthStart && l.assigned_to) {
      wonThisMonth.set(l.assigned_to, (wonThisMonth.get(l.assigned_to) ?? 0) + 1)
    }
  }
  const leaderboard = Array.from(wonThisMonth.entries())
    .map(([id, count]) => ({ rep_name: repNameById.get(id) ?? 'Unknown', count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)

  // Active destination reps for the ReassignLeadModal — drawn from
  // allReps so contractor-flow reps appear too.
  const allActiveReps = (allReps ?? [])
    .filter(r => r.status === 'active')
    .map(r => ({ id: r.id, full_name: r.full_name, status: r.status }))

  return (
    <AdminSalesTeamView
      reps={repRows}
      leads={leadRows}
      commissions={commissionRows}
      leaderboard={leaderboard}
      allActiveReps={allActiveReps}
    />
  )
}
