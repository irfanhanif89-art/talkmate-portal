import { NextResponse } from 'next/server'
import { requireClient } from '@/lib/portal-auth'

// Session 14 — service area + quote_config settings for the client portal.
// Mirrors /api/portal/dispatch/config so the Settings UI follows the same
// GET/PATCH contract.
//
// quote_config keys we allow the client to set:
//   enabled, quote_validity_minutes, after_hours_surcharge_percent,
//   minimum_job_fee, poa_threshold_km, currency
// All other quote_config keys are preserved on PATCH.

const QUOTE_CONFIG_KEYS = new Set([
  'enabled',
  'quote_validity_minutes',
  'after_hours_surcharge_percent',
  'minimum_job_fee',
  'poa_threshold_km',
  'currency',
])

const MAX_POSTCODE_ENTRIES = 200

export async function GET() {
  const auth = await requireClient()
  if ('error' in auth) return auth.error
  const { supabase, clientId } = auth

  const { data, error } = await supabase
    .from('businesses')
    .select('service_area_radius, service_area_mode, service_area_postcodes, quote_config, plan, business_address, address')
    .eq('id', clientId)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Business not found' }, { status: 404 })

  return NextResponse.json({
    service_area_radius: data.service_area_radius ?? 100,
    service_area_mode: data.service_area_mode ?? 'radius',
    service_area_postcodes: data.service_area_postcodes ?? [],
    quote_config: data.quote_config ?? {},
    plan: data.plan ?? 'starter',
    business_address: data.business_address ?? data.address ?? null,
  })
}

export async function PATCH(request: Request) {
  const auth = await requireClient()
  if ('error' in auth) return auth.error
  const { supabase, clientId } = auth

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>

  const { data: existing } = await supabase
    .from('businesses')
    .select('quote_config, plan')
    .eq('id', clientId)
    .maybeSingle()
  if ((existing?.plan as string | null) === 'starter') {
    return NextResponse.json({ error: 'Service area configuration is available on Growth and Pro plans.' }, { status: 403 })
  }
  const currentConfig = (existing?.quote_config ?? {}) as Record<string, unknown>

  const update: Record<string, unknown> = {}

  if (typeof body.service_area_mode === 'string' && ['radius', 'postcodes'].includes(body.service_area_mode)) {
    update.service_area_mode = body.service_area_mode
  }
  if (typeof body.service_area_radius === 'number' && body.service_area_radius >= 1 && body.service_area_radius <= 1000) {
    update.service_area_radius = Math.round(body.service_area_radius)
  }
  if (Array.isArray(body.service_area_postcodes)) {
    const cleaned = (body.service_area_postcodes as unknown[])
      .map(v => String(v).trim())
      .filter(v => v.length > 0)
      .slice(0, MAX_POSTCODE_ENTRIES)
    update.service_area_postcodes = cleaned
  }
  if (body.quote_config && typeof body.quote_config === 'object') {
    const incoming = body.quote_config as Record<string, unknown>
    const merged: Record<string, unknown> = { ...currentConfig }
    for (const k of Object.keys(incoming)) if (QUOTE_CONFIG_KEYS.has(k)) merged[k] = incoming[k]
    update.quote_config = merged
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('businesses')
    .update(update)
    .eq('id', clientId)
    .select('service_area_radius, service_area_mode, service_area_postcodes, quote_config')
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    service_area_radius: data?.service_area_radius ?? 100,
    service_area_mode: data?.service_area_mode ?? 'radius',
    service_area_postcodes: data?.service_area_postcodes ?? [],
    quote_config: data?.quote_config ?? {},
  })
}
