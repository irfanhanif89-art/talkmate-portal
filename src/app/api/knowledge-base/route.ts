// Knowledge base entries — list + create.
// Both methods accept ?adminClientId=<uuid> for admin-as-client mode.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { resolveBusinessId } from '@/lib/resolve-business'

const VALID_CATEGORIES = new Set(['faq', 'service', 'hours', 'pricing', 'team', 'custom'])
const MIN_ANSWER_LENGTH = 10
const MAX_QUESTION_LENGTH = 200
const MAX_ANSWER_LENGTH = 2000

interface EntryRow {
  id: string
  category: string
  question: string
  answer: string
  is_active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export async function GET(request: NextRequest) {
  const adminClientId = request.nextUrl.searchParams.get('adminClientId')
  const auth = await resolveBusinessId(adminClientId, request)
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const admin = createAdminClient()
  const { data: business } = await admin
    .from('businesses')
    .select('kb_sync_status, kb_last_synced_at')
    .eq('id', auth.businessId)
    .limit(1)
    .maybeSingle()

  const { data, error } = await admin
    .from('knowledge_base_entries')
    .select('id, category, question, answer, is_active, sort_order, created_at, updated_at')
    .eq('business_id', auth.businessId)
    .eq('is_active', true)
    .order('category', { ascending: true })
    .order('sort_order', { ascending: true })

  if (error) {
    console.error('[kb] list failed', error.message)
    return NextResponse.json({ ok: false, error: 'list_failed' }, { status: 500 })
  }

  const grouped: Record<string, EntryRow[]> = {}
  for (const e of (data ?? []) as EntryRow[]) {
    const cat = e.category
    if (!grouped[cat]) grouped[cat] = []
    grouped[cat].push(e)
  }

  return NextResponse.json({
    ok: true,
    syncStatus: business?.kb_sync_status ?? 'synced',
    lastSyncedAt: business?.kb_last_synced_at ?? null,
    entries: data ?? [],
    grouped,
  })
}

export async function POST(request: NextRequest) {
  const adminClientId = request.nextUrl.searchParams.get('adminClientId')
  const auth = await resolveBusinessId(adminClientId, request)
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  let body: { category?: string; question?: string; answer?: string; sortOrder?: number }
  try { body = await request.json() as typeof body }
  catch { return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 }) }

  const category = (body.category ?? '').toLowerCase().trim()
  const question = (body.question ?? '').trim()
  const answer = (body.answer ?? '').trim()

  if (!VALID_CATEGORIES.has(category)) {
    return NextResponse.json({ ok: false, error: 'invalid_category' }, { status: 400 })
  }
  if (!question || question.length > MAX_QUESTION_LENGTH) {
    return NextResponse.json({ ok: false, error: 'invalid_question' }, { status: 400 })
  }
  if (answer.length < MIN_ANSWER_LENGTH || answer.length > MAX_ANSWER_LENGTH) {
    return NextResponse.json({ ok: false, error: 'invalid_answer' }, { status: 400 })
  }

  const admin = createAdminClient()

  let sortOrder = typeof body.sortOrder === 'number' ? body.sortOrder : null
  if (sortOrder === null) {
    const { data: last } = await admin
      .from('knowledge_base_entries')
      .select('sort_order')
      .eq('business_id', auth.businessId)
      .eq('category', category)
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle()
    sortOrder = ((last?.sort_order as number | null) ?? 0) + 10
  }

  const { data: created, error } = await admin
    .from('knowledge_base_entries')
    .insert({
      business_id: auth.businessId,
      category,
      question,
      answer,
      sort_order: sortOrder,
    })
    .select('id, category, question, answer, is_active, sort_order, created_at, updated_at')
    .single()

  if (error || !created) {
    console.error('[kb] insert failed', error?.message)
    return NextResponse.json({ ok: false, error: 'insert_failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, entry: created })
}
