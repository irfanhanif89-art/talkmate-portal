import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })
  const { id } = await ctx.params

  const body = (await req.json().catch(() => ({}))) as { stripe_payment_id?: unknown }
  const stripe_payment_id = body.stripe_payment_id ? String(body.stripe_payment_id).trim() : null

  const admin = createAdminClient()
  const { data: existing } = await admin
    .from('contractor_commissions')
    .select('id, status')
    .eq('id', id)
    .maybeSingle()
  if (!existing) return NextResponse.json({ ok: false, error: 'Commission not found' }, { status: 404 })
  if (existing.status !== 'cleared') {
    return NextResponse.json({ ok: false, error: 'Only cleared commissions can be marked paid' }, { status: 409 })
  }

  const { error } = await admin
    .from('contractor_commissions')
    .update({
      status: 'paid',
      paid_at: new Date().toISOString(),
      stripe_payment_id,
    })
    .eq('id', id)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
