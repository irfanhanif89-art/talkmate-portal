// POST /api/servicem8/push-job  — internal only (CRON_SECRET bearer)
// Called fire-and-forget from the Vapi call.ended webhook. Creates a job in
// the business's ServiceM8 account. Built dark + idempotent:
//   - global kill switch admin_settings.servicem8_globally_enabled must be 'true'
//   - business.servicem8_enabled must be true and an api key present
//   - calls.servicem8_pushed must be false (Vapi retries call.ended)
//   - the call must be >= 30s
// Never throws; logs every outcome to servicem8_push_log.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const SM8 = 'https://api.servicem8.com/api_1.0'
const MIN_DURATION = 30

function basicAuth(apiKey: string): string {
  return 'Basic ' + Buffer.from(`${apiKey}:x`).toString('base64')
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { callId?: string; businessId?: string; contactId?: string | null }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }) }
  const { callId, businessId } = body
  const contactId = body.contactId ?? null
  if (!callId || !businessId) {
    return NextResponse.json({ skipped: true, reason: 'missing_params' })
  }

  const admin = createAdminClient()

  // Global kill switch.
  const { data: gate } = await admin
    .from('admin_settings')
    .select('value')
    .eq('key', 'servicem8_globally_enabled')
    .maybeSingle()
  if (!gate || gate.value !== 'true') {
    return NextResponse.json({ skipped: true, reason: 'globally_off' })
  }

  // Business config.
  const { data: business } = await admin
    .from('businesses')
    .select('id, servicem8_enabled, servicem8_api_key, servicem8_default_job_status')
    .eq('id', businessId)
    .maybeSingle()
  if (!business || business.servicem8_enabled !== true || !business.servicem8_api_key) {
    return NextResponse.json({ skipped: true, reason: 'not_connected' })
  }

  // Call — idempotency + duration gate.
  const { data: call } = await admin
    .from('calls')
    .select('id, servicem8_pushed, duration_seconds, ended_at')
    .eq('id', callId)
    .maybeSingle()
  if (!call) return NextResponse.json({ skipped: true, reason: 'call_not_found' })
  if (call.servicem8_pushed === true) return NextResponse.json({ skipped: true, reason: 'already_pushed' })
  if ((call.duration_seconds ?? 0) < MIN_DURATION) {
    return NextResponse.json({ skipped: true, reason: 'call_too_short' })
  }

  // Contact (optional). contacts has no address column, so job_address is left
  // blank with a note flagging it for the operator to fill in.
  let contactName = ''
  let contactPhone = ''
  let contactEmail = ''
  if (contactId) {
    const { data: contact } = await admin
      .from('contacts')
      .select('name, phone, email')
      .eq('id', contactId)
      .maybeSingle()
    if (contact) {
      contactName = (contact.name as string | null) ?? ''
      contactPhone = (contact.phone as string | null) ?? ''
      contactEmail = (contact.email as string | null) ?? ''
    }
  }
  const nameParts = contactName.trim().split(/\s+/).filter(Boolean)
  const contactFirst = nameParts[0] ?? ''
  const contactLast = nameParts.slice(1).join(' ')

  const payload: Record<string, unknown> = {
    job_address: '',
    status: (business.servicem8_default_job_status as string | null) ?? 'Quote',
    work_order_date: (call.ended_at as string | null) ?? new Date().toISOString(),
    note: 'Booked via TalkMate AI receptionist. Address not captured on call — please confirm with the customer.',
  }

  let jobUuid: string | null = null
  try {
    const res = await fetch(`${SM8}/job.json`, {
      method: 'POST',
      headers: {
        Authorization: basicAuth(business.servicem8_api_key as string),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (res.status === 200 || res.status === 201) {
      jobUuid = res.headers.get('x-record-uuid')

      // Create a job contact record on the job (best-effort, non-fatal).
      if (jobUuid && (contactFirst || contactPhone || contactEmail)) {
        try {
          await fetch(`${SM8}/jobcontact.json`, {
            method: 'POST',
            headers: {
              Authorization: basicAuth(business.servicem8_api_key as string),
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              job_uuid: jobUuid,
              first: contactFirst,
              last: contactLast,
              phone: contactPhone,
              email: contactEmail,
              type: 'JOB',
            }),
          })
        } catch { /* non-fatal */ }
      }

      // Idempotency stamp + log.
      await admin.from('calls').update({ servicem8_pushed: true, servicem8_job_uuid: jobUuid }).eq('id', callId)
      await admin.from('servicem8_push_log').insert({
        business_id: businessId,
        call_id: callId,
        contact_id: contactId,
        servicem8_job_uuid: jobUuid,
        status: 'success',
        payload,
      })
      return NextResponse.json({ success: true, jobUuid })
    }

    const errText = await res.text()
    await admin.from('servicem8_push_log').insert({
      business_id: businessId,
      call_id: callId,
      contact_id: contactId,
      status: 'failed',
      payload,
      error_message: `HTTP ${res.status}: ${errText.substring(0, 500)}`,
    })
    return NextResponse.json({ success: false, status: res.status })
  } catch (err) {
    await admin.from('servicem8_push_log').insert({
      business_id: businessId,
      call_id: callId,
      contact_id: contactId,
      status: 'failed',
      payload,
      error_message: (err as Error).message,
    })
    return NextResponse.json({ success: false, error: (err as Error).message })
  }
}
