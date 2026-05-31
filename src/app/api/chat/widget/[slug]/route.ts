// Public widget config endpoint — no auth, service role, CORS open.
// The embedded widget calls this first to learn the business name, greeting,
// agent name and bubble colour. Looked up by businesses.slug (falls back to id
// when the slug is a UUID, so the embed snippet can use either).

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { CHAT_CORS_HEADERS } from '@/lib/chat'

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CHAT_CORS_HEADERS })
}

export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug } = await ctx.params
  const admin = createAdminClient()

  const column = UUID_RE.test(slug) ? 'id' : 'slug'
  const { data: business } = await admin
    .from('businesses')
    .select('id, name, chatbot_enabled, chatbot_greeting, chatbot_agent_name, chatbot_primary_color, chatbot_collect_leads_after')
    .eq(column, slug)
    .limit(1)
    .maybeSingle()

  const headers = { ...CHAT_CORS_HEADERS, 'Cache-Control': 'public, max-age=60, s-maxage=60' }

  if (!business) {
    return NextResponse.json({ enabled: false }, { status: 404, headers })
  }
  if (!business.chatbot_enabled) {
    return NextResponse.json({ enabled: false }, { headers })
  }

  return NextResponse.json({
    enabled: true,
    businessId: business.id,
    businessName: business.name ?? 'our team',
    greeting: business.chatbot_greeting ?? 'Hi! How can I help you today?',
    agentName: business.chatbot_agent_name ?? 'TalkMate',
    primaryColor: business.chatbot_primary_color ?? '#E8622A',
    collectLeadsAfter: business.chatbot_collect_leads_after ?? 2,
  }, { headers })
}
