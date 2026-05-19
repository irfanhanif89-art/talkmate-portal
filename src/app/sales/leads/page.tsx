import { createClient } from '@/lib/supabase/server'
import { requireSalesRep } from '@/lib/sales-auth'
import { redirect } from 'next/navigation'
import LeadsBoard, { type LeadRow } from '@/components/sales/leads-board'

export const dynamic = 'force-dynamic'

export default async function SalesLeadsPage() {
  const auth = await requireSalesRep()
  if (!auth.ok) redirect('/')

  const supabase = await createClient()
  const { data: leads } = await supabase
    .from('leads')
    .select(`
      id, business_name, contact_name, phone, email, industry, suburb, state,
      website, source, notes, status, approval_status, won_plan, won_at,
      lost_reason, bad_lead_reason, business_id, created_at, updated_at
    `)
    .eq('assigned_to', auth.rep.id)
    .order('updated_at', { ascending: false })

  return <LeadsBoard initialLeads={(leads ?? []) as LeadRow[]} repId={auth.rep.id} />
}
