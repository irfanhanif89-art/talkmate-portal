// Public — create a chat session. No user auth; service role + IP rate limit.
// Body: { businessId, visitorId, sourceUrl }. Returns { sessionId }.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { CHAT_CORS_HEADERS, getClientIp, hashIp, checkRateLimit } from '@/lib/chat'

export const dynamic = 'force-dynamic'

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CHAT_CORS_HEADERS })
}

export async function POST(request: NextRequest) {
  let body: { businessId?: string; visitorId?: string; sourceUrl?: string }
  try { body = await request.json() as typeof body }
  catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400, headers: CHAT_CORS_HEADERS }) }

  const { businessId, visitorId, sourceUrl } = body
  if (!businessId || !visitorId) {
    return NextResponse.json({ error: 'missing_fields' }, { status: 400, headers: CHAT_CORS_HEADERS })
  }

  const admin = createAdminClient()
  const ipHash = hashIp(getClientIp(request))

  // 10 new sessions per IP per hour.
  const ok = await checkRateLimit(admin, ipHash, 'chat_session', 10, 60 * 60 * 1000)
  if (!ok) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: CHAT_CORS_HEADERS })
  }

  // Business must exist and have the chatbot switched on.
  const { data: business } = await admin
    .from('businesses')
    .select('id, chatbot_enabled')
    .eq('id', businessId)
    .limit(1)
    .maybeSingle()
  if (!business || !business.chatbot_enabled) {
    return NextResponse.json({ error: 'chatbot_unavailable' }, { status: 404, headers: CHAT_CORS_HEADERS })
  }

  const { data: session, error } = await admin
    .from('chat_sessions')
    .insert({
      business_id: businessId,
      visitor_id: visitorId,
      source_url: sourceUrl ?? null,
    })
    .select('id')
    .single()

  if (error || !session) {
    return NextResponse.json({ error: 'session_create_failed' }, { status: 500, headers: CHAT_CORS_HEADERS })
  }

  return NextResponse.json({ sessionId: session.id }, { headers: CHAT_CORS_HEADERS })
}
