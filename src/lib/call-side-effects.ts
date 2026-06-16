// Post-call side-effects, shared by BOTH ingestion paths:
//   - /api/webhooks/vapi      (push; currently dead on Vapi's side)
//   - /api/cron/vapi-call-sync (pull; the live ingestion path since 2026-06-11)
//
// These are the owner call-alert SMS and the missed-call win-back SMS. They used
// to live inline in the webhook handler, so when the webhook started 401-ing they
// silently stopped firing for live clients. Moving them here, keyed off the
// `calls.side_effects_at` claim stamp (migration 084), means whichever path
// reaches a call first runs them exactly once — the other path and repeated cron
// cycles skip. Win-back additionally self-guards on `winback_sent`.
//
// Deliberately NOT included here (unchanged, webhook-only): CRM contact upsert,
// in-portal notification feed, industry side-tables, Make.com fan-out, ServiceM8
// push, and CI scoring (scoring is handled by /api/cron/score-pending-calls).

import type { createAdminClient } from '@/lib/supabase/server'
import { sendSMS } from '@/lib/sms'

type Admin = ReturnType<typeof createAdminClient>

interface SideEffectCall {
  id: string
  business_id: string
  vapi_call_id: string | null
  caller_number: string | null
  duration_seconds: number | null
  ended_reason: string | null
  transcript: string | null
  summary: string | null
}

interface SideEffectBusiness {
  id: string
  name: string | null
  escalation_number: string | null
  talkmate_number: string | null
  twilio_phone_number: string | null
  winback_enabled: boolean | null
  winback_custom_message: string | null
  is_demo: boolean | null
  account_status: string | null
}

/**
 * Run the post-call SMS side-effects for one call, exactly once across all
 * ingestion paths. `callId` is the `calls.id` UUID. Never throws.
 */
export async function runCallSideEffects(supabase: Admin, callId: string): Promise<void> {
  try {
    const { data: call } = await supabase
      .from('calls')
      .select('id, business_id, vapi_call_id, caller_number, duration_seconds, ended_reason, transcript, summary, side_effects_at')
      .eq('id', callId)
      .maybeSingle()
    if (!call || !call.business_id) return

    // Already handled by the other path? (cheap pre-check before the claim)
    if ((call as { side_effects_at?: string | null }).side_effects_at) return

    // Atomic claim: only the first caller flips null -> now() and gets a row back.
    const { data: claimed } = await supabase
      .from('calls')
      .update({ side_effects_at: new Date().toISOString() })
      .eq('id', callId)
      .is('side_effects_at', null)
      .select('id')
    if (!claimed || claimed.length === 0) return // someone else claimed it first

    const { data: bizRow } = await supabase
      .from('businesses')
      .select('id, name, escalation_number, talkmate_number, twilio_phone_number, winback_enabled, winback_custom_message, is_demo, account_status')
      .eq('id', call.business_id)
      .limit(1)
      .maybeSingle()
    if (!bizRow) return
    const business = bizRow as SideEffectBusiness

    // Never text from the demo business or a non-live account.
    if (business.is_demo) return
    if (business.account_status && !['active', 'trial'].includes(business.account_status)) return

    const c = call as SideEffectCall
    const callerPhone = c.caller_number ?? null

    // 1. Owner "you got a call" alert (fires on every call, as before).
    await sendOwnerCallAlert(business, callerPhone, c.summary)

    // 2. Missed-call win-back (self-guards on winback_sent + abandon criteria).
    await maybeSendWinback(
      supabase,
      business,
      c.id,
      c.vapi_call_id ?? c.id,
      callerPhone,
      c.duration_seconds ?? 0,
      c.ended_reason,
      c.transcript ?? '',
    )
  } catch (e) {
    console.error('[call-side-effects] failed', { callId, error: (e as Error).message })
  }
}

// ── owner SMS (verbatim behaviour from the old webhook) ────────────────────────

