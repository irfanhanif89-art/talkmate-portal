import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })
  const { id } = await ctx.params

  const body = (await req.json().catch(() => ({}))) as { reason?: unknown }
  const reason = body.reason ? String(body.reason).trim() : null
  if (!reason) return NextResponse.json({ ok: false, error: 'A clawback reason is required' }, { status: 400 })

  const admin = createAdminClient()
  const { data: existing } = await admin
    .from('contractor_commissions')
    .select('id, status')
    .eq('id', id)
    .maybeSingle()
  if (!existing) return NextResponse.json({ ok: false, error: 'Commission not found' }, { status: 404 })
  if (existing.status === 'paid') {
    return NextResponse.json({ ok: false, error: 'Paid commissions cannot be clawed back via this endpoint' }, { status: 409 })
  }

  const { error } = await admin
    .from('contractor_commissions')
    .update({ status: 'clawback', clawback_reason: reason })
    .eq('id', id)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
