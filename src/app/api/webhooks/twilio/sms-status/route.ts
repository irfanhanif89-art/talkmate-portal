// Twilio outbound SMS status webhook — POST /api/webhooks/twilio/sms-status
//
// Twilio fires this callback for every status change on an OUTBOUND
// message (queued → sent → delivered or failed). We use it to capture
// the SMS that Vapi sends via its built-in auto-reply path: Vapi calls
// the Twilio REST API directly with the shared Twilio creds, so those
// messages never pass through src/lib/sms.ts and never get logged to
// sms_messages without this callback.
//
// Dedup: messages we sent through lib/sms.ts already have a row keyed
// on twilio_message_sid — we check before inserting and skip if found.
// First-class signature validation (same shape as sms-inbound).
//
// Sprint Session 1 follow-up — closes the "Vapi auto-reply not in
// Inbox" gap noted in DEPLOYMENT.md.

import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createAdminClient } from '@/lib/supabase/server'
import { normaliseAuPhone } from '@/lib/sms'

// We only care about the first "sent" event — that's when Twilio has
// actually pushed the message out. Subsequent 'delivered'/'undelivered'
// callbacks for the same SID would re-do work, so we let them no-op.
const HANDLED_STATUSES = new Set(['sent', 'delivered'])

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
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '')
  if (base) return `${base}/api/webhooks/twilio/sms-status`
  return request.nextUrl.toString().split('?')[0]
}

// Fetch the message body from the Twilio REST API. The status callback
// only carries MessageSid + status fields, not the body — but for the
// in-portal Inbox we need to display what was actually sent.
async function fetchMessageBody(messageSid: string): Promise<string | null> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  if (!accountSid || !authToken) return null
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages/${messageSid}.json`
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64')
  try {
    const res = await fetch(url, { headers: { Authorization: `Basic ${auth}` } })
    if (!res.ok) {
      console.warn('[twilio-status] fetch body non-OK', { messageSid, status: res.status })
      return null
    }
    const data = await res.json() as { body?: string }
    return typeof data.body === 'string' ? data.body : null
  } catch (e) {
    console.warn('[twilio-status] fetch body failed', { messageSid, err: (e as Error).message })
    return null
  }
}

export async function POST(request: NextRequest) {
  let rawBody: string
  try { rawBody = await request.text() } catch { return new NextResponse('', { status: 400 }) }
  const formParams = Object.fromEntries(new URLSearchParams(rawBody).entries())

  // Signature check — fail closed if TWILIO_AUTH_TOKEN is unset.
  const authToken = process.env.TWILIO_AUTH_TOKEN
  if (!authToken) {
    console.error('[twilio-status] TWILIO_AUTH_TOKEN unset — rejecting (fail closed)')
    return new NextResponse('Forbidden', { status: 403 })
  }
  const signature = request.headers.get('x-twilio-signature') ?? ''
  const url = getWebhookUrl(request)
  if (!verifyTwilioSignature(authToken, signature, url, formParams)) {
    console.warn('[twilio-status] signature invalid')
    return new NextResponse('Forbidden', { status: 403 })
  }

  const messageSid = formParams.MessageSid ?? ''
  const messageStatus = (formParams.MessageStatus ?? '').toLowerCase()
  const fromRaw = formParams.From ?? ''
  const toRaw = formParams.To ?? ''

  if (!messageSid || !HANDLED_STATUSES.has(messageStatus)) {
    // Acknowledge but don't process — Twilio fires multiple statuses
    // per message and we only need the first useful one.
    return new NextResponse(null, { status: 204 })
  }

  const supabase = createAdminClient()

  // Idempotency: if we already logged this message (via /lib/sms.ts
  // when WE sent it, or via an earlier status callback for the same
  // SID), skip. Status callbacks fire multiple times per message.
  const { data: existing } = await supabase
    .from('sms_messages')
    .select('id, status')
    .eq('twilio_message_sid', messageSid)
    .limit(1)
    .maybeSingle()
  if (existing) {
    // Promote 'sent' → 'delivered' so the Inbox bubble reflects the
    // final state, but don't re-insert.
    if (messageStatus === 'delivered' && existing.status !== 'delivered') {
      await supabase
        .from('sms_messages')
        .update({ status: 'delivered' })
        .eq('id', existing.id)
    }
    return new NextResponse(null, { status: 204 })
  }

  // From this point on we're logging a Vapi auto-reply (or any other
  // outbound that bypassed lib/sms.ts). The From is the business's
  // number, the To is the customer.
  const business = await findBusinessByFrom(supabase, fromRaw)
  if (!business) {
    // Unknown sender — common for ops numbers (Hayden's dispatcher
    // loop, demo lines). Don't error; just no-op.
    return new NextResponse(null, { status: 204 })
  }

  const toPhone = normaliseAuPhone(toRaw) ?? toRaw
  const body = await fetchMessageBody(messageSid)
  if (!body) {
    // Without the body we have nothing to show in the Inbox. Log and
    // bail — the message still went out, just won't appear in the UI.
    return new NextResponse(null, { status: 204 })
  }

  // Upsert contact + conversation so the Inbox has somewhere to land
  // the row. Mirrors src/lib/sms.ts logToInbox almost exactly.
  let contactId: string | null = null
  const { data: contact } = await supabase
    .from('contacts')
    .select('id')
    .eq('client_id', business.id)
    .eq('phone', toPhone)
    .eq('is_merged', false)
    .limit(1)
    .maybeSingle()
  contactId = (contact?.id as string | undefined) ?? null

  const preview = body.length > 80 ? `${body.slice(0, 77)}...` : body
  const { data: convo, error: convoErr } = await supabase
    .from('sms_conversations')
    .upsert({
      business_id: business.id,
      contact_id: contactId,
      phone_number: toPhone,
      last_message_at: new Date().toISOString(),
      last_message_preview: preview,
    }, { onConflict: 'business_id,phone_number' })
    .select('id')
    .single()
  if (convoErr || !convo) {
    console.error('[twilio-status] sms_conversations upsert failed', convoErr?.message)
    return new NextResponse(null, { status: 204 })
  }

  const { error: msgErr } = await supabase.from('sms_messages').insert({
    conversation_id: convo.id as string,
    business_id: business.id,
    direction: 'outbound',
    body,
    status: messageStatus,    // 'sent' or 'delivered'
    twilio_message_sid: messageSid,
    sent_by: 'vapi',          // Anything that didn't come via lib/sms.ts is Vapi-side auto-reply
  })
  if (msgErr) {
    console.error('[twilio-status] sms_messages insert failed', msgErr.message)
  }

  return new NextResponse(null, { status: 204 })
}

interface BusinessRow { id: string }

async function findBusinessByFrom(
  supabase: ReturnType<typeof createAdminClient>,
  fromRaw: string,
): Promise<BusinessRow | null> {
  const { data: a } = await supabase
    .from('businesses')
    .select('id')
    .eq('twilio_phone_number', fromRaw)
    .limit(1)
    .maybeSingle()
  if (a) return a as BusinessRow
  const { data: b } = await supabase
    .from('businesses')
    .select('id')
    .eq('talkmate_number', fromRaw)
    .limit(1)
    .maybeSingle()
  if (b) return b as BusinessRow
  return null
}
