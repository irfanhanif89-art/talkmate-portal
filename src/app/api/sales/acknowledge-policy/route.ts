import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireSalesRep } from '@/lib/sales-auth'
import { COMMISSION_POLICY_VERSION } from '@/lib/commission'

export async function POST(req: Request) {
  const auth = await requireSalesRep(req)
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const admin = createAdminClient()
  const { error } = await admin
    .from('sales_reps')
    .update({
      policy_acknowledged_at: new Date().toISOString(),
      commission_policy_version: COMMISSION_POLICY_VERSION,
    })
    .eq('id', auth.rep.id)

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
