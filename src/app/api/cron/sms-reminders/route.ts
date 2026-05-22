import { NextResponse } from 'next/server'
import { verifyCron } from '@/lib/cron-auth'
import { createAdminClient } from '@/lib/supabase/server'
import {
  sendSMS,
  templateReminder24h,
  templateReminder2h,
  templateDispatcherReminder,
} from '@/lib/sms'

// Runs every hour. Two passes:
//  1. 24-hour reminders: bookings with scheduled_start ~24h away
//  2. 2-hour reminders:  bookings with scheduled_start ~2h away
//
// Both are gated by scheduler_settings.reminder_24h_enabled /
// reminder_2h_enabled and the plan-level SMS allowance (enforced inside
// sendSMS). Side-effects update the corresponding sms_reminder_*_sent
// flag on the booking so we never double-send.

interface BookingRow {
  id: string
  client_id: string
  caller_phone: string | null
  caller_name: string | null
  scheduled_start: string | null
  truck_type: string | null
  pickup_address: string | null
  dropoff_address: string | null
  status: string
}

interface SchedulerRow {
  reminder_24h_enabled: boolean | null
  reminder_2h_enabled: boolean | null
}

interface BusinessRow {
  name: string | null
  phone_number: string | null
}

async function fetchSettings(supabase: ReturnType<typeof createAdminClient>, clientId: string): Promise<{ scheduler: SchedulerRow | null; biz: BusinessRow | null }> {
  const [sched, biz] = await Promise.all([
    supabase.from('scheduler_settings')
      .select('reminder_24h_enabled, reminder_2h_enabled')
      .eq('client_id', clientId).maybeSingle(),
    supabase.from('businesses').select('name, phone_number').eq('id', clientId).maybeSingle(),
  ])
  return { scheduler: (sched.data as SchedulerRow | null) ?? null, biz: (biz.data as BusinessRow | null) ?? null }
}

