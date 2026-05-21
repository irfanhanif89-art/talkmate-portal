import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import ContractorsView, { type ContractorRow, type PipelineRow } from './contractors-view'

export const metadata: Metadata = { title: 'Contractors' }
export const dynamic = 'force-dynamic'

const ADMIN_EMAILS = ['hello@talkmate.com.au', 'irfanhanif89@gmail.com']

export default async function AdminContractorsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const isSuperAdmin = !!user.email && ADMIN_EMAILS.includes(user.email)
  if (!isSuperAdmin) {
    const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).maybeSingle()
    if (profile?.role !== 'admin') redirect('/dashboard')
  }

  const admin = createAdminClient()
  const { data: contractors } = await admin
    .from('contractors')
    .select('id, first_name, last_name, email, phone, abn, status, agreement_signed_at, signed_pdf_url, created_at, invite_expires_at, termination_date, sales_rep_id')
    .order('created_at', { ascending: false })

  const ids = (contractors ?? []).map(c => c.id)
  const commissionsByContractor = new Map<string, number>()
  if (ids.length > 0) {
    const { data: comms } = await admin
      .from('contractor_commissions')
      .select('contractor_id, commission_amount, status')
      .in('contractor_id', ids)
    for (const row of comms ?? []) {
      if (row.status === 'paid' || row.status === 'cleared') {
        const cid = row.contractor_id as string
        commissionsByContractor.set(cid, (commissionsByContractor.get(cid) ?? 0) + Number(row.commission_amount ?? 0))
      }
    }
  }

  const rows: ContractorRow[] = (contractors ?? []).map(c => ({
    id: c.id,
    first_name: c.first_name,
    last_name: c.last_name,
    email: c.email,
    phone: c.phone,
    abn: c.abn,
    status: c.status as ContractorRow['status'],
    agreement_signed_at: c.agreement_signed_at,
    signed_pdf_url: c.signed_pdf_url,
    created_at: c.created_at,
    invite_expires_at: c.invite_expires_at,
    termination_date: c.termination_date,
    earned_commission: commissionsByContractor.get(c.id) ?? 0,
    sales_rep_id: c.sales_rep_id ?? null,
  }))

  // Pipeline tab: aggregate leads + commissions for any contractor that has
  // been provisioned a sales_reps row (i.e. went through Session 25's
  // unified flow). Reps without leads still show with zeros.
  const repIds = rows
    .map(r => r.sales_rep_id)
    .filter((v): v is string => typeof v === 'string' && v.length > 0)
  const contractorByRepId = new Map<string, ContractorRow>()
  for (const r of rows) if (r.sales_rep_id) contractorByRepId.set(r.sales_rep_id, r)

  const pipeline: PipelineRow[] = []
  if (repIds.length > 0) {
    const [{ data: leadRows }, { data: commRows }] = await Promise.all([
      admin.from('leads').select('assigned_to, status').in('assigned_to', repIds),
      admin.from('commissions').select('rep_id, commission_amount, status').in('rep_id', repIds),
    ])

    const leadsByRep = new Map<string, number>()
    const wonByRep = new Map<string, number>()
    for (const l of leadRows ?? []) {
      const rid = l.assigned_to as string | null
      if (!rid) continue
      leadsByRep.set(rid, (leadsByRep.get(rid) ?? 0) + 1)
      if (l.status === 'won') wonByRep.set(rid, (wonByRep.get(rid) ?? 0) + 1)
    }

    const earnedByRep = new Map<string, number>()
    for (const c of commRows ?? []) {
      const rid = c.rep_id as string | null
      if (!rid) continue
      if (c.status === 'approved' || c.status === 'paid') {
        earnedByRep.set(rid, (earnedByRep.get(rid) ?? 0) + Number(c.commission_amount ?? 0))
      }
    }

    for (const rid of repIds) {
      const contractor = contractorByRepId.get(rid)
      if (!contractor) continue
      pipeline.push({
        contractor_id: contractor.id,
        rep_id: rid,
        rep_name: `${contractor.first_name} ${contractor.last_name}`.trim(),
        leads_in_pipeline: leadsByRep.get(rid) ?? 0,
        deals_won: wonByRep.get(rid) ?? 0,
        commission_earned: earnedByRep.get(rid) ?? 0,
      })
    }
  }

  return <ContractorsView contractors={rows} pipeline={pipeline} />
}
