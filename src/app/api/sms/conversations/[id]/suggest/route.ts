// POST /api/sms/conversations/[id]/suggest
// Optional: ?adminClientId=<uuid> for admin-as-client mode.
//
// Returns a Grok-suggested reply for the open conversation. Used by
// the "AI Suggest" button in the inbox composer.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { grokChat, GrokError } from '@/lib/grok'
import { resolveBusinessId } from '@/lib/resolve-business'

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params
  const adminClientId = request.nextUrl.searchParams.get('adminClientId')
  const auth = await resolveBusinessId(adminClientId)
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const admin = createAdminClient()

  // Ownership check + fetch business name
  const { data: convo } = await admin
    .from('sms_conversations')
    .select('id, contact_id, business_id, business:businesses!sms_conversations_business_id_fkey ( name )')
    .eq('id', id)
    .eq('business_id', auth.businessId)
    .limit(1)
    .maybeSingle()
  if (!convo) return NextResponse.json({ ok: false }, { status: 404 })

  // PostgREST embeds always returns an array even when the FK side is 1:1,
  // so we accept both shapes and pick the first.
  const convoBiz = (convo as unknown as { business?: { name: string | null } | { name: string | null }[] | null }).business
  const businessName = (Array.isArray(convoBiz) ? convoBiz[0]?.name : convoBiz?.name) ?? 'the business'

  const { data: history } = await admin
    .from('sms_messages')
    .select('direction, body, created_at')
    .eq('conversation_id', id)
    .order('created_at', { ascending: false })
    .limit(10)

  const ordered = (history ?? []).reverse()
  if (ordered.length === 0) {
    return NextResponse.json({ ok: false, error: 'empty_thread' }, { status: 400 })
  }

  const transcript = ordered
    .map(m => `${m.direction === 'inbound' ? 'Customer' : 'Business'}: ${m.body}`)
    .join('\n')

  try {
    const suggestion = await grokChat(
      [
        {
          role: 'system',
          content:
            `You are a helpful assistant drafting an SMS reply on behalf of ${businessName}. ` +
            `Write a short, professional reply (under 160 characters) that answers the customer's most recent message. ` +
            `Be warm but concise. Do not use emoji. Do not use em dashes. ` +
            `Reply with just the suggested SMS body — no preamble, no quotes.`,
        },
        {
          role: 'user',
          content: `Conversation so far:\n${transcript}\n\nDraft the next reply from the business.`,
        },
      ],
      { temperature: 0.4, maxTokens: 200 },
    )
    return NextResponse.json({ ok: true, suggestion: suggestion.trim() })
  } catch (e) {
    if (e instanceof GrokError) {
      console.error('[sms-suggest] Grok failed', { status: e.status, message: e.message })
      return NextResponse.json({ ok: false, error: 'grok_failed', detail: e.message }, { status: 502 })
    }
    console.error('[sms-suggest] unexpected error', (e as Error).message)
    return NextResponse.json({ ok: false, error: 'unexpected' }, { status: 500 })
  }
}
