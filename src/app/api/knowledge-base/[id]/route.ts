// Knowledge base entry — update + soft delete.
// Both methods accept ?adminClientId=<uuid> for admin-as-client mode.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { resolveBusinessId } from '@/lib/resolve-business'

const VALID_CATEGORIES = new Set(['faq', 'service', 'hours', 'pricing', 'team', 'custom'])
const MIN_ANSWER_LENGTH = 10
const MAX_QUESTION_LENGTH = 200
const MAX_ANSWER_LENGTH = 2000

async function authoriseEntry(
  entryId: string,
  adminClientId: string | null,
): Promise<{ businessId: string } | { error: string; status: number }> {
  const auth = await resolveBusinessId(adminClientId)
  if (!auth.ok) return { error: auth.error, status: auth.status }
  const admin = createAdminClient()
  const { data: entry } = await admin
    .from('knowledge_base_entries')
    .select('id, business_id')
    .eq('id', entryId)
    .eq('business_id', auth.businessId)
    .limit(1)
    .maybeSingle()
  if (!entry) return { error: 'not_found', status: 404 }
  return { businessId: auth.businessId }
}

export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params
  const adminClientId = request.nextUrl.searchParams.get('adminClientId')
  const res = await authoriseEntry(id, adminClientId)
  if ('error' in res) return NextResponse.json({ ok: false, error: res.error }, { status: res.status })

  let body: { question?: string; answer?: string; category?: string; sortOrder?: number; isActive?: boolean }
  try { body = await request.json() as typeof body }
  catch { return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 }) }

  const patch: Record<string, unknown> = {}

  if (typeof body.question === 'string') {
    const q = body.question.trim()
    if (!q || q.length > MAX_QUESTION_LENGTH) {
      return NextResponse.json({ ok: false, error: 'invalid_question' }, { status: 400 })
    }
    patch.question = q
  }
  if (typeof body.answer === 'string') {
    const a = body.answer.trim()
    if (a.length < MIN_ANSWER_LENGTH || a.length > MAX_ANSWER_LENGTH) {
      return NextResponse.json({ ok: false, error: 'invalid_answer' }, { status: 400 })
    }
    patch.answer = a
  }
  if (typeof body.category === 'string') {
    const c = body.category.toLowerCase().trim()
    if (!VALID_CATEGORIES.has(c)) {
      return NextResponse.json({ ok: false, error: 'invalid_category' }, { status: 400 })
    }
    patch.category = c
  }
  if (typeof body.sortOrder === 'number') patch.sort_order = body.sortOrder
  if (typeof body.isActive === 'boolean') patch.is_active = body.isActive

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: false, error: 'no_changes' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: updated, error } = await admin
    .from('knowledge_base_entries')
    .update(patch)
    .eq('id', id)
    .select('id, category, question, answer, is_active, sort_order, updated_at')
    .single()

  if (error || !updated) {
    console.error('[kb] update failed', error?.message)
    return NextResponse.json({ ok: false, error: 'update_failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, entry: updated })
}

export async function DELETE(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params
  const adminClientId = request.nextUrl.searchParams.get('adminClientId')
  const res = await authoriseEntry(id, adminClientId)
  if ('error' in res) return NextResponse.json({ ok: false, error: res.error }, { status: res.status })

  const admin = createAdminClient()
  const { error } = await admin
    .from('knowledge_base_entries')
    .update({ is_active: false })
    .eq('id', id)

  if (error) {
    console.error('[kb] delete failed', error.message)
    return NextResponse.json({ ok: false, error: 'delete_failed' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
