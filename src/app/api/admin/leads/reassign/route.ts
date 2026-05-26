// Session 43 — Single-lead reassignment.
//
// Admin moves one lead from one rep to another. Both reps get notified
// (losing + gaining). Optionally moves the commission credit too —
// admin chooses per case via a modal toggle. Default is to keep
// commission with the original closing rep (fair to the rep who did
// the work).

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin-auth'
import { logAdminAction } from '@/lib/audit'

export async function POST(req: Request) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const body = (await req.json().catch(() => ({}))) as {
    lead_id?: unknown
    new_rep_id?: unknown
    reason?: unknown
    move_commission?: unknown
  }
  const leadId = typeof body.lead_id === 'string' ? body.lead_id : null
  const newRepId = typeof body.new_rep_id === 'string' ? body.new_rep_id : null
  const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
  const moveCommission = body.move_commission === true

  if (!leadId || !newRepId) {
    return NextResponse.json({ ok: false, error: 'lead_id and new_rep_id required' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Verify destination rep is active. Mirrors bulk-import gate at
  // /api/admin/leads/bulk-import/route.ts:65-68.
  const { data: newRep } = await admin
    .from('sales_reps')
    .select('id, full_name, status')
    .eq('id', newRepId)
    .maybeSingle()
  if (!newRep) return NextResponse.json({ ok: false, error: 'Destination rep not found' }, { status: 404 })
  if (newRep.status !== 'active') {
    return NextResponse.json({ ok: false, error: `Cannot assign leads to a ${newRep.status} rep` }, { status: 400 })
  }

  // Load the lead + old rep info for notifications.
  const { data: lead } = await admin
    .from('leads')
    .select('id, business_name, assigned_to, status')
    .eq('id', leadId)
    .maybeSingle()
  if (!lead) return NextResponse.json({ ok: false, error: 'Lead not found' }, { status: 404 })
  if (lead.assigned_to === newRepId) {
    return NextResponse.json({ ok: false, error: 'Lead is already assigned to that rep' }, { status: 409 })
  }

  const oldRepId = lead.assigned_to as string | null
  let oldRepName = '(unassigned)'
  if (oldRepId) {
    const { data: oldRep } = await admin
      .from('sales_reps')
      .select('full_name')
      .eq('id', oldRepId)
      .maybeSingle()
    oldRepName = oldRep?.full_name ?? '(unknown)'
  }

  // Move ownership.
  const { error: updateErr } = await admin
    .from('leads')
    .update({
      assigned_to: newRepId,
      assigned_by: auth.user.id,
      assigned_at: new Date().toISOString(),
    })
    .eq('id', leadId)
  if (updateErr) {
    return NextResponse.json({ ok: false, error: updateErr.message }, { status: 500 })
  }

  // Optionally move commission credit.
  let commissionMoved = false
  if (moveCommission) {
    const { data: commissionsToMove } = await admin
      .from('commissions')
      .update({ rep_id: newRepId })
      .eq('lead_id', leadId)
      .neq('rep_id', newRepId)
      .select('id')
    commissionMoved = (commissionsToMove?.length ?? 0) > 0
  }

  // Audit row (rep-facing).
  const activityBody = `Reassigned from ${oldRepName} to ${newRep.full_name} by admin. ` +
    `Reason: ${reason || 'not provided'}.` +
    (moveCommission ? ' Commission credit moved.' : ' Commission credit kept with original rep.')
  await admin.from('lead_activities').insert({
    lead_id: leadId,
    rep_id: newRepId,
    activity_type: 'reassign',
    title: 'Lead reassigned',
    body: activityBody,
  })

  // Notify both reps.
  const notifications: Array<{ rep_id: string; type: string; lead_id: string; message: string }> = [
    {
      rep_id: newRepId,
      type: 'new_lead_assigned',
      lead_id: leadId,
      message: `New lead assigned to you: ${lead.business_name}. Previously with ${oldRepName}.`,
    },
  ]
  if (oldRepId) {
    notifications.push({
      rep_id: oldRepId,
      type: 'deal_reassigned',
      lead_id: leadId,
      message: `Lead reassigned away from you: ${lead.business_name}. Reason: ${reason || 'not provided'}.`,
    })
  }
  await admin.from('rep_notifications').insert(notifications)

  await logAdminAction({
    adminEmail: auth.user.email ?? 'unknown',
    action: 'lead_reassigned',
    businessName: lead.business_name ?? null,
    before: { assigned_to: oldRepId },
    after: { assigned_to: newRepId, reason, move_commission: moveCommission, commission_moved: commissionMoved },
    request: req,
  })

  return NextResponse.json({ ok: true, commission_moved: commissionMoved })
}
