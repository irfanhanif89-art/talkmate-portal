import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireSalesRep } from '@/lib/sales-auth'
import { notifyBadLead } from '@/lib/sales-notify'

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireSalesRep(req)
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })
  const { id } = await ctx.params

  const body = (await req.json().catch(() => ({}))) as { reason?: unknown }
  const reason = String(body.reason ?? '').trim()
  if (!reason) {
    return NextResponse.json({ ok: false, error: 'Reason is required' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: lead } = await admin
    .from('leads')
    .select('id, assigned_to, status, business_name')
    .eq('id', id)
    .maybeSingle()
  if (!lead || lead.assigned_to !== auth.rep.id) {
    return NextResponse.json({ ok: false, error: 'Lead not found' }, { status: 404 })
  }

  const { error } = await admin
    .from('leads')
    .update({ status: 'bad_lead', bad_lead_reason: reason })
    .eq('id', id)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  await admin.from('lead_activities').insert({
    lead_id: id,
    rep_id: auth.rep.id,
    activity_type: 'status_change',
    title: 'Flagged as bad lead',
    body: reason,
    old_status: lead.status,
    new_status: 'bad_lead',
  })

  notifyBadLead({
    repName: auth.rep.full_name,
    businessName: lead.business_name,
    reason,
  }).catch(() => { /* logged in notifier */ })

  return NextResponse.json({ ok: true })
}
