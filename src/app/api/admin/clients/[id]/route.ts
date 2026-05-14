import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { isAdminPlan, requireAdmin } from '@/lib/admin-auth'
import { logAdminAction, diffFields } from '@/lib/audit'

const ALLOWED_ACCOUNT_STATUS = new Set(['active', 'pending', 'suspended', 'cancelled'])
// Library-aligned keys (used by the current Create modal) PLUS legacy
// keys that older businesses still carry. PATCH is a partial update so any
// industry already in the database must remain accepted.
const ALLOWED_INDUSTRIES = new Set([
  'restaurant', 'towing', 'realestate', 'trades', 'healthcare',
  'ndis', 'retail', 'dental', 'medispa', 'mechanic', 'physio',
  'accounting', 'cleaning', 'pest', 'landscaping', 'other',
  // Legacy keys preserved
  'restaurants', 'real_estate', 'professional_services',
  // Brief-preferred underscore keys (in case any business uses them)
  'medi_spa', 'pest_control',
])
const ALLOWED_TRADE_TYPES = new Set([
  'plumber', 'electrician', 'locksmith', 'builder', 'air_conditioning',
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

  // New industry service fields (migration 020). Top-level columns, not
  // merged into notifications_config. Only updated when the request
  // explicitly carries the key, so partial PATCHes leave them alone.
  if (Array.isArray(body.services)) {
    update.services = body.services
  }
  if (body.trade_type === null) {
    update.trade_type = null
  } else if (typeof body.trade_type === 'string') {
    const trimmed = body.trade_type.trim()
    if (trimmed === '') {
      update.trade_type = null
    } else if (!ALLOWED_TRADE_TYPES.has(trimmed)) {
      return NextResponse.json({ ok: false, error: 'invalid trade_type' }, { status: 400 })
    } else {
      update.trade_type = trimmed
    }
  }

  const admin = createAdminClient()

  // Agent setup answers live in the businesses.notifications_config jsonb so
  // we have to merge rather than overwrite.
  const agentSetupKeys = [
    'agent_name', 'agent_answer_phrase', 'services_summary', 'after_hours_instruction',
    'escalation_rules', 'forward_to_number', 'live_transfer_number',
    'notification_email', 'notification_sms',
  ] as const
  const agentSetupPatch: Record<string, unknown> = {}
  for (const k of agentSetupKeys) {
    if (typeof body[k] === 'string') agentSetupPatch[k] = String(body[k]).trim()
  }
  if (typeof body.service_pricing === 'object' && body.service_pricing !== null) {
    agentSetupPatch.service_pricing = body.service_pricing
  }
  if (typeof body.service_area === 'object' && body.service_area !== null) {
    agentSetupPatch.service_area = body.service_area
  }
  // Boolean flags for live transfer and notifications
  for (const k of ['live_transfer_enabled', 'notify_every_call', 'notify_transfers', 'notify_daily_summary', 'notify_missed'] as const) {
    if (typeof body[k] === 'boolean') agentSetupPatch[k] = body[k]
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

  // Snapshot the columns we're about to touch so we can write a precise
  // diff to the audit log (only changed fields, before+after values).
  // notifications_config is excluded — too large/noisy for the log.
  const auditKeys = Object.keys(update).filter(k => k !== 'notifications_config')
  // Supabase's TS inference can't narrow a dynamic select() string, so
  // grab everything for the audit columns we care about and cast.
  const { data: beforeRaw } = auditKeys.length > 0
    ? await admin.from('businesses').select('*').eq('id', id).maybeSingle()
    : { data: null }
  const before = (beforeRaw ?? null) as Record<string, unknown> | null

  const { data, error } = await admin.from('businesses').update(update).eq('id', id).select('*').single()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  // Pick the action name based on the most meaningful change — plan and
  // account_status get their own dedicated actions for filterability.
  let action: 'plan_changed' | 'account_status_changed' | 'client_updated' = 'client_updated'
  if (update.plan && before?.plan !== update.plan) action = 'plan_changed'
  else if (update.account_status && before?.account_status !== update.account_status) action = 'account_status_changed'

  const { before: beforeDiff, after: afterDiff } = diffFields(
    before,
    update as Record<string, unknown>,
    auditKeys,
  )

  await logAdminAction({
    adminEmail: auth.user.email ?? 'unknown',
    action,
    businessId: id,
    businessName: (data as Record<string, unknown>)?.name as string ?? null,
    before: beforeDiff,
    after: afterDiff,
    request: req,
  })

  return NextResponse.json({ ok: true, business: data })
}
