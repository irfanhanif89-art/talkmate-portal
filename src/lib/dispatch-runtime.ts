// Sessions 36-37 — shared dispatch runtime helpers used by both the
// owner's POST /api/dispatch/jobs and the Phase 5 reassign cron.
//
// dispatchJobToDriver:
//   * If preferredDriverId: try to offer the job to that driver.
//   * Else if autoDispatch:  pick the first available driver matching
//     truck_type_required, excluding any already in declined_driver_ids.
//   * If no driver available: leave the job in 'created' and Telegram
//     URGENT alert to the owner.

import { createAdminClient } from '@/lib/supabase/server'
import { sendAdminTelegram } from '@/lib/notifications'
import {
  sendSMS,
  templateDispatchDriverJobNotification,
  normaliseAuPhone,
} from '@/lib/sms'
import { sendPushToDriver, buildJobOfferPushPayload } from '@/lib/push'
import { JOB_TYPE_LABEL } from '@/lib/dispatch-types'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.talkmate.com.au'

export interface DispatchJobToDriverArgs {
  jobId: string
  clientId: string
  preferredDriverId: string | null
  autoDispatch: boolean
}

export async function dispatchJobToDriver(args: DispatchJobToDriverArgs): Promise<{
  ok: boolean
  driverId?: string | null
  reason?: string
}> {
  const admin = createAdminClient()

  // Pull the job + business in parallel.
  const [{ data: job }, { data: business }] = await Promise.all([
    admin
      .from('dispatch_jobs')
      .select('id, status, job_number, job_type, pickup_address, vehicle_make, vehicle_model, vehicle_colour, vehicle_rego, customer_name, payment_type, special_instructions, truck_type_required, declined_driver_ids, dispatch_attempt')
      .eq('id', args.jobId)
      .maybeSingle(),
    admin
      .from('businesses')
      .select('name, dispatch_response_timeout_mins')
      .eq('id', args.clientId)
      .maybeSingle(),
  ])

  if (!job) return { ok: false, reason: 'job_not_found' }
  if (job.status !== 'created') return { ok: false, reason: 'not_in_created_status' }

  const timeoutMins = business?.dispatch_response_timeout_mins ?? 15

  // Pick driver.
  type ChosenDriver = { id: string; name: string; phone: string; truck_type: string | null }
  let driverId: string | null = null
  let driverRow: ChosenDriver | null = null

  if (args.preferredDriverId) {
    const { data: pref } = await admin
      .from('drivers')
      .select('id, name, phone, truck_type, is_online, is_available, is_active')
      .eq('id', args.preferredDriverId)
      .eq('client_id', args.clientId)
      .maybeSingle()
    if (pref && pref.is_active && pref.is_online && pref.is_available) {
      driverId = pref.id as string
      driverRow = {
        id: pref.id as string,
        name: pref.name as string,
        phone: pref.phone as string,
        truck_type: pref.truck_type as string | null,
      }
    }
  }

  if (!driverId && args.autoDispatch) {
    let q = admin
      .from('drivers')
      .select('id, name, phone, truck_type')
      .eq('client_id', args.clientId)
      .eq('is_active', true)
      .eq('is_online', true)
      .eq('is_available', true)
      .order('created_at')

    if (job.truck_type_required) q = q.eq('truck_type', job.truck_type_required)

    const { data: candidates } = await q
    const declined = (job.declined_driver_ids ?? []) as string[]
    const eligible = (candidates ?? []).find(d => !declined.includes(d.id as string))
    if (eligible) {
      driverId = eligible.id as string
      driverRow = {
        id: eligible.id as string,
        name: eligible.name as string,
        phone: eligible.phone as string,
        truck_type: eligible.truck_type as string | null,
      }
    }
  }

  if (!driverId || !driverRow) {
    void sendAdminTelegram(
      `🚨 URGENT — No available drivers for Job ${job.job_number ?? job.id}\n${job.job_type} at ${job.pickup_address}\nAll drivers offline or have declined. Manual assignment required.`,
    ).catch(() => {})
    return { ok: false, reason: 'no_drivers_available' }
  }

  const now = new Date()
  const deadline = new Date(now.getTime() + timeoutMins * 60_000)

  // Offer the job.
  const { error: updErr } = await admin
    .from('dispatch_jobs')
    .update({
      driver_id: driverId,
      status: 'driver_notified',
      notified_at: now.toISOString(),
      response_deadline: deadline.toISOString(),
      dispatch_attempt: (job.dispatch_attempt ?? 0) + 1,
    })
    .eq('id', args.jobId)

  if (updErr) return { ok: false, reason: updErr.message }

  // Notifications, fire-and-forget.
  void sendAdminTelegram(
    `📤 Job ${job.job_number ?? job.id} offered to ${driverRow.name}\n${job.job_type} at ${job.pickup_address}\nResponse deadline: ${timeoutMins} mins`,
  ).catch(() => {})

  // Backup SMS so the driver has a fallback if the app push is missed.
  const phone = normaliseAuPhone(driverRow.phone)
  if (phone) {
    const message = templateDispatchDriverJobNotification({
      businessName: business?.name ?? 'TalkMate',
      jobNumber: job.job_number ?? job.id.slice(0, 8),
      jobTypeLabel: JOB_TYPE_LABEL[job.job_type as keyof typeof JOB_TYPE_LABEL] ?? job.job_type,
      pickupAddress: job.pickup_address,
      vehicleSummary: [job.vehicle_make, job.vehicle_model, job.vehicle_colour, job.vehicle_rego]
        .filter(Boolean).join(' ') || '—',
      customerName: job.customer_name ?? 'Customer',
      paymentType: job.payment_type ?? 'not specified',
      specialInstructions: job.special_instructions,
      appUrl: APP_URL,
    })
    void sendSMS({
      to: phone,
      message,
      clientId: args.clientId,
      smsType: 'dispatch_driver_job_notification',
    }).catch(() => {})
  }

  // Push.
  void sendPushToDriver(
    driverId,
    buildJobOfferPushPayload({
      jobTypeLabel: JOB_TYPE_LABEL[job.job_type as keyof typeof JOB_TYPE_LABEL] ?? job.job_type,
      pickupAddress: job.pickup_address,
      jobId: job.id,
    }),
  ).catch(() => {})

  return { ok: true, driverId }
}
