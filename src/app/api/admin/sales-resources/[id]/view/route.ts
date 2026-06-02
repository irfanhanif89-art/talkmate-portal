import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin-auth'
import { streamStoredResource } from '@/lib/sales-resources'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Admin preview: render any resource (including archived) through our origin.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })
  const { id } = await ctx.params

  const admin = createAdminClient()
  const { data: resource } = await admin
    .from('sales_resources')
    .select('file_path, file_type, file_name')
    .eq('id', id)
    .maybeSingle()

  if (!resource?.file_path) {
    return NextResponse.json({ ok: false, error: 'Resource not found' }, { status: 404 })
  }

  return streamStoredResource(admin, resource)
}
