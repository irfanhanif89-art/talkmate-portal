// Full transcript for a single chatbot session. Ownership is enforced by
// matching the session's business_id against the resolved business (404 on
// mismatch). Supports admin-as-client via ?adminClientId=<uuid>.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { resolveBusinessId } from '@/lib/resolve-business'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params
  const adminClientId = request.nextUrl.searchParams.get('adminClientId')
  const auth = await resolveBusinessId(adminClientId)
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const admin = createAdminClient()

  const { data: session, error: sessionErr } = await admin
    .from('chat_sessions')
    .select(
      'id, business_id, contact_id, visitor_id, source_url, lead_captured, lead_name, lead_phone, lead_email, started_at, ended_at, message_count, status',
    )
    .eq('id', id)
    .eq('business_id', auth.businessId)
    .maybeSingle()

  if (sessionErr) {
    console.error('[chatbot/sessions/:id] load failed', sessionErr.message)
    return NextResponse.json({ ok: false, error: 'load_failed' }, { status: 500 })
  }
  if (!session) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })
  }

  const { data: messageRows, error: messagesErr } = await admin
    .from('chat_messages')
    .select('role, content, created_at')
    .eq('session_id', id)
    .eq('business_id', auth.businessId)
    .order('created_at', { ascending: true })

  if (messagesErr) {
    console.error('[chatbot/sessions/:id] messages failed', messagesErr.message)
    return NextResponse.json({ ok: false, error: 'load_failed' }, { status: 500 })
  }

  const messages = (messageRows ?? []).map((m) => ({
    role: m.role,
    content: m.content,
    createdAt: m.created_at,
  }))

  return NextResponse.json({
    ok: true,
    session: {
      id: session.id,
      contactId: session.contact_id ?? null,
      visitorId: session.visitor_id,
      sourceUrl: session.source_url ?? null,
      leadCaptured: session.lead_captured,
      leadName: session.lead_name ?? null,
      leadPhone: session.lead_phone ?? null,
      leadEmail: session.lead_email ?? null,
      startedAt: session.started_at,
      endedAt: session.ended_at,
      messageCount: session.message_count,
      status: session.status,
    },
    messages,
  })
}
