import { NextResponse } from 'next/server'
import { requireSalesRep } from '@/lib/sales-auth'
import { createAdminClient } from '@/lib/supabase/server'

// In-flight stages shown on the kanban (in display order).
// 'lost' and 'bad_lead' deliberately omitted — reachable via filter chip /
// Mark Lost modal / admin only.
const KANBAN_STAGES: Array<{ id: string; label: string }> = [
  { id: 'new',           label: 'New' },
  { id: 'contacted',     label: 'Contacted' },
  { id: 'demo_booked',   label: 'Demo Booked' },
  { id: 'demo_done',     label: 'Demo Done' },
  { id: 'proposal_sent', label: 'Proposal Sent' },
  { id: 'nurture',       label: 'Nurture' },
  { id: 'won',           label: 'Won' },
]

export async function GET(req: Request) {
  const auth = await requireSalesRep(req)
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const admin = createAdminClient()
  const { data: leads, error } = await admin
    .from('leads')
    .select('id, business_name, contact_name, status, won_plan, updated_at')
    .eq('assigned_to', auth.rep.id)
    .neq('status', 'lost')
    .neq('status', 'bad_lead')
    .order('updated_at', { ascending: false })

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  const grouped = KANBAN_STAGES.map(stage => ({
    id: stage.id,
    label: stage.label,
    count: leads?.filter(l => l.status === stage.id).length ?? 0,
    leads: leads?.filter(l => l.status === stage.id) ?? [],
  }))

  return NextResponse.json({ ok: true, stages: grouped })
}
