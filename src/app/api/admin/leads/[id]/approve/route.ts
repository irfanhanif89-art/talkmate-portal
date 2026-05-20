import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin-auth'
import { sendEmail } from '@/lib/resend'
import { dealApprovedEmailHtml, dealRejectedEmailHtml } from '@/lib/sales-notify'

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })
  const { id } = await ctx.params

  const body = (await req.json().catch(() => ({}))) as {
    action?: unknown
    rejection_reason?: unknown
  }
  const action = String(body.action ?? '')
  const rejection_reason = body.rejection_reason ? String(body.rejection_reason).trim() : null

  if (action !== 'approve' && action !== 'reject') {
    return NextResponse.json({ ok: false, error: 'action must be approve or reject' }, { status: 400 })
  }
  if (action === 'reject' && !rejection_reason) {
    return NextResponse.json({ ok: false, error: 'rejection_reason is required for reject' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: lead } = await admin
    .from('leads')
    .select(`
      id, business_name, status, approval_status, won_plan, assigned_to,
      sales_reps:assigned_to (full_name, email)
    `)
    .eq('id', id)
    .maybeSingle()

  if (!lead) return NextResponse.json({ ok: false, error: 'Lead not found' }, { status: 404 })
  if (lead.status !== 'won' || lead.approval_status !== 'pending') {
    return NextResponse.json({ ok: false, error: 'Lead is not in the approval queue' }, { status: 409 })
  }

  const repField = lead.sales_reps as { full_name?: string; email?: string } | Array<{ full_name?: string; email?: string }> | null
  const rep = Array.isArray(repField) ? repField[0] : repField
  const repName = rep?.full_name ?? 'Rep'
  const repEmail = rep?.email

  const now = new Date().toISOString()

  if (action === 'approve') {
    const { error: leadErr } = await admin
      .from('leads')
      .update({ approval_status: 'approved', approved_at: now, approved_by: auth.user.id })
      .eq('id', id)
    if (leadErr) return NextResponse.json({ ok: false, error: leadErr.message }, { status: 500 })

    // Approve the matching commission row.
    await admin.from('commissions')
      .update({ status: 'approved', approved_at: now })
      .eq('lead_id', id)
      .eq('status', 'pending')

    // Activity log entry.
    await admin.from('lead_activities').insert({
      lead_id: id,
      rep_id: lead.assigned_to,
      activity_type: 'approval',
      title: 'Deal approved by admin',
      body: `Approved by ${auth.user.email ?? 'admin'}`,
    })

    // Email rep — best-effort.
    if (repEmail) {
      const { data: comm } = await admin.from('commissions')
        .select('commission_amount').eq('lead_id', id).eq('status', 'approved').maybeSingle()
      sendEmail({
        to: repEmail,
        subject: `Deal approved — ${lead.business_name} is ready to onboard`,
        html: dealApprovedEmailHtml({
          repName,
          businessName: lead.business_name,
          amount: Number(comm?.commission_amount ?? 0),
        }),
      }).catch(() => {})
    }

    return NextResponse.json({ ok: true })
  }

  // Reject path
  const { error: leadErr } = await admin
    .from('leads')
    .update({
      approval_status: 'rejected',
      approval_notes: rejection_reason,
      approved_by: auth.user.id,
      approved_at: now,
      // Roll the lead back to proposal_sent so the rep can keep working it
      // (or move it to lost themselves with a proper reason).
      status: 'proposal_sent',
      won_at: null,
      won_plan: null,
    })
    .eq('id', id)
  if (leadErr) return NextResponse.json({ ok: false, error: leadErr.message }, { status: 500 })

  // Revoke the pending commission row.
  await admin.from('commissions')
    .update({ status: 'revoked', revoke_reason: `Deal rejected: ${rejection_reason}` })
    .eq('lead_id', id)
    .eq('status', 'pending')

  await admin.from('lead_activities').insert({
    lead_id: id,
    rep_id: lead.assigned_to,
    activity_type: 'approval',
    title: 'Deal rejected by admin',
    body: rejection_reason,
  })

  if (repEmail) {
    sendEmail({
      to: repEmail,
      subject: `Deal not approved — ${lead.business_name}`,
      html: dealRejectedEmailHtml({ repName, businessName: lead.business_name, reason: rejection_reason }),
    }).catch(() => {})
  }

  return NextResponse.json({ ok: true })
}
