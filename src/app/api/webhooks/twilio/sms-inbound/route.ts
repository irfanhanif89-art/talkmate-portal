// Twilio inbound SMS webhook — POST /api/webhooks/twilio/sms-inbound
//
// Receives inbound text messages from Twilio and lands them in
// sms_conversations / sms_messages so they appear in the in-portal
// inbox. Looks up the receiving business by the Twilio "To" number
// (businesses.twilio_phone_number, added in migration 060).
//
// Auth: HMAC-SHA1 signature validation using TWILIO_AUTH_TOKEN.
// When the env var is unset we accept unauthenticated so the first
// Twilio probe doesn't 401 — DEPLOYMENT.md flags this as required
// before going live.
//
// STOP handling: if the body matches Twilio's compliance keywords
// (STOP, STOPALL, UNSUBSCRIBE, CANCEL, END, QUIT) we set
// contacts.sms_opted_out so future outbound sends will be filtered.
// Twilio handles the actual "STOP confirmation" reply on its end —
// we don't send one ourselves.
//
// Always returns 200 with empty TwiML so Twilio doesn't retry on
// internal failures.

import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createAdminClient } from '@/lib/supabase/server'
import { normaliseAuPhone } from '@/lib/sms'

const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>'
const STOP_KEYWORDS = new Set(['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT'])
const START_KEYWORDS = new Set(['START', 'YES', 'UNSTOP'])

function twimlResponse(body = EMPTY_TWIML, status = 200): NextResponse {
  return new NextResponse(body, {
    status,
    headers: { 'Content-Type': 'text/xml' },
  })
}

// Twilio's signature algorithm:
//   1. Take the full request URL (no query string for POST x-www-form-urlencoded)
//   2. Append each POST param sorted alphabetically: `key + value`
//   3. HMAC-SHA1 with the auth token, base64-encode the digest
//   4. Compare to X-Twilio-Signature header (constant-time)
// Reference: https://www.twilio.com/docs/usage/security#validating-requests
function verifyTwilioSignature(
  authToken: string,
  signature: string,
  url: string,
  params: Record<string, string>,
): boolean {
  if (!signature) return false
  const sortedKeys = Object.keys(params).sort()
  const data = sortedKeys.reduce((acc, k) => acc + k + params[k], url)
  const expected = crypto
    .createHmac('sha1', authToken)
    .update(Buffer.from(data, 'utf-8'))
    .digest('base64')
  if (expected.length !== signature.length) return false
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
}

function getWebhookUrl(request: NextRequest): string {
  // Prefer NEXT_PUBLIC_APP_URL since Twilio signs the exact public URL,
  // not whatever Vercel's internal proxy header reports. The request URL
  // surfaced by Next under x-forwarded-* sometimes drops the trailing
  // /api path under preview deploys.
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '')
  if (base) return `${base}/api/webhooks/twilio/sms-inbound`
  return request.nextUrl.toString().split('?')[0]
}

