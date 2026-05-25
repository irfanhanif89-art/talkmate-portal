import { NextResponse } from 'next/server'
import { requireClient } from '@/lib/portal-auth'

// GET  /api/dispatch/settings — read the Phase 1 settings columns.
// PATCH /api/dispatch/settings — toggle dispatch_enabled, response
// timeout, and the three customer-SMS flags.

const SETTING_KEYS = [
  'dispatch_enabled',
  'dispatch_response_timeout_mins',
  'customer_sms_on_accept',
  'customer_sms_on_enroute',
  'customer_sms_on_complete',
] as const

const BOOL_KEYS = new Set<string>([
  'dispatch_enabled', 'customer_sms_on_accept', 'customer_sms_on_enroute', 'customer_sms_on_complete',
])

export async function GET() {
  const auth = await requireClient()
  if ('error' in auth) return auth.error
  const { supabase, clientId } = auth

  const { data, error } = await supabase
    .from('businesses')
    .select(SETTING_KEYS.join(', '))
    .eq('id', clientId)
    .maybeSingle()
  if (error || !data) return NextResponse.json({ ok: false, error: error?.message ?? 'Not found' }, { status: 500 })
  return NextResponse.json({ ok: true, settings: data })
}

export async function PATCH(req: Request) {
  const auth = await requireClient()
  if ('error' in auth) return auth.error
  const { supabase, clientId } = auth

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const update: Record<string, boolean | number> = {}
  for (const k of SETTING_KEYS) {
    if (!(k in body)) continue
    const v = body[k]
    if (BOOL_KEYS.has(k)) {
      if (typeof v === 'boolean') update[k] = v
    } else if (k === 'dispatch_response_timeout_mins') {
      const n = typeof v === 'number' ? v : parseInt(String(v), 10)
      if (Number.isFinite(n) && n >= 5 && n <= 60) update[k] = n
    }
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ ok: false, error: 'No valid settings to update' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('businesses')
    .update(update)
    .eq('id', clientId)
    .select(SETTING_KEYS.join(', '))
    .maybeSingle()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, settings: data })
}
