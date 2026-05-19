import { NextResponse } from 'next/server'
import { requireClient } from '@/lib/portal-auth'

// Session 18 — Call Intelligence alert routing config.
// GET   — returns the current intelligence_alert_config (merged with
//         defaults) plus the escalation_number used as a fallback.
// PATCH — partial merge update of the config blob. Only known keys are
//         accepted so a malformed client payload can't corrupt the row.

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

export async function GET() {
  const auth = await requireClient()
  if ('error' in auth) return auth.error
  const { supabase, clientId } = auth

  const { data, error } = await supabase
    .from('businesses')
    .select('intelligence_alert_config, escalation_number')
    .eq('id', clientId)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const stored = (data?.intelligence_alert_config ?? {}) as Record<string, unknown>
  const escalation = (data?.escalation_number as string | null) ?? ''
  const merged = { ...DEFAULTS, ...stored }
  // Owner fallback to escalation_number when owner_number is blank — so
  // existing accounts continue to receive alerts before they ever open
  // the settings page.
  if (!merged.owner_number) merged.owner_number = escalation

  return NextResponse.json({
    intelligence_alert_config: merged,
    escalation_number: escalation,
  })
}

export async function PATCH(request: Request) {
  const auth = await requireClient()
  if ('error' in auth) return auth.error
  const { supabase, clientId } = auth

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const incoming = (body.intelligence_alert_config && typeof body.intelligence_alert_config === 'object')
    ? body.intelligence_alert_config as Record<string, unknown>
    : null

  if (!incoming) {
    return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 })
  }

  const { data: existingRow } = await supabase
    .from('businesses')
    .select('intelligence_alert_config')
    .eq('id', clientId)
    .single()
  const current = (existingRow?.intelligence_alert_config ?? {}) as Record<string, unknown>

  const merged: Record<string, unknown> = { ...current }
  for (const k of Object.keys(incoming)) {
    if (!VALID_KEYS.has(k)) continue
    const v = incoming[k]
    // Coerce booleans + strings, drop anything else.
    if (typeof v === 'boolean' || typeof v === 'string') {
      merged[k] = v
    }
  }

  const { data, error } = await supabase
    .from('businesses')
    .update({ intelligence_alert_config: merged })
    .eq('id', clientId)
    .select('intelligence_alert_config')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({
    intelligence_alert_config: { ...DEFAULTS, ...(data?.intelligence_alert_config ?? {}) },
  })
}