export async function POST(request: NextRequest) {
  let rawBody: string
  try {
    rawBody = await request.text()
  } catch {
    return twimlResponse(EMPTY_TWIML, 400)
  }

  const formParams = Object.fromEntries(new URLSearchParams(rawBody).entries())

  // Signature check (skipped when TWILIO_AUTH_TOKEN is unset).
  const authToken = process.env.TWILIO_AUTH_TOKEN
  if (authToken) {
    const signature = request.headers.get('x-twilio-signature') ?? ''
    const url = getWebhookUrl(request)
    if (!verifyTwilioSignature(authToken, signature, url, formParams)) {
      console.warn('[twilio-inbound] signature invalid', { url, hasSig: Boolean(signature) })
      return new NextResponse('Forbidden', { status: 403 })
    }
  }

  const fromRaw = formParams.From ?? ''
  const toRaw = formParams.To ?? ''
  const body = formParams.Body ?? ''
  const messageSid = formParams.MessageSid ?? null

  if (!fromRaw || !toRaw) {
    console.warn('[twilio-inbound] missing From/To', { fromRaw, toRaw })
    return twimlResponse()
  }

  // Normalise the From number to E.164 AU. Twilio always provides
  // E.164 but we run it through anyway to stay symmetric with how
  // sendSMS stores outbound numbers — that way the conversation
  // upsert hits the same key on both sides.
  const fromPhone = normaliseAuPhone(fromRaw) ?? fromRaw

  const supabase = createAdminClient()

  // Find the business by Twilio To number. Try both the new
  // twilio_phone_number column (canonical) and talkmate_number as a
  // fallback for clients onboarded before migration 060.
  const { data: businessByTwilio } = await supabase
    .from('businesses')
    .select('id, name')
    .eq('twilio_phone_number', toRaw)
    .limit(1)
    .maybeSingle()
  let business = businessByTwilio
  if (!business) {
    const { data: businessByTalkmate } = await supabase
      .from('businesses')
      .select('id, name')
      .eq('talkmate_number', toRaw)
      .limit(1)
      .maybeSingle()
    business = businessByTalkmate
  }

  if (!business) {
    console.warn('[twilio-inbound] no business matched To number', { toRaw })
    return twimlResponse()
  }

  // Upsert contact first so the conversation can FK to it. The
  // contacts table is keyed by (client_id, phone), so we match the
  // existing Vapi upsertContact shape from /api/webhooks/vapi/route.ts.
  const nowIso = new Date().toISOString()
  let contactId: string | null = null
  const { data: existingContact } = await supabase
    .from('contacts')
    .select('id, sms_opted_out')
    .eq('client_id', business.id)
    .eq('phone', fromPhone)
    .eq('is_merged', false)
    .maybeSingle()
  if (existingContact) {
    contactId = existingContact.id as string
    await supabase
      .from('contacts')
      .update({ last_seen: nowIso })
      .eq('id', existingContact.id)
  } else {
    const { data: created, error: insertErr } = await supabase
      .from('contacts')
      .insert({
        client_id: business.id,
        phone: fromPhone,
        first_seen: nowIso,
        last_seen: nowIso,
        call_count: 0,
      })
      .select('id')
      .single()
    if (insertErr || !created) {
      console.error('[twilio-inbound] contacts insert failed', insertErr?.message)
    } else {
      contactId = created.id as string
    }
  }

  // STOP / START keyword handling. We update sms_opted_out on the
  // contact row; Twilio's compliance layer handles the actual STOP
  // confirmation SMS so we don't double-text.
  const trimmedBody = body.trim().toUpperCase()
  if (STOP_KEYWORDS.has(trimmedBody) && contactId) {
    await supabase
      .from('contacts')
      .update({ sms_opted_out: true, sms_opted_out_at: nowIso })
      .eq('id', contactId)
  } else if (START_KEYWORDS.has(trimmedBody) && contactId) {
    await supabase
      .from('contacts')
      .update({ sms_opted_out: false, sms_opted_out_at: null })
      .eq('id', contactId)
  }

  // Upsert conversation by (business_id, phone_number). The UNIQUE
  // constraint from migration 060 makes this idempotent.
  const preview = body.length > 80 ? `${body.slice(0, 77)}...` : body
  const { data: convo, error: convoErr } = await supabase
    .from('sms_conversations')
    .upsert({
      business_id: business.id,
      contact_id: contactId,
      phone_number: fromPhone,
      last_message_at: nowIso,
      last_message_preview: preview,
    }, { onConflict: 'business_id,phone_number' })
    .select('id, unread_count')
    .single()
  if (convoErr || !convo) {
    console.error('[twilio-inbound] sms_conversations upsert failed', convoErr?.message)
    return twimlResponse()
  }

  // Bump unread_count manually — Supabase upsert doesn't support
  // arithmetic on conflict. The unread counter is what drives the
  // sidebar badge.
  await supabase
    .from('sms_conversations')
    .update({ unread_count: ((convo.unread_count as number | null) ?? 0) + 1 })
    .eq('id', convo.id as string)

  // Insert the inbound message.
  const { error: msgErr } = await supabase.from('sms_messages').insert({
    conversation_id: convo.id as string,
    business_id: business.id,
    direction: 'inbound',
    body,
    status: 'received',
    twilio_message_sid: messageSid,
    sent_by: 'system',
  })
  if (msgErr) {
    console.error('[twilio-inbound] sms_messages insert failed', msgErr.message)
  }

  return twimlResponse()
}