export async function GET(request: Request) {
  const auth = verifyCron(request)
  if (auth) return auth

  const supabase = createAdminClient()
  const now = Date.now()

  // 24h window: [now+23h, now+25h]
  const lo24 = new Date(now + 23 * 60 * 60 * 1000).toISOString()
  const hi24 = new Date(now + 25 * 60 * 60 * 1000).toISOString()
  const { data: due24 } = await supabase
    .from('bookings')
    .select('id, client_id, caller_phone, caller_name, scheduled_start, truck_type, pickup_address, dropoff_address, status')
    .in('status', ['pending', 'confirmed'])
    .eq('sms_reminder_24h_sent', false)
    .gte('scheduled_start', lo24)
    .lt('scheduled_start', hi24)

  // 2h window: [now+1h45m, now+2h15m]
  const lo2 = new Date(now + 1.75 * 60 * 60 * 1000).toISOString()
  const hi2 = new Date(now + 2.25 * 60 * 60 * 1000).toISOString()
  const { data: due2 } = await supabase
    .from('bookings')
    .select('id, client_id, caller_phone, caller_name, scheduled_start, truck_type, pickup_address, dropoff_address, status')
    .in('status', ['pending', 'confirmed'])
    .eq('sms_reminder_2h_sent', false)
    .gte('scheduled_start', lo2)
    .lt('scheduled_start', hi2)

  const settingsCache = new Map<string, { scheduler: SchedulerRow | null; biz: BusinessRow | null }>()
  async function settingsFor(clientId: string) {
    if (!settingsCache.has(clientId)) settingsCache.set(clientId, await fetchSettings(supabase, clientId))
    return settingsCache.get(clientId)!
  }

  let sent24 = 0
  let sent2 = 0

  for (const b of (due24 ?? []) as BookingRow[]) {
    if (!b.caller_phone || !b.scheduled_start) continue
    const { scheduler, biz } = await settingsFor(b.client_id)
    if (scheduler?.reminder_24h_enabled === false) continue
    const start = new Date(b.scheduled_start)
    const message = templateReminder24h({
      business_name: biz?.name ?? 'us',
      business_phone: biz?.phone_number ?? '',
      time: start.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true }),
      pickup_address: b.pickup_address,
      dropoff_address: b.dropoff_address,
    })
    const r = await sendSMS({ to: b.caller_phone, message, clientId: b.client_id, smsType: 'booking_reminder_24h', bookingId: b.id })
    if (r.success) {
      await supabase.from('bookings').update({ sms_reminder_24h_sent: true }).eq('id', b.id)
      sent24++
    }
  }

  for (const b of (due2 ?? []) as BookingRow[]) {
    if (!b.caller_phone || !b.scheduled_start) continue
    const { scheduler, biz } = await settingsFor(b.client_id)
    if (scheduler?.reminder_2h_enabled === false) continue
    const start = new Date(b.scheduled_start)
    const message = templateReminder2h({
      business_name: biz?.name ?? 'us',
      business_phone: biz?.phone_number ?? '',
      time: start.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true }),
      pickup_address: b.pickup_address,
    })
    const r = await sendSMS({ to: b.caller_phone, message, clientId: b.client_id, smsType: 'booking_reminder_2h', bookingId: b.id })
    if (r.success) {
      await supabase.from('bookings').update({ sms_reminder_2h_sent: true }).eq('id', b.id)
      sent2++
    }
  }

  // ─── Session 29 — Dispatcher confirmation reminder sweep ─────────
  //
  // Bookings that were created in the last 15-30 minutes, are still
  // pending (dispatcher hasn't replied YES/NO), and haven't already
  // had a reminder sent. We text the dispatcher one more time from
  // TWILIO_CONFIRMATION_NUMBER so they see it land on the same
  // thread as the original notification.
  //
  // The 15-30 minute window guarantees:
  //  - we never reminded sooner than 15 minutes (gives the
  //    dispatcher a fair window to reply on their own),
  //  - we never re-remind on bookings older than 30 minutes (avoids
  //    a long-tail of reminders chasing forgotten bookings if the
  //    cron is off for a while; reminder_sent_at IS NULL is the
  //    real idempotency key, this just bounds the worst case).
  //
  // Cache business config in a Map — same pattern as settingsCache
  // above — so a flood of pending bookings from one client doesn't
  // trigger one businesses-table read per row.
  let dispatcherRemindersSent = 0
  const fifteenMinutesAgo = new Date(now - 15 * 60 * 1000).toISOString()
  const thirtyMinutesAgo = new Date(now - 30 * 60 * 1000).toISOString()

  const { data: pendingBookings } = await supabase
    .from('bookings')
    .select('id, confirmation_ref, client_id, dispatcher_notified_at')
    .eq('status', 'pending')
    .not('dispatcher_notified_at', 'is', null)
    .lte('dispatcher_notified_at', fifteenMinutesAgo)
    .gte('dispatcher_notified_at', thirtyMinutesAgo)
    .is('reminder_sent_at', null)

  const businessConfigCache = new Map<string, { dispatcherNumber?: string }>()
  for (const b of pendingBookings ?? []) {
    const clientId = b.client_id as string
    let config = businessConfigCache.get(clientId)
    if (!config) {
      const { data: bizRow } = await supabase
        .from('businesses')
        .select('notifications_config')
        .eq('id', clientId)
        .maybeSingle()
      const notif = (bizRow?.notifications_config ?? null) as Record<string, unknown> | null
      config = { dispatcherNumber: notif?.dispatcher_number as string | undefined }
      businessConfigCache.set(clientId, config)
    }
    if (!config.dispatcherNumber) continue

    const reminderResult = await sendSMS({
      to: config.dispatcherNumber,
      from: process.env.TWILIO_CONFIRMATION_NUMBER,
      message: templateDispatcherReminder({
        confirmationRef: (b.confirmation_ref as string | null) ?? 'N/A',
      }),
      clientId,
      smsType: 'dispatcher_reminder',
      bookingId: b.id as string,
    })

    // Only stamp reminder_sent_at when the SMS actually went out —
    // mirrors how the 24h/2h reminders above gate their own flags.
    // Stamping on failure would suppress retries on the next cron
    // tick.
    if (reminderResult.success) {
      await supabase
        .from('bookings')
        .update({ reminder_sent_at: new Date().toISOString() })
        .eq('id', b.id as string)
      dispatcherRemindersSent++
    }
  }

  return NextResponse.json({
    ok: true,
    sent_24h: sent24,
    sent_2h: sent2,
    dispatcher_reminders_sent: dispatcherRemindersSent,
  })
}

export const POST = GET
