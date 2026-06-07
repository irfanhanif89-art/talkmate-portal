import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin-auth'

const VALID_CONFIG_KEYS = new Set([
  'after_hours_enabled', 'after_hours_action',
  'missed_transfer_action', 'wait_time_minutes',
  'emergency_keywords', 'emergency_action',
  'sms_followup_enabled', 'sms_followup_template',
  'repeat_caller_threshold', 'repeat_caller_notify',
])

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const { id } = await params
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('businesses')
    .select('escalation_config, knowledge_base, plan, call_transfer_enabled')
    .eq('id', id)
    .maybeSingle()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({
    ok: true,
    escalation_config: data?.escalation_config ?? {},
    knowledge_base: data?.knowledge_base ?? '',
    plan: data?.plan ?? 'starter',
    call_transfer_enabled: !!data?.call_transfer_enabled,
  })
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const { id } = await params
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>

  const admin = createAdminClient()
  const { data: existing } = await admin
    .from('businesses')
    .select('escalation_config')
    .eq('id', id)
    .maybeSingle()
  const current = (existing?.escalation_config ?? {}) as Record<string, unknown>

  const update: Record<string, unknown> = {}
  if (body.escalation_config && typeof body.escalation_config === 'object') {
    const incoming = body.escalation_config as Record<string, unknown>
    const merged: Record<string, unknown> = { ...current }
    for (const k of Object.keys(incoming)) if (VALID_CONFIG_KEYS.has(k)) merged[k] = incoming[k]
    update.escalation_config = merged
  }
  if (typeof body.knowledge_base === 'string') update.knowledge_base = body.knowledge_base
  if (typeof body.call_transfer_enabled === 'boolean') update.call_transfer_enabled = body.call_transfer_enabled

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ ok: false, error: 'Nothing to update.' }, { status: 400 })
  }

  const { data, error } = await admin
    .from('businesses')
    .update(update)
    .eq('id', id)
    .select('escalation_config, knowledge_base, call_transfer_enabled')
    .maybeSingle()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, ...data })
}
