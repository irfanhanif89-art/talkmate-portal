import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin-auth'

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })
  const { id } = await ctx.params

  const body = (await req.json().catch(() => ({}))) as { status?: unknown }
  const status = String(body.status ?? '')
  if (status !== 'active' && status !== 'inactive') {
    return NextResponse.json({ ok: false, error: 'status must be active or inactive' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: rep } = await admin.from('sales_reps').select('id, user_id').eq('id', id).maybeSingle()
  if (!rep) return NextResponse.json({ ok: false, error: 'Rep not found' }, { status: 404 })

  const { error } = await admin.from('sales_reps').update({ status }).eq('id', id)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  // Ban / unban the underlying auth user so an inactive rep cannot log in.
  // 100000 hours ~= 11 years; effectively permanent until reactivated.
  if (status === 'inactive') {
    await admin.auth.admin.updateUserById(rep.user_id, { ban_duration: '876000h' }).catch(() => {})
  } else {
    await admin.auth.admin.updateUserById(rep.user_id, { ban_duration: 'none' }).catch(() => {})
  }

  return NextResponse.json({ ok: true })
}
