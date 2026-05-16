import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin-auth'
import { logAdminAction } from '@/lib/audit'

// Admin GET/PATCH for service area + quote_config on a specific business.
// Used by /admin/clients/[clientId]/portal/settings/service-area.

const QUOTE_CONFIG_KEYS = new Set([
  'enabled',
  'quote_validity_minutes',
  'after_hours_surcharge_percent',
  'minimum_job_fee',
  'poa_threshold_km',
  'currency',
])

const MAX_POSTCODE_ENTRIES = 200

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
    .select('service_area_radius, service_area_mode, service_area_postcodes, quote_config, plan, business_address, address, name')
    .eq('id', id)
    .maybeSingle()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ ok: false, error: 'Business not found' }, { status: 404 })

  return NextResponse.json({
    ok: true,
    service_area_radius: data.service_area_radius ?? 100,
    service_area_mode: data.service_area_mode ?? 'radius',
    service_area_postcodes: data.service_area_postcodes ?? [],
    quote_config: data.quote_config ?? {},
    plan: data.plan ?? 'starter',
    business_address: data.business_address ?? data.address ?? null,
    business_name: data.name ?? null,
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
    .select('service_area_radius, service_area_mode, service_area_postcodes, quote_config, name')
    .eq('id', id)
    .maybeSingle()
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
    return NextResponse.json({ ok: false, error: 'Nothing to update' }, { status: 400 })
  }

  const { data, error } = await admin
    .from('businesses')
    .update(update)
    .eq('id', id)
    .select('service_area_radius, service_area_mode, service_area_postcodes, quote_config')
    .maybeSingle()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  await logAdminAction({
    adminEmail: auth.user.email ?? 'unknown',
    action: 'quote_config_updated',
    businessId: id,
    businessName: existing?.name ?? null,
    before: {
      service_area_radius: existing?.service_area_radius,
      service_area_mode: existing?.service_area_mode,
      service_area_postcodes: existing?.service_area_postcodes,
      quote_config: currentConfig,
    },
    after: update,
    request,
  })

  return NextResponse.json({
    ok: true,
    service_area_radius: data?.service_area_radius ?? 100,
    service_area_mode: data?.service_area_mode ?? 'radius',
    service_area_postcodes: data?.service_area_postcodes ?? [],
    quote_config: data?.quote_config ?? {},
  })
}
