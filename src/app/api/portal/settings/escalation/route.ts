import { NextResponse } from 'next/server'
import { requireClient } from '@/lib/portal-auth'

// GET — return escalation_config + knowledge_base for the caller's
//        business.
// PATCH — update either or both. Merges into the existing JSONB blob
//        rather than replacing it wholesale, so a partial update from
//        the client UI doesn't blow away other keys.

const VALID_CONFIG_KEYS = new Set([
  'after_hours_enabled', 'after_hours_action',
  'missed_transfer_action', 'wait_time_minutes',
  'emergency_keywords', 'emergency_action',
  'sms_followup_enabled', 'sms_followup_template',
  'repeat_caller_threshold', 'repeat_caller_notify',
])

export async function GET() {
  const auth = await requireClient()
  if ('error' in auth) return auth.error
  const { supabase, clientId } = auth

  const { data, error } = await supabase
    .from('businesses')
    .select('escalation_config, knowledge_base, plan, call_transfer_enabled')
    .eq('id', clientId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({
    escalation_config: data?.escalation_config ?? {},
    knowledge_base: data?.knowledge_base ?? '',
    plan: data?.plan ?? 'starter',
    call_transfer_enabled: !!data?.call_transfer_enabled,
  })
}

export async function PATCH(request: Request) {
  const auth = await requireClient()
  if ('error' in auth) return auth.error
  const { supabase, clientId } = auth

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>

  // Pull current config so we merge rather than replace.
  const { data: existing } = await supabase
    .from('businesses')
    .select('escalation_config')
    .eq('id', clientId)
    .maybeSingle()
  const current = (existing?.escalation_config ?? {}) as Record<string, unknown>

  const update: Record<string, unknown> = {}

  if (body.escalation_config && typeof body.escalation_config === 'object') {
    const incoming = body.escalation_config as Record<string, unknown>
    const filtered: Record<string, unknown> = { ...current }
    for (const k of Object.keys(incoming)) {
      if (VALID_CONFIG_KEYS.has(k)) filtered[k] = incoming[k]
    }
    update.escalation_config = filtered
  }
  if (typeof body.knowledge_base === 'string') {
    update.knowledge_base = body.knowledge_base
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('businesses')
    .update(update)
    .eq('id', clientId)
    .select('escalation_config, knowledge_base')
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({
    escalation_config: data?.escalation_config ?? {},
    knowledge_base: data?.knowledge_base ?? '',
  })
}
