// Public — explicit lead capture from the widget's inline form.
// Body: { sessionId, businessId, name, phone, email }
// Upserts the contact, flags the session converted, logs the ROI event and
// texts the business owner so they can follow up fast.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { CHAT_CORS_HEADERS, getClientIp, hashIp, checkRateLimit, upsertContactByPhone } from '@/lib/chat'
import { sendSMS } from '@/lib/sms'

export const dynamic = 'force-dynamic'

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CHAT_CORS_HEADERS })
}

export async function POST(request: NextRequest) {
  let body: { sessionId?: string; businessId?: string; name?: string; phone?: string; email?: string }
  try { body = await request.json() as typeof body }
  catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400, headers: CHAT_CORS_HEADERS }) }

  const { sessionId, businessId, name, phone, email } = body
  if (!sessionId || !businessId || !phone) {
    return NextResponse.json({ error: 'missing_fields' }, { status: 400, headers: CHAT_CORS_HEADERS })
  }

  const admin = createAdminClient()
  const ipHash = hashIp(getClientIp(request))

  // 20 lead submissions per IP per hour (form spam guard).
  const ok = await checkRateLimit(admin, ipHash, 'chat_lead', 20, 60 * 60 * 1000)
  if (!ok) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: CHAT_CORS_HEADERS })
  }

  // Session must belong to this business.
  const { data: session } = await admin
    .from('chat_sessions')
    .select('id, business_id')
    .eq('id', sessionId)
    .eq('business_id', businessId)
    .limit(1)
    .maybeSingle()
  if (!session) {
    return NextResponse.json({ error: 'session_not_found' }, { status: 404, headers: CHAT_CORS_HEADERS })
  }

  const contactId = await upsertContactByPhone(admin, businessId, { name, phone, email })

  await admin.from('chat_sessions').update({
    lead_captured: true,
    lead_name: name ?? null,
    lead_phone: phone,
    lead_email: email ?? null,
    contact_id: contactId,
    status: 'converted',
  }).eq('id', sessionId)

  await admin.from('roi_events').insert({
    business_id: businessId, event_type: 'chat_lead_captured',
    source_id: sessionId, source_table: 'chat_sessions',
  })

  // Text the owner. Non-fatal if owner_phone is unset or the send fails.
  const { data: business } = await admin
    .from('businesses')
    .select('id, owner_phone, name')
    .eq('id', businessId)
    .limit(1)
    .maybeSingle()

  if (business?.owner_phone) {
    void sendSMS({
      to: business.owner_phone as string,
      message: `New chat lead from your website: ${name ?? 'A visitor'} - ${phone}`,
      clientId: businessId,
      smsType: 'chat_lead_notification',
    }).catch(() => {})
  }

  return NextResponse.json({ success: true }, { headers: CHAT_CORS_HEADERS })
}
