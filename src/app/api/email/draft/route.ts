// POST /api/email/draft — user auth (or ?adminClientId). Generates/regenerates
// an AI draft reply for a thread.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { resolveBusinessId } from '@/lib/resolve-business'
import { triggerEmailDraft } from '@/lib/email-responder'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const adminClientId = request.nextUrl.searchParams.get('adminClientId')
  const auth = await resolveBusinessId(adminClientId, request)
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  let body: { threadId?: string }
  try { body = await request.json() } catch { return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 }) }
  if (!body.threadId) return NextResponse.json({ ok: false, error: 'threadId required' }, { status: 400 })

  const admin = createAdminClient()
  // Discard any existing queued AI draft so regenerate replaces it.
  await admin.from('email_messages')
    .update({ status: 'discarded' })
    .eq('thread_id', body.threadId).eq('business_id', auth.businessId).eq('status', 'queued').eq('ai_drafted', true)

  const result = await triggerEmailDraft(admin, body.threadId, auth.businessId)
  if (!result.ok) return NextResponse.json({ ok: false, error: result.reason }, { status: 400 })

  const { data: draft } = await admin
    .from('email_messages').select('id, body_text').eq('id', result.draftId!).maybeSingle()
  return NextResponse.json({ ok: true, draftId: result.draftId, draftBody: draft?.body_text ?? '' })
}
