import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })
  const { id } = await ctx.params

  const body = (await req.json().catch(() => ({}))) as { reason?: unknown }
  const reason = body.reason ? String(body.reason).trim() : null

  const admin = createAdminClient()
  const { error } = await admin
    .from('contractors')
    .update({
      status: 'terminated',
      termination_date: new Date().toISOString(),
      termination_reason: reason,
    })
    .eq('id', id)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
