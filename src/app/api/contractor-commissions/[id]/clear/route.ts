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
    .from('contractor_commissions')
    .select('id, status, clawback_period_ends_at')
    .eq('id', id)
    .maybeSingle()
  if (!existing) return NextResponse.json({ ok: false, error: 'Commission not found' }, { status: 404 })
  if (existing.status !== 'pending') {
    return NextResponse.json({ ok: false, error: 'Only pending commissions can be cleared' }, { status: 409 })
  }

  const { error } = await admin
    .from('contractor_commissions')
    .update({ status: 'cleared' })
    .eq('id', id)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
