// Shared agent provisioning core (Session 41).
//
// Extracted from /api/admin/approve-agent so the Go Live route in the
// admin onboarding wizard can re-use the exact same Twilio + Vapi
// provisioning logic without forking it. Both callers go through here.
//
// What this lib owns:
//   1. Loading the business (with .maybeSingle — never .single — per global rule)
//   2. The go-live checklist gate (REQUIRED_MANUAL_CHECKS + auto checks)
//   3. Twilio AU mobile purchase, with application-level idempotency:
//      if businesses.phone_number is already set, skip purchase. The
//      bought number is persisted to DB BEFORE the Vapi register call,
//      so a crash mid-Vapi-register doesn't double-buy on retry.
//   4. Vapi phone-number register (naturally idempotent)
//   5. Flipping businesses.agent_status to 'live'
//
// What this lib intentionally does NOT do:
//   - Send the welcome email (each caller picks the right template)
//   - Fire the Telegram alert (callers send their own)
//   - Update account_status (only Go Live does that)
//
// Twilio Idempotency-Key note: Twilio's IncomingPhoneNumbers POST does
// NOT honor the Idempotency-Key header — passing it has no effect and
// retries double-charge. Application-level dedup via businesses.phone_number
// is the only safe path here.

import { createAdminClient } from '@/lib/supabase/server'
import { computeAutoChecks } from '@/lib/golive-checks'
import { sendAdminTelegram } from '@/lib/notifications'

const REQUIRED_MANUAL_CHECKS = [
  'manual_vapi_functions_registered',
  'manual_test_call_made',
  'manual_sms_delivered_to_owner',
] as const

export interface ProvisionAgentResult {
  ok: true
  phone_number: string | null
  vapi_agent_id: string
}

export interface ProvisionAgentError {
  ok: false
  status: number
  error: string
  failing_checks?: string[]
}

export async function provisionAgent(
  businessId: string,
  opts: { override?: boolean } = {},
): Promise<ProvisionAgentResult | ProvisionAgentError> {
  const supabase = createAdminClient()

  const { data: business } = await supabase
    .from('businesses')
    .select('*, owner_user_id')
    .eq('id', businessId)
    .maybeSingle()
  if (!business) return { ok: false, status: 404, error: 'Business not found' }
  if (!business.vapi_agent_id) return { ok: false, status: 400, error: 'No agent on this business' }

  // Checklist gate
  const { result: autoChecks } = await computeAutoChecks(supabase, businessId)
  const { data: checklist } = await supabase
    .from('client_golive_checklist')
    .select('*')
    .eq('business_id', businessId)
    .maybeSingle()

  const failingChecks: string[] = []
  for (const [key, value] of Object.entries(autoChecks)) {
    if (value === false) failingChecks.push(key)
  }
  for (const check of REQUIRED_MANUAL_CHECKS) {
    if (!checklist?.[check]) failingChecks.push(check)
  }

  if (failingChecks.length > 0 && !opts.override) {
    return {
      ok: false,
      status: 400,
      error: 'Go-live checklist incomplete',
      failing_checks: failingChecks,
    }
  }
  if (failingChecks.length > 0 && opts.override) {
    await sendAdminTelegram(
      `Go-live override used for ${business.name}. Failing checks: ${failingChecks.join(', ')}`,
    ).catch(() => {})
  }

  // Twilio + Vapi provisioning. App-level idempotency: skip purchase if
  // phone_number already on the row.
  let twilioNumber: string | null = business.phone_number ?? null

  if (!twilioNumber) {
    try {
      const twilioSid = process.env.TWILIO_ACCOUNT_SID
      const twilioAuth = process.env.TWILIO_AUTH_TOKEN
      if (!twilioSid || !twilioAuth) {
        return { ok: false, status: 500, error: 'Twilio not configured' }
      }

      const twilioBase = `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}`
      const twilioHeaders = {
        'Authorization': 'Basic ' + Buffer.from(`${twilioSid}:${twilioAuth}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      }

      const searchRes = await fetch(
        `${twilioBase}/AvailablePhoneNumbers/AU/Mobile.json?VoiceEnabled=true&PageSize=1`,
        { headers: twilioHeaders },
      )
      const searchData = await searchRes.json()
      const available = searchData?.available_phone_numbers?.[0]?.phone_number
      if (!available) return { ok: false, status: 502, error: 'No AU mobile available from Twilio' }

      const buyRes = await fetch(`${twilioBase}/IncomingPhoneNumbers.json`, {
        method: 'POST',
        headers: twilioHeaders,
        body: new URLSearchParams({ PhoneNumber: available }).toString(),
      })
      const buyData = await buyRes.json()
      if (!buyData.phone_number) {
        return {
          ok: false,
          status: 502,
          error: `Twilio purchase failed: ${JSON.stringify(buyData).slice(0, 200)}`,
        }
      }
      twilioNumber = buyData.phone_number as string

      // Persist immediately — before Vapi register — so a crash mid-Vapi
      // doesn't leave us double-buying on retry.
      await supabase.from('businesses').update({ phone_number: twilioNumber }).eq('id', businessId)
    } catch (e) {
      console.error('[provisionAgent] Twilio error:', e)
      return { ok: false, status: 502, error: 'Twilio provisioning failed' }
    }
  }

  // Vapi register (naturally idempotent on the assistantId).
  // Session 42 (H8) — capture the returned phoneNumber UUID and persist
  // it to businesses.vapi_phone_number_id so unassignVapiPhone() can
  // PATCH this resource later when the subscription is cancelled.
  try {
    const vapiRes = await fetch('https://api.vapi.ai/phone-number', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.VAPI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        provider: 'twilio',
        number: twilioNumber,
        twilioAccountSid: process.env.TWILIO_ACCOUNT_SID,
        twilioAuthToken: process.env.TWILIO_AUTH_TOKEN,
        assistantId: business.vapi_agent_id,
        name: `${business.name} TalkMate Line`,
      }),
      signal: AbortSignal.timeout(8000),
    })
    if (!vapiRes.ok) {
      const txt = await vapiRes.text().catch(() => '')
      console.error('[provisionAgent] Vapi register failed:', vapiRes.status, txt)
      return {
        ok: false,
        status: 502,
        error: 'Vapi registration failed (Twilio number retained for retry)',
      }
    }
    // Capture phoneNumber UUID for H8 entitlement deprovision.
    try {
      const vapiData = (await vapiRes.json()) as { id?: string }
      const vapiPhoneNumberId = vapiData?.id ?? null
      if (vapiPhoneNumberId) {
        await supabase
          .from('businesses')
          .update({ vapi_phone_number_id: vapiPhoneNumberId })
          .eq('id', businessId)
      } else {
        await sendAdminTelegram(
          `WARNING: Vapi phone-number POST did not return an id for ${business.name}. ` +
          `H8 unassign/reassign will not work for this customer. Manual backfill required.`,
        ).catch(() => {})
      }
    } catch (parseErr) {
      console.error('[provisionAgent] Vapi response parse failed:', parseErr)
    }
  } catch (e) {
    console.error('[provisionAgent] Vapi exception:', e)
    return {
      ok: false,
      status: 502,
      error: 'Vapi provisioning failed (Twilio number retained for retry)',
    }
  }

  // Flip agent_status
  await supabase.from('businesses').update({
    agent_status: 'live',
    agent_approved_at: new Date().toISOString(),
  }).eq('id', businessId)

  return {
    ok: true,
    phone_number: twilioNumber,
    vapi_agent_id: business.vapi_agent_id,
  }
}
