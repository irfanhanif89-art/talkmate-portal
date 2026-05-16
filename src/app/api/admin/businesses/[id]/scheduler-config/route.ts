import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin-auth'

const STATES = new Set(['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'])
const MODES = new Set(['native', 'google_calendar', 'both'])

const SCALAR_FIELDS = new Set([
  'mode', 'timezone', 'state', 'buffer_minutes', 'max_concurrent_jobs',
  'booking_confirmation_sms', 'booking_confirmation_email',
  'waitlist_enabled', 'reminder_24h_enabled', 'reminder_2h_enabled',
  'waitlist_auto_notify', 'waitlist_claim_window_minutes',
  'cancellation_policy_enabled', 'cancellation_notice_hours', 'cancellation_fee_aud',
  'default_duration_tilt_minutes', 'default_duration_sideloader_minutes',
  'default_duration_minutes',
])
const JSON_FIELDS = new Set(['operating_hours', 'overridden_holidays'])

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { id } = await params
  const admin = createAdminClient()
  const { data } = await admin.from('scheduler_settings').select('*').eq('client_id', id).maybeSingle()
  return NextResponse.json({ scheduler_settings: data ?? null })
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { id } = await params

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const update: Record<string, unknown> = {}
  for (const k of Object.keys(body)) {
    if (SCALAR_FIELDS.has(k)) update[k] = body[k]
    if (JSON_FIELDS.has(k)) update[k] = body[k]
  }
  if (typeof update.state === 'string' && !STATES.has(update.state)) {
    return NextResponse.json({ error: 'Invalid state' }, { status: 400 })
  }
  if (typeof update.mode === 'string' && !MODES.has(update.mode)) {
    return NextResponse.json({ error: 'Invalid mode' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: existing } = await admin.from('scheduler_settings').select('*').eq('client_id', id).maybeSingle()
  if (!existing) {
    const { data, error } = await admin
      .from('scheduler_settings')
      .insert({ client_id: id, ...update })
      .select('*')
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ scheduler_settings: data })
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ scheduler_settings: existing })
  }
  const { data, error } = await admin
    .from('scheduler_settings')
    .update(update).eq('client_id', id)
    .select('*').maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ scheduler_settings: data })
}
