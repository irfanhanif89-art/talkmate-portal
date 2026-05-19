import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireSalesRep } from '@/lib/sales-auth'

const VALID_REASONS = new Set([
  'not_interested', 'too_expensive', 'competitor_chosen', 'bad_timing',
  'no_decision_maker', 'unreachable', 'already_a_client', 'other',
])

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireSalesRep()
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })
  const { id } = await ctx.params

  const body = (await req.json().catch(() => ({}))) as { lost_reason?: unknown; notes?: unknown }
  const lost_reason = String(body.lost_reason ?? '')
  const notes = body.notes == null ? null : String(body.notes).trim() || null

  if (!VALID_REASONS.has(lost_reason)) {
    return NextResponse.json({ ok: false, error: 'Pick a valid reason' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: lead } = await admin
    .from('leads')
    .select('id, assigned_to, status')
    .eq('id', id)
    .maybeSingle()

  if (!lead || lead.assigned_to !== auth.rep.id) {
    return NextResponse.json({ ok: false, error: 'Lead not found' }, { status: 404 })
  }

  const { data: updated, error } = await admin
    .from('leads')
    .update({ status: 'lost', lost_reason })
    .eq('id', id)
    .select(`
      id, business_name, contact_name, phone, email, industry, suburb, state,
      website, source, notes, status, approval_status, won_plan, won_at,
      lost_reason, bad_lead_reason, business_id, created_at, updated_at
    `)
    .single()

  if (error || !updated) {
    return NextResponse.json({ ok: false, error: error?.message ?? 'Could not mark as lost' }, { status: 500 })
  }

  await admin.from('lead_activities').insert([
    {
      lead_id: id,
      rep_id: auth.rep.id,
      activity_type: 'status_change',
      title: `Marked as lost (${lost_reason})`,
      old_status: lead.status,
      new_status: 'lost',
      body: notes,
    },
  ])

  return NextResponse.json({ ok: true, lead: updated })
}
