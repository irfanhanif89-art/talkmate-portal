import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

// Update a resource: title/description, archive (is_active=false), and/or
// replace its assignment set. repIds === [] means "shared with all reps".
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })
  const { id } = await ctx.params

  const body = (await req.json().catch(() => ({}))) as {
    title?: unknown
    description?: unknown
    is_active?: unknown
    repIds?: unknown
  }

  const admin = createAdminClient()

  const { data: existing } = await admin
    .from('sales_resources')
    .select('id')
    .eq('id', id)
    .maybeSingle()
  if (!existing) return NextResponse.json({ ok: false, error: 'Resource not found' }, { status: 404 })

  const updates: Record<string, unknown> = {}
  if (typeof body.title === 'string') updates.title = body.title.trim()
  if (typeof body.description === 'string') updates.description = body.description.trim() || null
  if (typeof body.is_active === 'boolean') updates.is_active = body.is_active

  if (Object.keys(updates).length > 0) {
    const { error } = await admin.from('sales_resources').update(updates).eq('id', id)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  // Replace the assignment set when repIds is supplied (array). Empty array
  // clears all targeting → the resource becomes shared with every rep.
  if (Array.isArray(body.repIds)) {
    const repIds = body.repIds.filter((x): x is string => typeof x === 'string')
    const { error: delErr } = await admin.from('sales_resource_assignments').delete().eq('resource_id', id)
    if (delErr) return NextResponse.json({ ok: false, error: delErr.message }, { status: 500 })
    if (repIds.length > 0) {
      const rows = repIds.map(rep_id => ({ resource_id: id, rep_id }))
      const { error: insErr } = await admin.from('sales_resource_assignments').insert(rows)
      if (insErr) return NextResponse.json({ ok: false, error: insErr.message }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true })
}
