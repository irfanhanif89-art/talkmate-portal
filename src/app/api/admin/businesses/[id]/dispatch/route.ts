import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin-auth'
import { logAdminAction } from '@/lib/audit'

// Admin GET/PATCH for the per-business dispatch_enabled toggle + the
// dispatch_config blob. Returns vehicle and driver counts so the
// Dispatcher tab in the edit-client modal can render a summary without
// hitting four separate endpoints.

const VALID_CONFIG_KEYS = new Set([
  'job_types', 'default_wait_minutes', 'auto_wait_calculation',
  'max_concurrent_jobs', 'after_hours_dispatch', 'overbooking_action',
])

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const { id } = await params
  const admin = createAdminClient()
  const [bizRes, vehiclesRes, driversRes, jobsRes] = await Promise.all([
    admin.from('businesses').select('dispatch_enabled, dispatch_config, plan, industry').eq('id', id).single(),
    admin.from('vehicles').select('id', { count: 'exact', head: true }).eq('client_id', id).eq('active', true),
    admin.from('drivers').select('id', { count: 'exact', head: true }).eq('client_id', id).eq('active', true),
    admin.from('dispatch_jobs').select('id', { count: 'exact', head: true }).eq('client_id', id).in('status', ['pending', 'assigned', 'in_progress']),
  ])
  if (bizRes.error) return NextResponse.json({ ok: false, error: bizRes.error.message }, { status: 500 })

  return NextResponse.json({
    ok: true,
    dispatch_enabled: !!bizRes.data?.dispatch_enabled,
    dispatch_config: bizRes.data?.dispatch_config ?? {},
    plan: bizRes.data?.plan ?? 'starter',
    industry: bizRes.data?.industry ?? null,
    counts: {
      vehicles: vehiclesRes.count ?? 0,
      drivers: driversRes.count ?? 0,
      active_jobs: jobsRes.count ?? 0,
    },
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
    .from('businesses').select('dispatch_config').eq('id', id).single()
  const current = (existing?.dispatch_config ?? {}) as Record<string, unknown>

  const update: Record<string, unknown> = {}
  if (typeof body.dispatch_enabled === 'boolean') update.dispatch_enabled = body.dispatch_enabled
  if (body.dispatch_config && typeof body.dispatch_config === 'object') {
    const incoming = body.dispatch_config as Record<string, unknown>
    const merged: Record<string, unknown> = { ...current }
    for (const k of Object.keys(incoming)) if (VALID_CONFIG_KEYS.has(k)) merged[k] = incoming[k]
    update.dispatch_config = merged
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ ok: false, error: 'Nothing to update' }, { status: 400 })
  }

  const { data: priorBiz } = await admin
    .from('businesses').select('name, dispatch_enabled').eq('id', id).maybeSingle()

  const { data, error } = await admin
    .from('businesses').update(update).eq('id', id)
    .select('dispatch_enabled, dispatch_config').single()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  if (typeof body.dispatch_enabled === 'boolean' && priorBiz?.dispatch_enabled !== body.dispatch_enabled) {
    await logAdminAction({
      adminEmail: auth.user.email ?? 'unknown',
      action: 'dispatch_toggled',
      businessId: id,
      businessName: priorBiz?.name ?? null,
      before: { dispatch_enabled: !!priorBiz?.dispatch_enabled },
      after: { dispatch_enabled: !!body.dispatch_enabled },
      request,
    })
  } else if (update.dispatch_config) {
    await logAdminAction({
      adminEmail: auth.user.email ?? 'unknown',
      action: 'dispatch_config_updated',
      businessId: id,
      businessName: priorBiz?.name ?? null,
      before: { dispatch_config: current },
      after: { dispatch_config: update.dispatch_config },
      request,
    })
  }

  return NextResponse.json({ ok: true, ...data })
}
