import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireDriver } from '@/lib/driver-auth'
import { sendAdminTelegram } from '@/lib/notifications'
import {
  sendSMS,
  templateDispatchCustomerEnRoute,
  templateDispatchCustomerCompleted,
  normaliseAuPhone,
} from '@/lib/sms'
import { DRIVER_FORWARD_TRANSITIONS, STATUS_LABEL } from '@/lib/dispatch-types'
import type { DispatchJobStatus, PaymentType } from '@/lib/dispatch-types'

// PATCH /api/driver/jobs/[id]/status — forward-only lifecycle move.
//
// Body:
//   { status: 'en_route' | 'on_scene' | 'loaded' | 'in_transit' | 'at_dropoff' | 'completed',
//     data?: {
//       actual_distance_km?: number,
//       final_amount?: number,
//       payment_collected?: boolean,
//       payment_collected_type?: PaymentType,
//       driver_completion_notes?: string,
//     }
//   }
//
// Per-transition side effects:
//   * en_route   → set en_route_at; Telegram + customer SMS (if enabled).
//   * on_scene   → set on_scene_at; Telegram.
//   * loaded     → set loaded_at; require ≥1 pickup photo + signature.
//   * in_transit → set in_transit_at; persist actual_distance_km if provided.
//   * at_dropoff → set at_dropoff_at; Telegram.
//   * completed  → require ≥1 delivery photo + signature + final_amount;
//                  Telegram + customer SMS (if enabled); update booking
//                  status if booking_id present.

