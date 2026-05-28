import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireSalesRep } from '@/lib/sales-auth'

const ALLOWED_TYPES = new Set(['note', 'call', 'email', 'demo', 'proposal'])

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireSalesRep(req)
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })
  const { id } = await ctx.params

  const admin = createAdminClient()
  // Verify the rep owns the lead
  const { data: lead } = await admin.from('leads').select('id, assigned_to').eq('id', id).maybeSingle()
  if (!lead || lead.assigned_to !== auth.rep.id) {
    return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 })
  }

  const { data: activities } = await admin
    .from('lead_activities')
    .select('id, activity_type, title, body, old_status, new_status, created_at')
    .eq('lead_id', id)
    .order('created_at', { ascending: false })

  return NextResponse.json({ ok: true, activities: activities ?? [] })
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireSalesRep(req)
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })
  const { id } = await ctx.params

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const activity_type = String(body.activity_type ?? '').trim()
  const title = String(body.title ?? '').trim()
  const note = body.body == null ? null : String(body.body).trim() || null

  if (!ALLOWED_TYPES.has(activity_type)) {
    return NextResponse.json({ ok: false, error: 'Invalid activity type' }, { status: 400 })
  }
  if (!title) {
    return NextResponse.json({ ok: false, error: 'Title is required' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: lead } = await admin.from('leads').select('id, assigned_to').eq('id', id).maybeSingle()
  if (!lead || lead.assigned_to !== auth.rep.id) {
    return NextResponse.json({ ok: false, error: 'Lead not found' }, { status: 404 })
  }

  const { error } = await admin.from('lead_activities').insert({
    lead_id: id,
    rep_id: auth.rep.id,
    activity_type,
    title,
    body: note,
  })

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  // Bump lead's updated_at so it sorts to the top of the pipeline.
  await admin.from('leads').update({ updated_at: new Date().toISOString() }).eq('id', id)

  return NextResponse.json({ ok: true })
}
