import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireDriver } from '@/lib/driver-auth'
import { sendAdminTelegram } from '@/lib/notifications'
import {
  sendSMS,
  templateDispatchCustomerAccepted,
  normaliseAuPhone,
} from '@/lib/sms'

// PATCH /api/driver/jobs/[id]/respond — driver accepts or declines.
//
// Body:
//   { action: 'accept', eta_mins: number }  — required ETA on accept
//   { action: 'decline' }
//
// Accept: status → 'accepted', record accepted_at + eta. Optional
// customer SMS if business.customer_sms_on_accept is true.
//
// Decline: status → 'declined', driver_id appended to
// declined_driver_ids. Status reset to 'created' so the auto-reassign
// cron (Phase 5) re-offers it to the next available driver.

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireDriver()
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })
  const { id } = await params

  const body = (await req.json().catch(() => ({}))) as {
    action?: unknown
    eta_mins?: unknown
  }
  const action = typeof body.action === 'string' ? body.action : ''
  const etaMins = typeof body.eta_mins === 'number' ? body.eta_mins : null

  if (action !== 'accept' && action !== 'decline') {
    return NextResponse.json({ ok: false, error: 'action must be accept or decline' }, { status: 400 })
  }
  if (action === 'accept' && (etaMins == null || etaMins <= 0)) {
    return NextResponse.json({ ok: false, error: 'eta_mins is required on accept' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Make sure the job is currently offered to this driver and still
  // within the response window.
  const { data: job } = await admin
    .from('dispatch_jobs')
    .select('id, status, client_id, driver_id, declined_driver_ids, response_deadline, job_number, job_type, customer_name, customer_phone, pickup_address')
    .eq('id', id)
    .eq('driver_id', auth.driver.id)
    .maybeSingle()

  if (!job) return NextResponse.json({ ok: false, error: 'Job not found' }, { status: 404 })
  if (job.status !== 'driver_notified') {
    return NextResponse.json({ ok: false, error: 'Job is no longer awaiting a response' }, { status: 409 })
  }
  if (job.response_deadline && new Date(job.response_deadline).getTime() < Date.now()) {
    return NextResponse.json({ ok: false, error: 'Response window has expired' }, { status: 409 })
  }

  const { data: business } = await admin
    .from('businesses')
    .select('name, phone, customer_sms_on_accept')
    .eq('id', job.client_id)
    .maybeSingle()

  if (action === 'accept') {
    const { error: updErr } = await admin
      .from('dispatch_jobs')
      .update({
        status: 'accepted',
        accepted_at: new Date().toISOString(),
        driver_eta_mins: etaMins,
      })
      .eq('id', id)
    if (updErr) return NextResponse.json({ ok: false, error: updErr.message }, { status: 500 })

    void sendAdminTelegram(
      `✅ Driver ${auth.driver.name} accepted Job ${job.job_number ?? id}\nETA ${etaMins} mins · ${job.job_type} at ${job.pickup_address}`,
    ).catch(() => {})

    if (business?.customer_sms_on_accept && job.customer_phone && job.customer_name) {
      const customerPhone = normaliseAuPhone(job.customer_phone)
      if (customerPhone) {
        const msg = templateDispatchCustomerAccepted({
          customerName: job.customer_name,
          driverName: auth.driver.name,
          etaMins: etaMins!,
          businessName: business.name ?? 'TalkMate',
          businessPhone: business.phone ?? '',
        })
        const res = await sendSMS({
          to: customerPhone,
          message: msg,
          clientId: job.client_id,
          smsType: 'dispatch_customer_accepted',
        })
        if (res.success) {
          await admin
            .from('dispatch_jobs')
            .update({ customer_sms_accepted: true })
            .eq('id', id)
        }
      }
    }

    return NextResponse.json({ ok: true, action: 'accepted' })
  }

  // Decline path.
  const declinedIds = [...(job.declined_driver_ids ?? []), auth.driver.id]
  const { error: updErr } = await admin
    .from('dispatch_jobs')
    .update({
      status: 'created',
      driver_id: null,
      declined_driver_ids: declinedIds,
      notified_at: null,
      response_deadline: null,
    })
    .eq('id', id)
  if (updErr) return NextResponse.json({ ok: false, error: updErr.message }, { status: 500 })

  void sendAdminTelegram(
    `❌ Driver ${auth.driver.name} declined Job ${job.job_number ?? id}\nAuto-reassign cron will offer it to the next available driver.`,
  ).catch(() => {})

  return NextResponse.json({ ok: true, action: 'declined' })
}
