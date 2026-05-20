import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })
  const { id } = await ctx.params

  const admin = createAdminClient()
  const { data: contractor, error } = await admin
    .from('contractors')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  if (!contractor) return NextResponse.json({ ok: false, error: 'Contractor not found' }, { status: 404 })

  const [{ data: agreements }, { data: acks }, { data: commissions }] = await Promise.all([
    admin
      .from('contractor_agreements')
      .select('id, agreement_version, script_version, script_date, signed_at, signed_pdf_url, status, created_at')
      .eq('contractor_id', id)
      .order('created_at', { ascending: false }),
    admin
      .from('script_acknowledgements')
      .select('id, script_id, script_version, acknowledged_at')
      .eq('contractor_id', id)
      .order('acknowledged_at', { ascending: false }),
    admin
      .from('contractor_commissions')
      .select('id, plan_type, billing_cycle, sale_amount, commission_amount, status, clawback_period_ends_at, paid_at, created_at, client_business_id, notes')
      .eq('contractor_id', id)
      .order('created_at', { ascending: false }),
  ])

  return NextResponse.json({
    ok: true,
    contractor,
    agreements: agreements ?? [],
    acknowledgements: acks ?? [],
    commissions: commissions ?? [],
  })
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })
  const { id } = await ctx.params

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const allowed = ['first_name', 'last_name', 'phone', 'abn', 'bank_bsb', 'bank_account_number', 'notes']
  const updates: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) {
      const v = body[key]
      updates[key] = v === null || v === '' ? null : String(v).trim()
    }
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ ok: false, error: 'No updatable fields supplied' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error } = await admin.from('contractors').update(updates).eq('id', id)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
