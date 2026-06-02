// POST /api/portal/support/chat — mobile in-app support assistant.
// Replaces the mobile mockSupportHandler with a real Grok reply. Bearer (or
// cookie) via requireClient. Body: { message, history?: [{role, content}] }.

import { NextResponse } from 'next/server'
import { requireClient } from '@/lib/portal-auth'
import { grokChat, type GrokMessage } from '@/lib/grok'

export const dynamic = 'force-dynamic'

const SYSTEM = `You are the in-app support assistant for TalkMate, an AI receptionist for Australian small businesses.
You help business owners use their TalkMate portal and mobile app: understanding calls, bookings, the dispatch board, VIP callers, callbacks, missed-call win-back, Google review requests, the SMS inbox, the AI website chatbot, plans and billing.
Be concise, friendly, and practical. Use Australian English. If a request needs a human (billing changes, account changes, technical faults), tell them to email hello@talkmate.com.au or use the in-portal contact, and say a human will follow up. Never invent features or prices. If unsure, say you'll confirm and come back.`

export async function POST(request: Request) {
  const auth = await requireClient(request)
  if ('error' in auth) return auth.error

  const body = (await request.json().catch(() => ({}))) as { message?: unknown; history?: unknown }
  const message = String(body.message ?? '').trim()
  if (!message) return NextResponse.json({ error: 'message is required' }, { status: 400 })

  const history: GrokMessage[] = Array.isArray(body.history)
    ? (body.history as Array<{ role?: unknown; content?: unknown }>)
        .filter(m => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
        .slice(-8)
        .map(m => ({ role: m.role as 'user' | 'assistant', content: String(m.content) }))
    : []

  const messages: GrokMessage[] = [
    { role: 'system', content: SYSTEM },
    ...history,
    { role: 'user', content: message },
  ]

  try {
    const reply = await grokChat(messages, { temperature: 0.4, maxTokens: 400 })
    return NextResponse.json({ ok: true, reply })
  } catch {
    return NextResponse.json(
      { ok: true, reply: "I'm having trouble right now. For anything urgent, email hello@talkmate.com.au and a human will help." },
    )
  }
}
