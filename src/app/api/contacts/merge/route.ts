import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { refreshSmartListCounts } from '@/lib/smart-lists'

// POST /api/contacts/merge { keep_id, merge_id }
// Merges all call history from `merge_id` into `keep_id`, combines tags,
// merges industry_data (kept side wins), removes pipeline membership of the
// merged contact, and marks the merged record `is_merged = true`.
//
// Both contacts must belong to the requesting user's business (RLS scopes
// the read; the merge runs through the admin client to bypass the
// is_merged filter).
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })

  const body = await req.json().catch(() => ({})) as { keep_id?: string; merge_id?: string }
  const { keep_id, merge_id } = body
  if (!keep_id || !merge_id) {
    return NextResponse.json({ ok: false, error: 'keep_id and merge_id required' }, { status: 400 })
  }
  if (keep_id === merge_id) {
    return NextResponse.json({ ok: false, error: 'Cannot merge a contact with itself' }, { status: 400 })
  }

  const { data: business } = await supabase.from('businesses').select('id').eq('owner_user_id', user.id).single()
  if (!business) return NextResponse.json({ ok: false, error: 'No business' }, { status: 404 })

  // Both reads must succeed via the user-scoped client so we know the user
  // owns both contacts.
  const [{ data: keep }, { data: merge }] = await Promise.all([
    supabase.from('contacts').select('*').eq('id', keep_id).eq('client_id', business.id).single(),
    supabase.from('contacts').select('*').eq('id', merge_id).eq('client_id', business.id).single(),
  ])
  if (!keep) return NextResponse.json({ ok: false, error: 'Keep contact not found' }, { status: 404 })
  if (!merge) return NextResponse.json({ ok: false, error: 'Merge contact not found' }, { status: 404 })
  if (merge.is_merged) return NextResponse.json({ ok: false, error: 'Already merged' }, { status: 400 })

  const admin = createAdminClient()

  // 1. Move all contact_calls from merge → keep.
  const { error: moveErr } = await admin.from('contact_calls').update({ contact_id: keep_id }).eq('contact_id', merge_id)
  if (moveErr) return NextResponse.json({ ok: false, error: `Could not move calls: ${moveErr.message}` }, { status: 500 })

  // 2. Combine tags (dedupe).
  const combinedTags = Array.from(new Set([...(keep.tags ?? []), ...(merge.tags ?? [])]))

  // 3. Merge industry_data — kept side wins on conflicts.
  const mergedIndustryData = { ...(merge.industry_data ?? {}), ...(keep.industry_data ?? {}) }

  // 4. Recompute call_count + last_seen + first_seen.
  const { count: newCallCount } = await admin.from('contact_calls').select('id', { count: 'exact', head: true }).eq('contact_id', keep_id)
  const lastSeen = new Date(keep.last_seen) > new Date(merge.last_seen) ? keep.last_seen : merge.last_seen
  const firstSeen = new Date(keep.first_seen) < new Date(merge.first_seen) ? keep.first_seen : merge.first_seen

  // 5. Update kept contact.
  const { error: updateErr } = await admin.from('contacts').update({
    name: keep.name ?? merge.name ?? null,
    email: keep.email ?? merge.email ?? null,
    notes: keep.notes ?? merge.notes ?? null,
    tags: combinedTags,
    industry_data: mergedIndustryData,
    call_count: newCallCount ?? (keep.call_count ?? 0) + (merge.call_count ?? 0),
    first_seen: firstSeen,
    last_seen: lastSeen,
    updated_at: new Date().toISOString(),
  }).eq('id', keep_id)
  if (updateErr) return NextResponse.json({ ok: false, error: `Could not update keep contact: ${updateErr.message}` }, { status: 500 })

  // 6. Remove merged contact from any pipeline.
  await admin.from('contact_pipeline').delete().eq('contact_id', merge_id)

  // 7. Mark merged contact as merged.
  const { error: markErr } = await admin.from('contacts').update({
    is_merged: true,
    merged_into: keep_id,
    updated_at: new Date().toISOString(),
  }).eq('id', merge_id)
  if (markErr) return NextResponse.json({ ok: false, error: `Could not mark merged: ${markErr.message}` }, { status: 500 })

  // 8. Refresh smart list counts (background).
  refreshSmartListCounts(admin, business.id).catch(e => console.error('[merge] smart-list refresh', e))

  // Return the updated kept contact.
  const { data: updated } = await admin.from('contacts').select('*').eq('id', keep_id).single()
  return NextResponse.json({ ok: true, contact: updated })
}
