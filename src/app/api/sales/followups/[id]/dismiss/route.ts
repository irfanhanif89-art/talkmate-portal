import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireSalesRep } from '@/lib/sales-auth'

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireSalesRep(req)
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const { id } = await ctx.params
  const admin = createAdminClient()
  const { data: row } = await admin
    .from('lead_followups')
    .select('id, rep_id')
    .eq('id', id)
    .maybeSingle()

  if (!row || row.rep_id !== auth.rep.id) {
    return NextResponse.json({ ok: false, error: 'Follow-up not found' }, { status: 404 })
  }

  await admin
    .from('lead_followups')
    .update({ dismissed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', id)

  return NextResponse.json({ ok: true })
}
