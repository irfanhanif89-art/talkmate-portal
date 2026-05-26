// Session 43 — Bulk-by-rep lead reassignment.
//
// "Move all of Rep A's open leads to Rep B" — single admin action,
// loops internally and returns counts. Default statuses cover the
// open (non-terminal) pipeline: new, contacted, demo_booked, demo_done,
// proposal_sent. Won/lost/nurture/bad_lead are excluded by default
// (commission already crystallised or lead is dead) but admin can
// override by passing `statuses`.

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin-auth'
import { logAdminAction } from '@/lib/audit'
import type { LeadStatus } from '@/lib/sales-format'

const DEFAULT_OPEN_STATUSES: LeadStatus[] = [
  'new', 'contacted', 'demo_booked', 'demo_done', 'proposal_sent',
]

const VALID_STATUSES = new Set<LeadStatus>([
  'new', 'contacted', 'demo_booked', 'demo_done',
  'proposal_sent', 'won', 'lost', 'nurture', 'bad_lead',
])

function isLeadStatusArray(v: unknown): v is LeadStatus[] {
  return Array.isArray(v) && v.every(s => typeof s === 'string' && VALID_STATUSES.has(s as LeadStatus))
}

export async function POST(req: Request) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const body = (await req.json().catch(() => ({}))) as {
    source_rep_id?: unknown
    new_rep_id?: unknown
    statuses?: unknown
    reason?: unknown
    move_commission?: unknown
  }
  const sourceRepId = typeof body.source_rep_id === 'string' ? body.source_rep_id : null
  const newRepId = typeof body.new_rep_id === 'string' ? body.new_rep_id : null
  const statuses = isLeadStatusArray(body.statuses) ? body.statuses : DEFAULT_OPEN_STATUSES
  const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
  const moveCommission = body.move_commission === true

  if (!sourceRepId || !newRepId) {
    return NextResponse.json({ ok: false, error: 'source_rep_id and new_rep_id required' }, { status: 400 })
  }
  if (sourceRepId === newRepId) {
    return NextResponse.json({ ok: false, error: 'Source and destination reps must differ' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Destination must be active.
  const { data: newRep } = await admin
    .from('sales_reps')
    .select('id, full_name, status')
    .eq('id', newRepId)
    .maybeSingle()
  if (!newRep) return NextResponse.json({ ok: false, error: 'Destination rep not found' }, { status: 404 })
  if (newRep.status !== 'active') {
    return NextResponse.json({ ok: false, error: `Cannot assign leads to a ${newRep.status} rep` }, { status: 400 })
  }

  // Source rep name (allowed to be inactive — that's the whole point of bulk).
  const { data: sourceRep } = await admin
    .from('sales_reps')
    .select('full_name')
    .eq('id', sourceRepId)
    .maybeSingle()
  const sourceRepName = sourceRep?.full_name ?? '(unknown)'

  // List the leads we're about to move.
  const { data: leadsToMove, error: listErr } = await admin
    .from('leads')
    .select('id, business_name, status')
    .eq('assigned_to', sourceRepId)
    .in('status', statuses)
  if (listErr) return NextResponse.json({ ok: false, error: listErr.message }, { status: 500 })
  const leads = leadsToMove ?? []

  if (leads.length === 0) {
    return NextResponse.json({ ok: true, moved: 0, commission_rows_moved: 0 })
  }

  const leadIds = leads.map(l => l.id)
  const nowIso = new Date().toISOString()

  // Single UPDATE for all leads.
  const { error: updateErr } = await admin
    .from('leads')
    .update({
      assigned_to: newRepId,
      assigned_by: auth.user.id,
      assigned_at: nowIso,
    })
    .in('id', leadIds)
  if (updateErr) {
    return NextResponse.json({ ok: false, error: updateErr.message }, { status: 500 })
  }

  // Optional commission move (bulk).
  let commissionRowsMoved = 0
  if (moveCommission) {
    const { data: movedRows } = await admin
      .from('commissions')
      .update({ rep_id: newRepId })
      .in('lead_id', leadIds)
      .neq('rep_id', newRepId)
      .select('id')
    commissionRowsMoved = movedRows?.length ?? 0
  }

  // Audit rows + notifications per lead. Build batched insert payloads.
  const activityBody = `Reassigned from ${sourceRepName} to ${newRep.full_name} by admin (bulk). ` +
    `Reason: ${reason || 'not provided'}.` +
    (moveCommission ? ' Commission credit moved.' : ' Commission credit kept with original rep.')

  const activities = leads.map(l => ({
    lead_id: l.id,
    rep_id: newRepId,
    activity_type: 'reassign' as const,
    title: 'Lead reassigned (bulk)',
    body: activityBody,
  }))
  await admin.from('lead_activities').insert(activities)

  const notifications: Array<{ rep_id: string; type: string; lead_id: string; message: string }> = []
  for (const l of leads) {
    notifications.push({
      rep_id: newRepId,
      type: 'new_lead_assigned',
      lead_id: l.id,
      message: `New lead assigned to you: ${l.business_name}. Previously with ${sourceRepName} (bulk reassign).`,
    })
    notifications.push({
      rep_id: sourceRepId,
      type: 'deal_reassigned',
      lead_id: l.id,
      message: `Lead reassigned away from you: ${l.business_name}. Reason: ${reason || 'not provided'} (bulk).`,
    })
  }
  await admin.from('rep_notifications').insert(notifications)

  await logAdminAction({
    adminEmail: auth.user.email ?? 'unknown',
    action: 'leads_bulk_reassigned',
    before: { source_rep_id: sourceRepId, lead_count: leads.length },
    after: {
      new_rep_id: newRepId,
      reason,
      move_commission: moveCommission,
      commission_rows_moved: commissionRowsMoved,
      statuses,
    },
    request: req,
  })

  return NextResponse.json({
    ok: true,
    moved: leads.length,
    commission_rows_moved: commissionRowsMoved,
  })
}
