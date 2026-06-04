// GET|PATCH /api/email/threads/[id] — user auth (or ?adminClientId).
// GET: full thread + messages, marks unread_count=0.
// PATCH: status update (archive/spam/active).

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { resolveBusinessId } from '@/lib/resolve-business'

export const dynamic = 'force-dynamic'

const VALID_STATUS = new Set(['active', 'archived', 'spam'])

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const adminClientId = request.nextUrl.searchParams.get('adminClientId')
  const auth = await resolveBusinessId(adminClientId, request)
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const admin = createAdminClient()
  const { data: thread } = await admin
    .from('email_threads')
    .select('id, from_email, from_name, subject, status, unread_count')
    .eq('id', id).eq('business_id', auth.businessId)
    .maybeSingle()
  if (!thread) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })

  const { data: messages } = await admin
    .from('email_messages')
    .select('id, direction, from_email, from_name, body_text, subject, status, sent_by, ai_drafted, created_at')
    .eq('thread_id', id)
    .order('created_at', { ascending: true })

  if ((thread.unread_count as number | null) ?? 0) {
    await admin.from('email_threads').update({ unread_count: 0 }).eq('id', id)
  }

  return NextResponse.json({ ok: true, thread, messages: messages ?? [] })
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const adminClientId = request.nextUrl.searchParams.get('adminClientId')
  const auth = await resolveBusinessId(adminClientId, request)
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  let body: { status?: string }
  try { body = await request.json() } catch { return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 }) }
  if (!body.status || !VALID_STATUS.has(body.status)) {
    return NextResponse.json({ ok: false, error: 'invalid_status' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('email_threads').update({ status: body.status }).eq('id', id).eq('business_id', auth.businessId)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
