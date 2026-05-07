import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { isAdminPlan, requireAdmin } from '@/lib/admin-auth'

const ALLOWED_ACCOUNT_STATUS = new Set(['active', 'pending', 'suspended', 'cancelled'])
const ALLOWED_INDUSTRIES = new Set([
  'restaurants', 'towing', 'real_estate', 'trades', 'healthcare',
  'ndis', 'retail', 'professional_services', 'other',
])

// PATCH /api/admin/clients/[id]
// Partial update for the View/Edit modal. Only the fields the brief
// explicitly lists are accepted; anything else is ignored.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const { id } = await params
  if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const update: Record<string, unknown> = {}

  if (typeof body.business_name === 'string') update.name = body.business_name.trim()
  if (typeof body.phone === 'string') update.phone_number = body.phone.trim()
  if (typeof body.address === 'string') update.address = body.address.trim() || null
  if (typeof body.website === 'string') update.website = body.website.trim() || null
  if (typeof body.abn === 'string') update.abn = body.abn.trim() || null
  if (typeof body.industry === 'string') {
    if (!ALLOWED_INDUSTRIES.has(body.industry)) {
      return NextResponse.json({ ok: false, error: 'invalid industry' }, { status: 400 })
    }
    update.industry = body.industry
  }
  if (typeof body.plan === 'string') {
    if (!isAdminPlan(body.plan)) return NextResponse.json({ ok: false, error: 'invalid plan' }, { status: 400 })
    update.plan = body.plan
  }
  if (typeof body.account_status === 'string') {
    if (!ALLOWED_ACCOUNT_STATUS.has(body.account_status)) {
      return NextResponse.json({ ok: false, error: 'invalid account_status' }, { status: 400 })
    }
    update.account_status = body.account_status
  }
  if (typeof body.welcome_email_sent === 'boolean') update.welcome_email_sent = body.welcome_email_sent
  if (typeof body.agent_phone_number === 'string') update.agent_phone_number = body.agent_phone_number.trim() || null
  if (typeof body.billing_override_note === 'string') update.billing_override_note = body.billing_override_note.trim() || null
  if (typeof body.manual_next_billing_date === 'string') {
    update.manual_next_billing_date = body.manual_next_billing_date.trim() || null
  }

  const admin = createAdminClient()

  // Agent setup answers live in the businesses.notifications_config jsonb so
  // we have to merge rather than overwrite.
  const agentSetupKeys = ['agent_answer_phrase', 'services_summary', 'after_hours_instruction'] as const
  const agentSetupPatch: Record<string, unknown> = {}
  for (const k of agentSetupKeys) {
    if (typeof body[k] === 'string') agentSetupPatch[k] = String(body[k]).trim()
  }
  if (typeof body.service_pricing === 'object' && body.service_pricing !== null) {
    agentSetupPatch.service_pricing = body.service_pricing
  }
  if (Object.keys(agentSetupPatch).length > 0) {
    const { data: current } = await admin.from('businesses')
      .select('notifications_config').eq('id', id).single()
    const merged = { ...(current?.notifications_config ?? {}), ...agentSetupPatch }
    update.notifications_config = merged
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ ok: false, error: 'nothing to update' }, { status: 400 })
  }

  const { data, error } = await admin.from('businesses').update(update).eq('id', id).select('*').single()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, business: data })
}
