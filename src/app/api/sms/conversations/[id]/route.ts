// Conversation detail + reply + read-state endpoint.
//
// All three methods accept ?adminClientId=<uuid> for admin-as-client mode.
// GET    /api/sms/conversations/[id] — full thread (last 200 messages)
// POST   /api/sms/conversations/[id] — send a reply via /lib/sms.ts
// PATCH  /api/sms/conversations/[id] — mark conversation read / archive

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { sendSMS } from '@/lib/sms'
import { resolveBusinessId } from '@/lib/resolve-business'

interface ConvoOwnership {
  id: string
  business_id: string
  phone_number: string
  business: {
    twilio_phone_number: string | null
  } | null
}

async function authoriseConvo(
  conversationId: string,
  adminClientId: string | null,
  req: NextRequest,
): Promise<{ business_id: string; phone_number: string; from: string | null; isAdmin: boolean } | { error: string; status: number }> {
  const auth = await resolveBusinessId(adminClientId, req)
  if (!auth.ok) return { error: auth.error, status: auth.status }

  const admin = createAdminClient()
  const { data: convo } = await admin
    .from('sms_conversations')
    .select(`
      id, business_id, phone_number,
      business:businesses!sms_conversations_business_id_fkey ( twilio_phone_number )
    `)
    .eq('id', conversationId)
    .eq('business_id', auth.businessId)
    .limit(1)
    .maybeSingle()
  if (!convo) return { error: 'not_found', status: 404 }

  const typed = convo as unknown as ConvoOwnership
  return {
    business_id: typed.business_id,
    phone_number: typed.phone_number,
    from: typed.business?.twilio_phone_number ?? null,
    isAdmin: auth.isAdmin,
  }
}

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params
  const adminClientId = request.nextUrl.searchParams.get('adminClientId')
  const owned = await authoriseConvo(id, adminClientId, request)
  if ('error' in owned) return NextResponse.json({ ok: false, error: owned.error }, { status: owned.status })

  const admin = createAdminClient()
  const { data: convo } = await admin
    .from('sms_conversations')
    .select(`
      id, phone_number, contact_id, last_message_at, last_message_preview,
      unread_count, status, created_at,
      contact:contacts!sms_conversations_contact_id_fkey ( id, name )
    `)
    .eq('id', id)
    .limit(1)
    .maybeSingle()

  const { data: messages } = await admin
    .from('sms_messages')
    .select('id, direction, body, status, sent_by, twilio_message_sid, read_at, created_at')
    .eq('conversation_id', id)
    .order('created_at', { ascending: true })
    .limit(200)

  const c = convo as { contact?: { id: string; name: string | null } | null } & Record<string, unknown> | null
  return NextResponse.json({
    ok: true,
    conversation: {
      id: c?.id ?? id,
      phoneNumber: c?.phone_number ?? null,
      contactId: c?.contact?.id ?? null,
      contactName: c?.contact?.name ?? null,
      unreadCount: c?.unread_count ?? 0,
      status: c?.status ?? null,
      createdAt: c?.created_at ?? null,
    },
    messages: (messages ?? []).map(m => ({
      id: m.id as string,
      direction: m.direction as string,
      body: m.body as string,
      status: m.status as string,
      sentBy: m.sent_by as string,
      twilioSid: m.twilio_message_sid as string | null,
      readAt: m.read_at as string | null,
      createdAt: m.created_at as string,
    })),
  })
}

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params
  const adminClientId = request.nextUrl.searchParams.get('adminClientId')
  const owned = await authoriseConvo(id, adminClientId, request)
  if ('error' in owned) return NextResponse.json({ ok: false, error: owned.error }, { status: owned.status })

  let body: { message?: string }
  try { body = (await request.json()) as { message?: string } }
  catch { return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 }) }

  const message = (body.message ?? '').trim()
  if (!message) return NextResponse.json({ ok: false, error: 'empty_message' }, { status: 400 })
  if (message.length > 1600) {
    return NextResponse.json({ ok: false, error: 'message_too_long' }, { status: 400 })
  }

  const result = await sendSMS({
    to: owned.phone_number,
    message,
    clientId: owned.business_id,
    smsType: 'inbox_reply',
    from: owned.from ?? undefined,
    conversationId: id,
    sentBy: 'human',
  })

  if (!result.success) {
    return NextResponse.json(
      { ok: false, error: result.reason ?? 'send_failed', detail: result.error ?? null },
      { status: 400 },
    )
  }

  const admin = createAdminClient()
  await admin.from('sms_conversations').update({ unread_count: 0 }).eq('id', id)
  await admin
    .from('sms_messages')
    .update({ read_at: new Date().toISOString() })
    .eq('conversation_id', id)
    .eq('direction', 'inbound')
    .is('read_at', null)

  return NextResponse.json({ ok: true, twilioSid: result.sid ?? null })
}

export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params
  const adminClientId = request.nextUrl.searchParams.get('adminClientId')
  const owned = await authoriseConvo(id, adminClientId, request)
  if ('error' in owned) return NextResponse.json({ ok: false, error: owned.error }, { status: owned.status })

  const admin = createAdminClient()
  await admin.from('sms_conversations').update({ unread_count: 0 }).eq('id', id)
  await admin
    .from('sms_messages')
    .update({ read_at: new Date().toISOString() })
    .eq('conversation_id', id)
    .eq('direction', 'inbound')
    .is('read_at', null)

  try {
    const body = (await request.json()) as { archive?: boolean }
    if (body.archive === true) {
      await admin.from('sms_conversations').update({ status: 'archived' }).eq('id', id)
    }
  } catch { /* no body is fine */ }

  return NextResponse.json({ ok: true })
}
