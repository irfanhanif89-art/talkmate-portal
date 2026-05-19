import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin-auth'

// Session 18 — admin-authenticated parity for the per-business Call
// Intelligence alert routing config. Used by the admin impersonation
// settings page so Irfan can configure alerts on behalf of a client.

const VALID_KEYS = new Set([
  'alert_owner', 'alert_dispatcher',
  'owner_number', 'dispatcher_number',
  'alert_on_critical',
  'alert_on_warm_lead',
  'alert_on_missed_lead',
  'alert_on_dropped_call',
  'alert_on_vip_failure',
  'alert_on_agent_promise',
])

const DEFAULTS = {
  alert_owner: true,
  alert_dispatcher: false,
  owner_number: '',
  dispatcher_number: '',
  alert_on_critical: true,
  alert_on_warm_lead: true,
  alert_on_missed_lead: true,
  alert_on_dropped_call: false,
  alert_on_vip_failure: true,
  alert_on_agent_promise: true,
}

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
    .select('intelligence_alert_config, escalation_number')
    .eq('id', id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Business not found' }, { status: 404 })

  const stored = (data.intelligence_alert_config ?? {}) as Record<string, unknown>
  const escalation = (data.escalation_number as string | null) ?? ''
  const merged = { ...DEFAULTS, ...stored }
  if (!merged.owner_number) merged.owner_number = escalation

  return NextResponse.json({
    intelligence_alert_config: merged,
    escalation_number: escalation,
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
  const incoming = (body.intelligence_alert_config && typeof body.intelligence_alert_config === 'object')
    ? body.intelligence_alert_config as Record<string, unknown>
    : null

  if (!incoming) {
    return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: existingRow } = await admin
    .from('businesses')
    .select('intelligence_alert_config')
    .eq('id', id)
    .maybeSingle()
  const current = (existingRow?.intelligence_alert_config ?? {}) as Record<string, unknown>

  const merged: Record<string, unknown> = { ...current }
  for (const k of Object.keys(incoming)) {
    if (!VALID_KEYS.has(k)) continue
    const v = incoming[k]
    if (typeof v === 'boolean' || typeof v === 'string') {
      merged[k] = v
    }
  }

  const { data, error } = await admin
    .from('businesses')
    .update({ intelligence_alert_config: merged })
    .eq('id', id)
    .select('intelligence_alert_config')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({
    intelligence_alert_config: { ...DEFAULTS, ...(data?.intelligence_alert_config ?? {}) },
  })
}
