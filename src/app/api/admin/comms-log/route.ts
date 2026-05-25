import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(req: Request) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const url = new URL(req.url)
  const businessId = url.searchParams.get('business_id')
  const leadId = url.searchParams.get('lead_id')

  if (!businessId && !leadId) {
    return NextResponse.json({ ok: false, error: 'business_id or lead_id required' }, { status: 400 })
  }

  const admin = createAdminClient()
  let q = admin.from('client_comms_log')
    .select('id, note, logged_by, onboarding_stage, created_at, business_id, lead_id')
    .order('created_at', { ascending: false })
    .limit(50)

  if (businessId) q = q.eq('business_id', businessId)
  if (leadId) q = q.eq('lead_id', leadId)

  const { data, error } = await q
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, notes: data ?? [] })
}

export async function POST(req: Request) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const body = await req.json().catch(() => ({})) as {
    business_id?: string | null
    lead_id?: string | null
    note?: string
    onboarding_stage?: string | null
    logged_by?: string
  }

  if (!body.note?.trim()) return NextResponse.json({ ok: false, error: 'note required' }, { status: 400 })
  if (!body.business_id && !body.lead_id) {
    return NextResponse.json({ ok: false, error: 'business_id or lead_id required' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error } = await admin.from('client_comms_log').insert({
    business_id: body.business_id ?? null,
    lead_id: body.lead_id ?? null,
    note: body.note.trim(),
    onboarding_stage: body.onboarding_stage ?? null,
    logged_by: body.logged_by ?? auth.user.email ?? 'admin',
  })

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
