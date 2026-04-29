import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

// POST /api/pipeline/move { contact_id, stage_id }
// Move (or add) a contact to a pipeline stage. Used by the kanban drag-drop
// and the "Add to pipeline" / "Move to next stage" controls.
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })

  const body = await req.json().catch(() => ({})) as { contact_id?: string; stage_id?: string }
  const { contact_id, stage_id } = body
  if (!contact_id || !stage_id) return NextResponse.json({ ok: false, error: 'contact_id and stage_id required' }, { status: 400 })

  const { data: business } = await supabase.from('businesses').select('id').eq('owner_user_id', user.id).single()
  if (!business) return NextResponse.json({ ok: false }, { status: 404 })

  // Verify both rows belong to this business via RLS-scoped reads.
  const [{ data: contact }, { data: stage }] = await Promise.all([
    supabase.from('contacts').select('id').eq('id', contact_id).single(),
    supabase.from('pipeline_stages').select('id').eq('id', stage_id).single(),
  ])
  if (!contact) return NextResponse.json({ ok: false, error: 'Contact not found' }, { status: 404 })
  if (!stage) return NextResponse.json({ ok: false, error: 'Stage not found' }, { status: 404 })

  const admin = createAdminClient()
  const now = new Date().toISOString()

  // Upsert: one contact_pipeline row per contact (UNIQUE index on contact_id).
  const { data: existing } = await admin.from('contact_pipeline').select('id, stage_id').eq('contact_id', contact_id).maybeSingle()
  if (existing) {
    await admin.from('contact_pipeline').update({
      stage_id, entered_at: existing.stage_id === stage_id ? undefined : now, updated_at: now,
    }).eq('id', existing.id)
  } else {
    await admin.from('contact_pipeline').insert({
      contact_id, client_id: business.id, stage_id, entered_at: now, updated_at: now,
    })
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })
  const { contact_id } = await req.json().catch(() => ({})) as { contact_id?: string }
  if (!contact_id) return NextResponse.json({ ok: false }, { status: 400 })
  await supabase.from('contact_pipeline').delete().eq('contact_id', contact_id)
  return NextResponse.json({ ok: true })
}
