// POST /api/email/send — user auth (or ?adminClientId). Sends a queued message.
// Supports editing the draft body before send (body param) and manual replies.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { resolveBusinessId } from '@/lib/resolve-business'
import { sendQueuedEmail } from '@/lib/email-responder'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const adminClientId = request.nextUrl.searchParams.get('adminClientId')
  const auth = await resolveBusinessId(adminClientId, request)
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  let body: { messageId?: string; threadId?: string; body?: string }
  try { body = await request.json() } catch { return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 }) }

  const admin = createAdminClient()
  let messageId = body.messageId

  // Manual reply path: create a queued human message on the thread first.
  if (!messageId && body.threadId && typeof body.body === 'string') {
    const { data: thread } = await admin
      .from('email_threads').select('id, from_email, subject').eq('id', body.threadId).eq('business_id', auth.businessId).maybeSingle()
    if (!thread) return NextResponse.json({ ok: false, error: 'thread_not_found' }, { status: 404 })
    const { data: created, error } = await admin.from('email_messages').insert({
      thread_id: thread.id, business_id: auth.businessId, direction: 'outbound',
      from_email: thread.from_email, to_email: thread.from_email,
      subject: thread.subject ? `Re: ${thread.subject}` : 'Re: your enquiry',
      body_text: body.body, status: 'queued', sent_by: 'human', ai_drafted: false,
    }).select('id').single()
    if (error || !created) return NextResponse.json({ ok: false, error: error?.message }, { status: 500 })
    messageId = created.id as string
  }

  if (!messageId) return NextResponse.json({ ok: false, error: 'messageId or (threadId+body) required' }, { status: 400 })

  // Verify ownership + apply any edited body.
  const { data: message } = await admin
    .from('email_messages').select('id, business_id, status').eq('id', messageId).maybeSingle()
  if (!message || message.business_id !== auth.businessId) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })
  }
  if (message.status !== 'queued') return NextResponse.json({ ok: false, error: 'not_queued' }, { status: 400 })
  if (typeof body.body === 'string' && body.body.trim()) {
    await admin.from('email_messages').update({ body_text: body.body }).eq('id', messageId)
  }

  const result = await sendQueuedEmail(admin, messageId)
  if (!result.ok) return NextResponse.json({ ok: false, error: result.reason }, { status: 400 })
  return NextResponse.json({ ok: true })
}
