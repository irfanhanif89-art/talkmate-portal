import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin-auth'
import {
  getCommissionAmount,
  isContractorBilling,
  isContractorPlan,
  clawbackEndsAt,
} from '@/lib/contractor-commission'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const url = new URL(req.url)
  const contractorId = url.searchParams.get('contractor_id')

  const admin = createAdminClient()
  let query = admin
    .from('contractor_commissions')
    .select('id, contractor_id, client_business_id, plan_type, billing_cycle, sale_amount, commission_amount, status, clawback_period_ends_at, clawback_reason, paid_at, stripe_payment_id, notes, created_at')
    .order('created_at', { ascending: false })
  if (contractorId) query = query.eq('contractor_id', contractorId)

  const { data, error } = await query
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, commissions: data ?? [] })
}

export async function POST(req: Request) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const body = (await req.json().catch(() => ({}))) as {
    contractor_id?: unknown
    client_business_id?: unknown
    plan_type?: unknown
    billing_cycle?: unknown
    sale_amount?: unknown
    notes?: unknown
  }

  const contractor_id = String(body.contractor_id ?? '').trim()
  const plan_type = body.plan_type
  const billing_cycle = body.billing_cycle
  const client_business_id = body.client_business_id ? String(body.client_business_id).trim() : null
  const notes = body.notes ? String(body.notes).trim() : null

  if (!contractor_id) return NextResponse.json({ ok: false, error: 'contractor_id is required' }, { status: 400 })
  if (!isContractorPlan(plan_type)) {
    return NextResponse.json({ ok: false, error: 'plan_type must be starter, growth, or pro' }, { status: 400 })
  }
  if (!isContractorBilling(billing_cycle)) {
    return NextResponse.json({ ok: false, error: 'billing_cycle must be monthly or annual' }, { status: 400 })
  }

  const sale_amount_raw = Number(body.sale_amount ?? 0)
  if (!Number.isFinite(sale_amount_raw) || sale_amount_raw < 0) {
    return NextResponse.json({ ok: false, error: 'sale_amount must be a non-negative number' }, { status: 400 })
  }

  // Always derive commission_amount server-side - never trust the client.
  const commission_amount = getCommissionAmount(plan_type, billing_cycle)
  const clawback_period_ends_at = clawbackEndsAt(new Date()).toISOString()

  const admin = createAdminClient()
  const { data: contractor } = await admin
    .from('contractors')
    .select('id')
    .eq('id', contractor_id)
    .maybeSingle()
  if (!contractor) return NextResponse.json({ ok: false, error: 'Contractor not found' }, { status: 404 })

  const { data, error } = await admin
    .from('contractor_commissions')
    .insert({
      contractor_id,
      client_business_id,
      plan_type,
      billing_cycle,
      sale_amount: sale_amount_raw,
      commission_amount,
      status: 'pending',
      clawback_period_ends_at,
      notes,
    })
    .select('id, contractor_id, plan_type, billing_cycle, sale_amount, commission_amount, status, clawback_period_ends_at, created_at')
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, commission: data })
}
