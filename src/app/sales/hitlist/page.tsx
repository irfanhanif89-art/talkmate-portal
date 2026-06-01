import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import { requireSalesRep } from '@/lib/sales-auth'
import HitListClient, { type HitListItem } from '@/components/sales/HitListClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Hit List — TalkMate Sales HQ' }

interface LeadLite {
  id: string
  business_name: string
  contact_name: string | null
  status: string
  updated_at: string
}

export default async function HitListPage() {
  const auth = await requireSalesRep()
  if (!auth.ok) redirect('/')

  const admin = createAdminClient()
  const repId = auth.rep.id

  const nowIso = new Date().toISOString()
  const threeDaysAgo = new Date(Date.now() - 3 * 86_400_000).toISOString()
  const fiveDaysAgo = new Date(Date.now() - 5 * 86_400_000).toISOString()

  // These five queries are independent — run them in parallel rather than
  // awaiting each in sequence (was ~5 serial round-trips per Hit List load).
  const [
    { data: reminders },
    { data: coldProposals },
    { data: demoDone },
    { data: untouched },
    { data: contacted },
  ] = await Promise.all([
    // Priority 1 — call reminders past send_at, not dismissed
    admin
      .from('lead_followups')
      .select('id, lead_id, send_at, leads:leads(id, business_name, contact_name, status, updated_at)')
      .eq('rep_id', repId)
      .eq('type', 'call_reminder')
      .eq('status', 'sent')
      .is('dismissed_at', null)
      .lte('send_at', nowIso)
      .order('send_at', { ascending: true }),

    // Priority 2 — proposal_sent, no update in 3+ days
    admin
      .from('leads')
      .select('id, business_name, contact_name, status, updated_at')
      .eq('assigned_to', repId)
      .eq('status', 'proposal_sent')
      .lte('updated_at', threeDaysAgo)
      .order('updated_at', { ascending: true }),

    // Priority 3 — demo_done, no proposal sent (status still demo_done)
    admin
      .from('leads')
      .select('id, business_name, contact_name, status, updated_at')
      .eq('assigned_to', repId)
      .eq('status', 'demo_done')
      .order('updated_at', { ascending: true }),

    // Priority 4 — new leads, never contacted
    admin
      .from('leads')
      .select('id, business_name, contact_name, status, updated_at')
      .eq('assigned_to', repId)
      .eq('status', 'new')
      .order('updated_at', { ascending: true }),

    // Priority 5 — contacted, no demo in 5+ days
    admin
      .from('leads')
      .select('id, business_name, contact_name, status, updated_at')
      .eq('assigned_to', repId)
      .eq('status', 'contacted')
      .lte('updated_at', fiveDaysAgo)
      .order('updated_at', { ascending: true }),
  ])

  const items: HitListItem[] = []
  const seenLeadIds = new Set<string>()

  for (const r of (reminders ?? [])) {
    const leadObj = Array.isArray(r.leads) ? r.leads[0] : r.leads
    const lead = leadObj as LeadLite | null
    if (!lead) continue
    seenLeadIds.add(lead.id)
    items.push({
      priority: 1,
      reason: 'Follow-up due',
      reasonColor: '#ef4444',
      followupId: r.id,
      leadId: lead.id,
      businessName: lead.business_name,
      contactName: lead.contact_name,
      status: lead.status,
      updatedAt: lead.updated_at,
    })
  }

  for (const l of (coldProposals ?? []) as LeadLite[]) {
    if (seenLeadIds.has(l.id)) continue
    seenLeadIds.add(l.id)
    items.push({
      priority: 2,
      reason: 'Proposal has gone cold',
      reasonColor: '#E8622A',
      followupId: null,
      leadId: l.id,
      businessName: l.business_name,
      contactName: l.contact_name,
      status: l.status,
      updatedAt: l.updated_at,
    })
  }

  for (const l of (demoDone ?? []) as LeadLite[]) {
    if (seenLeadIds.has(l.id)) continue
    seenLeadIds.add(l.id)
    items.push({
      priority: 3,
      reason: 'Demo done, no proposal sent',
      reasonColor: '#f59e0b',
      followupId: null,
      leadId: l.id,
      businessName: l.business_name,
      contactName: l.contact_name,
      status: l.status,
      updatedAt: l.updated_at,
    })
  }

  for (const l of (untouched ?? []) as LeadLite[]) {
    if (seenLeadIds.has(l.id)) continue
    seenLeadIds.add(l.id)
    items.push({
      priority: 4,
      reason: 'Never contacted',
      reasonColor: '#4A9FE8',
      followupId: null,
      leadId: l.id,
      businessName: l.business_name,
      contactName: l.contact_name,
      status: l.status,
      updatedAt: l.updated_at,
    })
  }

  for (const l of (contacted ?? []) as LeadLite[]) {
    if (seenLeadIds.has(l.id)) continue
    seenLeadIds.add(l.id)
    items.push({
      priority: 5,
      reason: 'No demo booked yet',
      reasonColor: '#64748B',
      followupId: null,
      leadId: l.id,
      businessName: l.business_name,
      contactName: l.contact_name,
      status: l.status,
      updatedAt: l.updated_at,
    })
  }

  return <HitListClient items={items} repFirstName={auth.rep.full_name.split(' ')[0]} />
}
