// Public — send a visitor message, get the AI reply. No user auth; service role
// + IP/session rate limits + spam guard. This is the chatbot's brain:
// it pulls the business knowledge base, builds the system prompt, calls Grok,
// stores both turns and logs ROI events.
//
// Body: { sessionId, businessId, message, visitorId }
// Returns: { response, sessionId, leadCaptured }

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import {
  CHAT_CORS_HEADERS, MAX_MESSAGE_LENGTH, getClientIp, hashIp,
  checkRateLimit, looksLikeSpam, buildSystemPrompt, chatComplete, extractLead,
  upsertContactByPhone, originAllowed, type KbEntry,
} from '@/lib/chat'
import type { GrokMessage } from '@/lib/grok'

export const dynamic = 'force-dynamic'

const SESSION_MESSAGE_CAP = 30 // assistant+user turns per session
const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000
const FALLBACK_REPLY = "Thanks for your message. I'll have someone from the team follow up with you shortly."

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CHAT_CORS_HEADERS })
}

export async function POST(request: NextRequest) {
  let body: { sessionId?: string; businessId?: string; message?: string; visitorId?: string }
  try { body = await request.json() as typeof body }
  catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400, headers: CHAT_CORS_HEADERS }) }

  const { sessionId, businessId, message } = body
  if (!sessionId || !businessId || !message) {
    return NextResponse.json({ error: 'missing_fields' }, { status: 400, headers: CHAT_CORS_HEADERS })
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json({ error: 'message_too_long' }, { status: 400, headers: CHAT_CORS_HEADERS })
  }

  const admin = createAdminClient()
  const ipHash = hashIp(getClientIp(request))

  // 100 messages per IP per day.
  const ok = await checkRateLimit(admin, ipHash, 'chat_message', 100, 24 * 60 * 60 * 1000)
  if (!ok) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: CHAT_CORS_HEADERS })
  }

  // Session must exist and belong to this business.
  const { data: session } = await admin
    .from('chat_sessions')
    .select('id, business_id, started_at, message_count, lead_captured, status')
    .eq('id', sessionId)
    .eq('business_id', businessId)
    .limit(1)
    .maybeSingle()
  if (!session) {
    return NextResponse.json({ error: 'session_not_found' }, { status: 404, headers: CHAT_CORS_HEADERS })
  }

  // Read-only once a session ages out or hits the per-session cap.
  if (Date.now() - new Date(session.started_at as string).getTime() > SESSION_MAX_AGE_MS) {
    return NextResponse.json({ error: 'session_expired' }, { status: 410, headers: CHAT_CORS_HEADERS })
  }
  if ((session.message_count as number) >= SESSION_MESSAGE_CAP) {
    return NextResponse.json({ error: 'session_message_limit' }, { status: 429, headers: CHAT_CORS_HEADERS })
  }

  // Pull business config for the prompt.
  const { data: business } = await admin
    .from('businesses')
    .select('id, name, plan, chatbot_enabled, chatbot_agent_name, chatbot_collect_leads_after, chatbot_allowed_domains')
    .eq('id', businessId)
    .limit(1)
    .maybeSingle()
  if (!business || !business.chatbot_enabled || business.plan === 'starter') {
    return NextResponse.json({ error: 'chatbot_unavailable' }, { status: 404, headers: CHAT_CORS_HEADERS })
  }
  if (!originAllowed(request, business.chatbot_allowed_domains as string[] | null)) {
    return NextResponse.json({ error: 'origin_not_allowed' }, { status: 403, headers: CHAT_CORS_HEADERS })
  }

  // Store the visitor turn.
  await admin.from('chat_messages').insert({
    session_id: sessionId, business_id: businessId, role: 'user', content: message,
  })

  const isFirstMessage = (session.message_count as number) === 0
  if (isFirstMessage) {
    await admin.from('roi_events').insert({
      business_id: businessId, event_type: 'chat_session_started',
      source_id: sessionId, source_table: 'chat_sessions',
    })
  }

  // Spam → cheap neutral reply, no Grok call. We track whether the bot fell
  // back to the canned reply (spam or Grok failure) so the portal can show a
  // deflection rate.
  let reply: string
  let usedFallback = false
  if (looksLikeSpam(message)) {
    reply = FALLBACK_REPLY
    usedFallback = true
  } else {
    const { data: kb } = await admin
      .from('knowledge_base_entries')
      .select('question, answer, category')
      .eq('business_id', businessId)
      .eq('is_active', true)
      .order('category', { ascending: true })
      .order('sort_order', { ascending: true })
      .limit(50)

    const { data: history } = await admin
      .from('chat_messages')
      .select('role, content')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })
      .limit(10)

    const recent = (history ?? []).reverse() as Array<{ role: string; content: string }>

    const systemPrompt = buildSystemPrompt({
      agentName: (business.chatbot_agent_name as string | null) ?? 'TalkMate',
      businessName: (business.name as string | null) ?? 'our team',
      kbEntries: (kb ?? []) as KbEntry[],
      collectLeadsAfter: (business.chatbot_collect_leads_after as number | null) ?? 2,
    })

    const messages: GrokMessage[] = [
      { role: 'system', content: systemPrompt },
      ...recent.map(m => ({
        role: (m.role === 'assistant' ? 'assistant' : 'user') as GrokMessage['role'],
        content: m.content,
      })),
    ]

    try {
      const out = (await chatComplete(messages)).trim()
      if (out) { reply = out } else { reply = FALLBACK_REPLY; usedFallback = true }
    } catch {
      reply = FALLBACK_REPLY
      usedFallback = true
    }
  }

  // Store the assistant turn.
  await admin.from('chat_messages').insert({
    session_id: sessionId, business_id: businessId, role: 'assistant', content: reply, is_fallback: usedFallback,
  })

  // Did the visitor volunteer contact details mid-chat?
  let leadCaptured = Boolean(session.lead_captured)
  if (!leadCaptured) {
    const lead = extractLead(message)
    if (lead.phone) {
      leadCaptured = true
      const contactId = await upsertContactByPhone(admin, businessId, { name: lead.name, phone: lead.phone })

      await admin.from('chat_sessions').update({
        lead_captured: true,
        lead_name: lead.name ?? null,
        lead_phone: lead.phone,
        contact_id: contactId,
        status: 'converted',
      }).eq('id', sessionId)

      await admin.from('roi_events').insert({
        business_id: businessId, event_type: 'chat_lead_captured',
        source_id: sessionId, source_table: 'chat_sessions',
      })
    }
  }

  await admin.from('chat_sessions')
    .update({ message_count: (session.message_count as number) + 2 })
    .eq('id', sessionId)

  return NextResponse.json({ response: reply, sessionId, leadCaptured }, { headers: CHAT_CORS_HEADERS })
}