const VALID_PAYMENT_TYPES = new Set<PaymentType>([
  'cash', 'card', 'account', 'insurance', 'motor_club', 'other',
])

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireDriver()
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })
  const { id } = await params

  const body = (await req.json().catch(() => ({}))) as {
    status?: unknown
    data?: Record<string, unknown>
  }
  const nextStatus = typeof body.status === 'string' ? (body.status as DispatchJobStatus) : null
  if (!nextStatus) {
    return NextResponse.json({ ok: false, error: 'status is required' }, { status: 400 })
  }
  const data = (body.data ?? {}) as Record<string, unknown>

  const admin = createAdminClient()

  const { data: job } = await admin
    .from('dispatch_jobs')
    .select('id, status, client_id, driver_id, booking_id, customer_phone, customer_name, customer_sms_en_route, customer_sms_completed, pickup_signature_url, pickup_photo_count, delivery_signature_url, delivery_photo_count, job_number, quoted_amount')
    .eq('id', id)
    .eq('driver_id', auth.driver.id)
    .maybeSingle()
  if (!job) return NextResponse.json({ ok: false, error: 'Job not found' }, { status: 404 })

  const allowedNext = DRIVER_FORWARD_TRANSITIONS[job.status as DispatchJobStatus] ?? []
  if (!allowedNext.includes(nextStatus)) {
    return NextResponse.json(
      { ok: false, error: `Cannot move from ${job.status} to ${nextStatus}` },
      { status: 409 },
    )
  }

  const now = new Date().toISOString()
  const update: Record<string, unknown> = { status: nextStatus }

  switch (nextStatus) {
    case 'en_route':
      update.en_route_at = now
      break
    case 'on_scene':
      update.on_scene_at = now
      break
    case 'loaded':
      // Pre-loaded gate: pickup signature + at least one pickup photo.
      if (!job.pickup_signature_url) {
        return NextResponse.json({ ok: false, error: 'Pickup signature required before loading' }, { status: 400 })
      }
      if ((job.pickup_photo_count ?? 0) < 1) {
        return NextResponse.json({ ok: false, error: 'At least one pickup photo required before loading' }, { status: 400 })
      }
      update.loaded_at = now
      break
    case 'in_transit':
      update.in_transit_at = now
      if (typeof data.actual_distance_km === 'number') {
        update.actual_distance_km = data.actual_distance_km
      }
      break
    case 'at_dropoff':
      update.at_dropoff_at = now
      break
    case 'completed': {
      // Pre-complete gate: delivery signature + at least one delivery
      // photo + final amount.
      if (!job.delivery_signature_url) {
        return NextResponse.json({ ok: false, error: 'Delivery signature required before completing' }, { status: 400 })
      }
      if ((job.delivery_photo_count ?? 0) < 1) {
        return NextResponse.json({ ok: false, error: 'At least one delivery photo required before completing' }, { status: 400 })
      }
      const finalAmount = typeof data.final_amount === 'number'
        ? data.final_amount
        : Number(data.final_amount)
      if (!Number.isFinite(finalAmount) || finalAmount < 0) {
        return NextResponse.json({ ok: false, error: 'final_amount is required' }, { status: 400 })
      }
      update.completed_at = now
      update.final_amount = finalAmount

      if (typeof data.payment_collected === 'boolean') {
        update.payment_collected = data.payment_collected
        update.payment_collected_at = data.payment_collected ? now : null
        if (typeof data.payment_collected_type === 'string'
            && VALID_PAYMENT_TYPES.has(data.payment_collected_type as PaymentType)) {
          update.payment_collected_type = data.payment_collected_type
        }
      }
      if (typeof data.driver_completion_notes === 'string') {
        update.driver_completion_notes = data.driver_completion_notes.trim() || null
      }
      break
    }
  }

  const { error: updErr } = await admin
    .from('dispatch_jobs')
    .update(update)
    .eq('id', id)
  if (updErr) {
    return NextResponse.json({ ok: false, error: updErr.message }, { status: 500 })
  }

  // Owner alert.
  void sendAdminTelegram(
    `📍 Job ${job.job_number ?? id}: ${STATUS_LABEL[nextStatus]} (driver ${auth.driver.name})`,
  ).catch(() => {})

  // Customer SMS where appropriate.
  if (nextStatus === 'en_route' || nextStatus === 'completed') {
    const { data: business } = await admin
      .from('businesses')
      .select('name, phone, customer_sms_on_enroute, customer_sms_on_complete')
      .eq('id', job.client_id)
      .maybeSingle()

    const shouldSendEnRoute = nextStatus === 'en_route'
      && business?.customer_sms_on_enroute
      && !job.customer_sms_en_route

    const shouldSendCompleted = nextStatus === 'completed'
      && business?.customer_sms_on_complete
      && !job.customer_sms_completed

    if ((shouldSendEnRoute || shouldSendCompleted) && job.customer_phone && job.customer_name) {
      const customerPhone = normaliseAuPhone(job.customer_phone)
      if (customerPhone) {
        const message = shouldSendEnRoute
          ? templateDispatchCustomerEnRoute({
              customerName: job.customer_name,
              driverName: auth.driver.name,
              businessName: business?.name ?? 'TalkMate',
              businessPhone: business?.phone ?? '',
            })
          : templateDispatchCustomerCompleted({
              customerName: job.customer_name,
              businessName: business?.name ?? 'TalkMate',
              businessPhone: business?.phone ?? '',
            })

        const smsType = shouldSendEnRoute
          ? 'dispatch_customer_en_route'
          : 'dispatch_customer_completed'

        const res = await sendSMS({
          to: customerPhone,
          message,
          clientId: job.client_id,
          smsType,
        })
        if (res.success) {
          const flag = shouldSendEnRoute ? 'customer_sms_en_route' : 'customer_sms_completed'
          await admin.from('dispatch_jobs').update({ [flag]: true }).eq('id', id)
        }
      }
    }
  }

  // Roll the booking status forward when the job tied to it completes.
  // Failure is non-fatal — the dispatch_jobs row is the source of
  // truth and the booking sync is a courtesy.
  if (nextStatus === 'completed' && job.booking_id) {
    try {
      await admin
        .from('bookings')
        .update({ status: 'completed' })
        .eq('id', job.booking_id)
    } catch { /* non-fatal */ }
  }

  return NextResponse.json({ ok: true, status: nextStatus })
}
