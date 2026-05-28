import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireSalesRep } from '@/lib/sales-auth'

// Fields the rep is allowed to edit directly via this PATCH.
// Status moves go through this route too, but `won`, `lost`, and
// `bad_lead` are blocked here — those statuses use the dedicated
// /won, /lost, /bad-lead endpoints which collect the extra metadata.
const EDITABLE_FIELDS = new Set([
  'contact_name', 'phone', 'email', 'website', 'notes', 'industry', 'suburb', 'state',
  'next_followup_at',
])
const ALLOWED_STATUSES = new Set([
  'new', 'contacted', 'demo_booked', 'demo_done', 'proposal_sent', 'nurture',
])

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireSalesRep(req)
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })
  const { id } = await ctx.params

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const updates: Record<string, unknown> = {}

  // Validate next_followup_at shape if provided (must be a valid ISO timestamp string or null).
  if (body.next_followup_at !== undefined && body.next_followup_at !== null) {
    if (typeof body.next_followup_at !== 'string') {
      return NextResponse.json({ ok: false, error: 'next_followup_at must be an ISO timestamp string or null' }, { status: 400 })
    }
    const d = new Date(body.next_followup_at)
    if (isNaN(d.getTime())) {
      return NextResponse.json({ ok: false, error: 'next_followup_at is not a valid timestamp' }, { status: 400 })
    }
  }

  for (const [k, v] of Object.entries(body)) {
    if (EDITABLE_FIELDS.has(k)) updates[k] = v === '' ? null : v
  }

  // If the rep tried to set status via this endpoint, it must be one of
  // the in-flight statuses. Terminal statuses (won, lost, bad_lead) must
  // go through /won, /lost, /bad-lead which collect the required
  // metadata (plan, reason, etc). Reject loudly instead of silently
  // dropping the field — otherwise a request that also mutates an
  // editable field would succeed while quietly ignoring the status.
  if (body.status !== undefined) {
    if (typeof body.status !== 'string' || !ALLOWED_STATUSES.has(body.status)) {
      return NextResponse.json({
        ok: false,
        error: 'Status changes must use the dedicated endpoints: /won, /lost, /bad-lead',
      }, { status: 400 })
    }
  }

  const statusChange = typeof body.status === 'string'
    && ALLOWED_STATUSES.has(body.status)

  if (statusChange) updates.status = body.status

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ ok: false, error: 'Nothing to update' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: existing } = await admin
    .from('leads')
    .select('id, assigned_to, status')
    .eq('id', id)
    .maybeSingle()

  if (!existing || existing.assigned_to !== auth.rep.id) {
    return NextResponse.json({ ok: false, error: 'Lead not found' }, { status: 404 })
  }

  const { data: updated, error } = await admin
    .from('leads')
    .update(updates)
    .eq('id', id)
    .select(`
      id, business_name, contact_name, phone, email, industry, suburb, state,
      website, source, notes, status, approval_status, won_plan, won_billing_cycle, won_at,
      lost_reason, bad_lead_reason, business_id, next_followup_at, created_at, updated_at
    `)
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  // Audit trail for status changes.
  if (statusChange && existing.status !== body.status) {
    await admin.from('lead_activities').insert({
      lead_id: id,
      rep_id: auth.rep.id,
      activity_type: 'status_change',
      title: `Status changed to ${body.status}`,
      old_status: existing.status,
      new_status: body.status as string,
    })
  }

  return NextResponse.json({ ok: true, lead: updated })
}
