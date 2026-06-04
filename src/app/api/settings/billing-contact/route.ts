// Session 4B — billing contact + monthly summary recipient.
// GET/PATCH, cookie/admin/Bearer auth.
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { resolveBusinessId } from '@/lib/resolve-business'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const resolved = await resolveBusinessId(url.searchParams.get('adminClientId'), req)
  if (!resolved.ok) return NextResponse.json({ ok: false, error: resolved.error }, { status: resolved.status })

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('businesses')
    .select('billing_contact_name, billing_contact_email, monthly_summary_enabled')
    .eq('id', resolved.businessId)
    .maybeSingle()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({
    ok: true,
    name: data?.billing_contact_name ?? '',
    email: data?.billing_contact_email ?? '',
    monthlySummaryEnabled: data?.monthly_summary_enabled ?? true,
  })
}

export async function PATCH(req: Request) {
  const url = new URL(req.url)
  const resolved = await resolveBusinessId(url.searchParams.get('adminClientId'), req)
  if (!resolved.ok) return NextResponse.json({ ok: false, error: resolved.error }, { status: resolved.status })

  let body: { name?: string; email?: string; monthlySummaryEnabled?: boolean } = {}
  try { body = await req.json() } catch { /* empty */ }

  const email = (body.email ?? '').trim()
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ ok: false, error: 'invalid_email' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const { error } = await supabase
    .from('businesses')
    .update({
      billing_contact_name: (body.name ?? '').trim() || null,
      billing_contact_email: email || null,
      monthly_summary_enabled: body.monthlySummaryEnabled !== false,
    })
    .eq('id', resolved.businessId)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
