import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireSalesRep } from '@/lib/sales-auth'
import { streamStoredResource } from '@/lib/sales-resources'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Rep-facing: render a resource the rep is allowed to see (active, shared or
// assigned to them). Streamed through our origin so HTML renders; archived or
// unassigned resources 404 rather than leaking content.
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireSalesRep(req)
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })
  const { id } = await ctx.params

  const admin = createAdminClient()
  const { data: resource } = await admin
    .from('sales_resources')
    .select('file_path, file_type, file_name, is_active')
    .eq('id', id)
    .maybeSingle()

  if (!resource?.file_path || !resource.is_active) {
    return NextResponse.json({ ok: false, error: 'Resource not available' }, { status: 404 })
  }

  const { data: assignments } = await admin
    .from('sales_resource_assignments')
    .select('rep_id')
    .eq('resource_id', id)

  const assigned = assignments ?? []
  const visible = assigned.length === 0 || assigned.some(a => a.rep_id === auth.rep.id)
  if (!visible) {
    return NextResponse.json({ ok: false, error: 'Resource not available' }, { status: 404 })
  }

  return streamStoredResource(admin, resource)
}
