import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin-auth'
import { sendSMS, templateBookingConfirmation } from '@/lib/sms'

const VALID_SOURCES = new Set(['agent', 'manual', 'google_calendar', 'walk_in'])
const VALID_TRUCKS = new Set(['loaded_tilt_tray', 'empty_tilt_tray', 'sideloader_40ft'])
const VALID_RATES = new Set(['account', 'retail'])

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const { id } = await params
  const { searchParams } = new URL(request.url)
  const statusFilter = searchParams.get('status')
  const fromIso = searchParams.get('from')
  const toIso = searchParams.get('to')

  const admin = createAdminClient()
  let q = admin.from('bookings').select('*').eq('client_id', id)
    .order('scheduled_start', { ascending: true, nullsFirst: false })
  if (statusFilter) q = q.eq('status', statusFilter)
  if (fromIso) q = q.gte('scheduled_start', fromIso)
  if (toIso) q = q.lte('scheduled_start', toIso)

  const { data, error } = await q
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  // Also fetch callbacks for the admin tab — same business id, separate
  // list, returned alongside so the modal can render both.
  const { data: callbacks } = await admin
    .from('callbacks')
    .select('*')
    .eq('client_id', id)
    .order('created_at', { ascending: false })

  return NextResponse.json({ ok: true, bookings: data ?? [], callbacks: callbacks ?? [] })
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { id: clientId } = await params

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const callerName = String(body.caller_name ?? '').trim() || null
  const callerPhone = String(body.caller_phone ?? '').trim() || null
  const truckType = typeof body.truck_type === 'string' && VALID_TRUCKS.has(body.truck_type) ? body.truck_type : null
  const rateType = typeof body.rate_type === 'string' && VALID_RATES.has(body.rate_type) ? body.rate_type : null
  const source = typeof body.booking_source === 'string' && VALID_SOURCES.has(body.booking_source) ? body.booking_source : 'manual'
  const scheduledStart = typeof body.scheduled_start === 'string' ? body.scheduled_start : null
  const scheduledEndRaw = typeof body.scheduled_end === 'string' ? body.scheduled_end : null
  if (!scheduledStart) return NextResponse.json({ error: 'scheduled_start required' }, { status: 400 })

  const startTs = new Date(scheduledStart).toISOString()
  const endTs = scheduledEndRaw
    ? new Date(scheduledEndRaw).toISOString()
    : new Date(new Date(scheduledStart).getTime() + 60 * 60 * 1000).toISOString()

  const admin = createAdminClient()

  let accountId: string | null = null
  if (callerPhone) {
    const { data: matches } = await admin
      .from('vip_callers')
      .select('id, linked_numbers, phone')
      .eq('client_id', clientId)
      .eq('account_type', 'account')
    const needle = callerPhone.replace(/\D/g, '')
    accountId = (matches ?? []).find(row => {
      const fromPhone = String(row.phone ?? '').replace(/\D/g, '')
      if (fromPhone && needle.endsWith(fromPhone.slice(-9))) return true
      const numbers = Array.isArray(row.linked_numbers) ? row.linked_numbers as Array<{ phone?: string }> : []
      return numbers.some(n => {
        const p = String(n?.phone ?? '').replace(/\D/g, '')
        return p && needle.endsWith(p.slice(-9))
      })
    })?.id ?? null
  }

  const insert: Record<string, unknown> = {
    client_id: clientId,
    caller_name: callerName,
    caller_phone: callerPhone,
    description: typeof body.description === 'string' ? body.description : null,
    pickup_address: typeof body.pickup_address === 'string' ? body.pickup_address : null,
    pickup_contact_name: typeof body.pickup_contact_name === 'string' ? body.pickup_contact_name : null,
    pickup_contact_phone: typeof body.pickup_contact_phone === 'string' ? body.pickup_contact_phone : null,
    dropoff_address: typeof body.dropoff_address === 'string' ? body.dropoff_address : null,
    dropoff_contact_name: typeof body.dropoff_contact_name === 'string' ? body.dropoff_contact_name : null,
    dropoff_contact_phone: typeof body.dropoff_contact_phone === 'string' ? body.dropoff_contact_phone : null,
    truck_type: truckType,
    rate_type: rateType,
    driver_id: typeof body.driver_id === 'string' && body.driver_id ? body.driver_id : null,
    account_id: accountId,
    booking_source: source,
    estimated_value: typeof body.estimated_value === 'number' ? body.estimated_value : null,
    scheduled_start: startTs,
    scheduled_end: endTs,
    status: 'confirmed',
  }

  const { data: booking, error } = await admin.from('bookings').insert(insert).select('*').single()
  if (error || !booking) return NextResponse.json({ error: error?.message ?? 'insert failed' }, { status: 500 })

  if (callerPhone) {
    const [{ data: scheduler }, { data: biz }] = await Promise.all([
      admin.from('scheduler_settings').select('booking_confirmation_sms').eq('client_id', clientId).maybeSingle(),
      admin.from('businesses').select('name, phone_number').eq('id', clientId).maybeSingle(),
    ])
    if (scheduler?.booking_confirmation_sms !== false) {
      const startDate = new Date(startTs)
      const message = templateBookingConfirmation({
        caller_name: callerName,
        business_name: biz?.name ?? 'us',
        business_phone: biz?.phone_number ?? '',
        truck_type: truckType,
        date: startDate.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' }),
        time: startDate.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true }),
        pickup_address: typeof body.pickup_address === 'string' ? body.pickup_address : null,
        dropoff_address: typeof body.dropoff_address === 'string' ? body.dropoff_address : null,
      })
      const res = await sendSMS({ to: callerPhone, message, clientId, smsType: 'booking_confirmation', bookingId: booking.id })
      if (res.success) {
        await admin.from('bookings').update({ sms_confirmation_sent: true }).eq('id', booking.id)
      }
    }
  }
  return NextResponse.json({ booking })
}
