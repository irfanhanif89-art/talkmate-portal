import { NextResponse } from 'next/server'
import { requireClient } from '@/lib/portal-auth'

const VALID_KEYS = new Set([
  'job_types', 'default_wait_minutes', 'auto_wait_calculation',
  'max_concurrent_jobs', 'after_hours_dispatch', 'overbooking_action',
])

export async function GET() {
  const auth = await requireClient()
  if ('error' in auth) return auth.error
  const { supabase, clientId } = auth

  const { data, error } = await supabase
    .from('businesses')
    .select('dispatch_enabled, dispatch_config, plan, industry')
    .eq('id', clientId)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    dispatch_enabled: !!data?.dispatch_enabled,
    dispatch_config: data?.dispatch_config ?? {},
    plan: data?.plan ?? 'starter',
    industry: data?.industry ?? null,
  })
}

export async function PATCH(request: Request) {
  const auth = await requireClient()
  if ('error' in auth) return auth.error
  const { supabase, clientId } = auth

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>

  const { data: existing } = await supabase
    .from('businesses')
    .select('dispatch_config')
    .eq('id', clientId)
    .maybeSingle()
  const current = (existing?.dispatch_config ?? {}) as Record<string, unknown>

  const update: Record<string, unknown> = {}
  if (body.dispatch_config && typeof body.dispatch_config === 'object') {
    const incoming = body.dispatch_config as Record<string, unknown>
    const merged: Record<string, unknown> = { ...current }
    for (const k of Object.keys(incoming)) if (VALID_KEYS.has(k)) merged[k] = incoming[k]
    update.dispatch_config = merged
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('businesses')
    .update(update)
    .eq('id', clientId)
    .select('dispatch_config')
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ dispatch_config: data?.dispatch_config ?? {} })
}
