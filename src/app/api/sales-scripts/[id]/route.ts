import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })
  const { id } = await ctx.params

  const body = (await req.json().catch(() => ({}))) as {
    title?: unknown
    content?: unknown
    version?: unknown
  }
  const updates: Record<string, unknown> = {}
  if (typeof body.title === 'string') updates.title = body.title.trim()
  if (typeof body.content === 'string') updates.content = body.content.trim()
  if (typeof body.version === 'string') updates.version = body.version.trim()

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ ok: false, error: 'No updatable fields supplied' }, { status: 400 })
  }

  const admin = createAdminClient()
  // Only allow editing scripts that have never been activated.
  const { data: existing } = await admin
    .from('sales_scripts')
    .select('is_active, activated_at')
    .eq('id', id)
    .maybeSingle()
  if (!existing) return NextResponse.json({ ok: false, error: 'Script not found' }, { status: 404 })
  if (existing.activated_at) {
    return NextResponse.json({ ok: false, error: 'Activated scripts cannot be edited - create a new version instead' }, { status: 409 })
  }

  const { error } = await admin.from('sales_scripts').update(updates).eq('id', id)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
