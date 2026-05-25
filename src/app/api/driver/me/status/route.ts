import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireDriver } from '@/lib/driver-auth'
import { sendAdminTelegram } from '@/lib/notifications'

// PATCH /api/driver/me/status — driver toggles online / offline.
//
// Body: { is_online: boolean }
//
// Side effects:
//   * drivers.is_online and is_available are flipped together (going
//     online sets both true; going offline sets both false). is_available
//     gets a separate flag only when a job is in flight (set by the
//     dispatch-jobs flow).
//   * driver_availability_log gets an append-only row with
//     changed_by='driver'.
//   * Owner gets a Telegram alert so they know who is on/off shift.

export async function PATCH(req: Request) {
  const auth = await requireDriver()
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const body = (await req.json().catch(() => ({}))) as { is_online?: unknown }
  if (typeof body.is_online !== 'boolean') {
    return NextResponse.json({ ok: false, error: 'is_online (boolean) is required' }, { status: 400 })
  }
  const target = body.is_online

  // No-op if state matches.
  if (auth.driver.is_online === target) {
    return NextResponse.json({ ok: true, driver: auth.driver })
  }

  const admin = createAdminClient()

  const { data: updated, error: updErr } = await admin
    .from('drivers')
    .update({
      is_online: target,
      is_available: target,
    })
    .eq('id', auth.driver.id)
    .select('id, user_id, client_id, name, phone, email, truck_type, truck_rego, licence_number, is_available, is_online, is_active, notes, avatar_url, location_consent_at')
    .maybeSingle()

  if (updErr || !updated) {
    return NextResponse.json(
      { ok: false, error: updErr?.message ?? 'Failed to update status' },
      { status: 500 },
    )
  }

  // Log + alert (fire-and-forget).
  void admin
    .from('driver_availability_log')
    .insert({
      driver_id: auth.driver.id,
      client_id: auth.driver.client_id,
      is_online: target,
      changed_by: 'driver',
    })
    .then(() => {})

  void sendAdminTelegram(
    `${target ? '🟢 ONLINE' : '⚫ OFFLINE'} — ${updated.name}`,
  ).catch(() => {})

  return NextResponse.json({ ok: true, driver: updated })
}