async function sendOwnerCallAlert(
  business: SideEffectBusiness,
  callerPhone: string | null,
  summary: string | null,
): Promise<void> {
  const toNumber = business.escalation_number
  const fromNumber = business.talkmate_number ?? process.env.TWILIO_PHONE_NUMBER
  if (!toNumber || !fromNumber) return

  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  if (!accountSid || !authToken) return

  const caller = callerPhone ?? 'Unknown'
  const bizName = business.name ?? 'Your business'
  const summaryText = summary ? summary.replace(/\n+/g, ' ').substring(0, 400) : 'No summary available.'
  const body = `📞 ${bizName} — New call\nFrom: ${caller}\n\n${summaryText}\n\nReply to this number to call back.`

  try {
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`
    const params = new URLSearchParams({ To: toNumber, From: fromNumber, Body: body })
    const resp = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    })
    if (!resp.ok) {
      const err = await resp.text()
      console.error('[call-side-effects] owner SMS failed', { status: resp.status, err: err.substring(0, 200) })
    }
  } catch (e) {
    console.error('[call-side-effects] owner SMS exception', (e as Error).message)
  }
}

// ── missed-call win-back (verbatim behaviour from the old webhook) ─────────────

const WINBACK_ABANDON_REASONS = new Set([
  'customer-hangup',
  'customer-did-not-answer',
  'voicemail',
  'silence-timed-out',
])
const WINBACK_DURATION_THRESHOLD_SECONDS = 15
const WINBACK_MAX_TRANSCRIPT_CHARS = 25

async function maybeSendWinback(
  supabase: Admin,
  business: SideEffectBusiness,
  callRowId: string,
  vapiCallId: string,
  callerPhone: string | null,
  durationSeconds: number,
  endedReason: string | null,
  transcript: string,
): Promise<void> {
  if (!callerPhone) return
  if (durationSeconds >= WINBACK_DURATION_THRESHOLD_SECONDS) return
  if (!endedReason || !WINBACK_ABANDON_REASONS.has(endedReason)) return
  if (transcript && transcript.trim().length >= WINBACK_MAX_TRANSCRIPT_CHARS) return

  // Stamp the abandoned flag regardless of whether we send (cron review-follow-up
  // uses it to skip these calls).
  await supabase
    .from('calls')
    .update({ was_abandoned: true, abandoned_at: new Date().toISOString() })
    .eq('id', callRowId)

  if (business.winback_enabled === false) return

  // Idempotency: never double-text across retries / both paths.
  const { data: existing } = await supabase
    .from('calls')
    .select('winback_sent')
    .eq('id', callRowId)
    .limit(1)
    .maybeSingle()
  if (existing?.winback_sent === true) return

  // Opt-out check against the contact row (contacts uses client_id).
  const { data: contact } = await supabase
    .from('contacts')
    .select('id, sms_opted_out')
    .eq('client_id', business.id)
    .eq('phone', callerPhone)
    .eq('is_merged', false)
    .limit(1)
    .maybeSingle()
  if (contact?.sms_opted_out === true) return

  const bizName = business.name ?? 'us'
  const custom = business.winback_custom_message?.trim() ?? ''
  let message = custom
    ? custom.replace(/\{business_name\}/gi, bizName)
    : `Hey, we missed your call at ${bizName}. We are here to help, how can we assist?`
  // Australian Spam Act: commercial SMS needs a functional unsubscribe.
  if (!/\bstop\b/i.test(message)) message += ' Reply STOP to opt out.'

  const fromNumber = business.twilio_phone_number ?? business.talkmate_number ?? undefined

  const result = await sendSMS({
    to: callerPhone,
    message,
    clientId: business.id,
    smsType: 'missed_call_winback',
    from: fromNumber,
    sentBy: 'winback',
  })

  if (result.success) {
    await supabase
      .from('calls')
      .update({ winback_sent: true, winback_sent_at: new Date().toISOString() })
      .eq('id', callRowId)
    await supabase
      .from('roi_events')
      .insert({ business_id: business.id, event_type: 'winback_sent', source_id: callRowId, source_table: 'calls' })
      .then(() => {}, () => {})
  } else {
    console.warn('[call-side-effects] winback send failed', { vapiCallId, reason: result.reason, error: result.error })
  }
}
