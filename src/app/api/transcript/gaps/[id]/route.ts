// Session 4B — action a transcript gap: accept / dismiss / add_to_kb.
// PATCH, Supabase user auth (cookie) + ?adminClientId= admin parity + Bearer.
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { resolveBusinessId } from '@/lib/resolve-business'

export const dynamic = 'force-dynamic'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const url = new URL(req.url)
  const adminClientId = url.searchParams.get('adminClientId')
  const resolved = await resolveBusinessId(adminClientId, req)
  if (!resolved.ok) {
    return NextResponse.json({ ok: false, error: resolved.error }, { status: resolved.status })
  }

  let body: { action?: string } = {}
  try { body = await req.json() } catch { /* empty body */ }
  const action = body.action
  if (action !== 'accept' && action !== 'dismiss' && action !== 'add_to_kb') {
    return NextResponse.json({ ok: false, error: 'invalid_action' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Load the gap, scoped to this business (never trust the id alone).
  const { data: gap } = await supabase
    .from('transcript_gaps')
    .select('id, question, status')
    .eq('id', id)
    .eq('business_id', resolved.businessId)
    .maybeSingle()
  if (!gap) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })
  }

  const now = new Date().toISOString()

  if (action === 'accept') {
    await supabase.from('transcript_gaps')
      .update({ status: 'accepted', actioned_at: now })
      .eq('id', id).eq('business_id', resolved.businessId)
    return NextResponse.json({ ok: true })
  }

  if (action === 'dismiss') {
    await supabase.from('transcript_gaps')
      .update({ status: 'dismissed', actioned_at: now })
      .eq('id', id).eq('business_id', resolved.businessId)
    return NextResponse.json({ ok: true })
  }

  // add_to_kb — create an empty-answer FAQ entry pre-filled with the question,
  // link it back to the gap, and flag the KB for re-sync. The client then
  // navigates to /train to fill in the answer.
  const { data: entry, error: kbErr } = await supabase
    .from('knowledge_base_entries')
    .insert({
      business_id: resolved.businessId,
      category: 'faq',
      question: gap.question,
      answer: '',
    })
    .select('id')
    .maybeSingle()
  if (kbErr || !entry) {
    return NextResponse.json({ ok: false, error: kbErr?.message ?? 'kb_insert_failed' }, { status: 500 })
  }

  await supabase.from('transcript_gaps')
    .update({ status: 'added_to_kb', kb_entry_id: entry.id, actioned_at: now })
    .eq('id', id).eq('business_id', resolved.businessId)

  await supabase.from('businesses')
    .update({ kb_sync_status: 'pending' })
    .eq('id', resolved.businessId)

  return NextResponse.json({ ok: true, kbEntryId: entry.id })
}
