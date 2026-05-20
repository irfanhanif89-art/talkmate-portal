import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import ContractorsView, { type ContractorRow } from './contractors-view'

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
    .select('id, first_name, last_name, email, phone, abn, status, agreement_signed_at, signed_pdf_url, created_at, invite_expires_at, termination_date')
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
  }))

  return <ContractorsView contractors={rows} />
}
