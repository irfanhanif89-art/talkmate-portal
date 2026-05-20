import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireSalesRep } from '@/lib/sales-auth'

export async function PATCH(req: Request) {
  const auth = await requireSalesRep()
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const body = (await req.json().catch(() => ({}))) as { phone?: unknown }
  const phone = body.phone == null ? null : String(body.phone).trim() || null

  const admin = createAdminClient()
  const { error } = await admin
    .from('sales_reps')
    .update({ phone })
    .eq('id', auth.rep.id)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
