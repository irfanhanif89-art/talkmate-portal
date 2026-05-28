import { NextResponse } from 'next/server'
import { requireSalesRep } from '@/lib/sales-auth'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(req: Request) {
  const auth = await requireSalesRep(req)
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const admin = createAdminClient()
  const { data: rows, error } = await admin
    .from('commissions')
    .select(`
      id, lead_id, business_id, status, plan,
      commission_amount, bonus_amount,
      approved_at, paid_at, clawback_period_ends_at, created_at,
      leads:lead_id ( business_name, won_at, won_billing_cycle ),
      businesses:business_id ( name )
    `)
    .eq('rep_id', auth.rep.id)
    .order('created_at', { ascending: false })
    .limit(500)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  // Reshape into the contract mobile expects.
  const flattened = (rows ?? []).map((c: any) => {
    const base = Number(c.commission_amount ?? 0)
    const bonus = Number(c.bonus_amount ?? 0)
    return {
      id: c.id,
      lead_id: c.lead_id,
      business_id: c.business_id,
      business_name: c.businesses?.name ?? c.leads?.business_name ?? '(unknown)',
      plan: c.plan,
      billing_cycle: c.leads?.won_billing_cycle ?? null,
      base_amount: base,
      bonus_amount: bonus,
      total: base + bonus,
      status: c.status,
      won_at: c.leads?.won_at ?? c.created_at,
      approved_at: c.approved_at,
      paid_at: c.paid_at,
      clawback_period_ends_at: c.clawback_period_ends_at,
    }
  })

  return NextResponse.json({ ok: true, commissions: flattened })
}
