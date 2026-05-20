import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

export async function PATCH(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })
  const { id } = await ctx.params

  const admin = createAdminClient()
  const { data: existing } = await admin
    .from('sales_scripts')
    .select('id, is_active')
    .eq('id', id)
    .maybeSingle()
  if (!existing) return NextResponse.json({ ok: false, error: 'Script not found' }, { status: 404 })
  if (existing.is_active) return NextResponse.json({ ok: true })

  // The single_active_script trigger will deactivate the previous active row.
  const { error } = await admin
    .from('sales_scripts')
    .update({ is_active: true, activated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
