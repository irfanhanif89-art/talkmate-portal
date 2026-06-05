// Session 4B Phase C — owner marketing-SMS consent (Spam Act gate for the
// referral / NPS-promoter SMS). GET/PATCH, cookie/admin/Bearer auth.
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { resolveBusinessId } from '@/lib/resolve-business'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const resolved = await resolveBusinessId(url.searchParams.get('adminClientId'), req)
  if (!resolved.ok) return NextResponse.json({ ok: false, error: resolved.error }, { status: resolved.status })

  const supabase = createAdminClient()
  const { data } = await supabase
    .from('businesses')
    .select('owner_marketing_sms_consent')
    .eq('id', resolved.businessId)
    .maybeSingle()
  return NextResponse.json({ ok: true, consent: data?.owner_marketing_sms_consent ?? false })
}

export async function PATCH(req: Request) {
  const url = new URL(req.url)
  const resolved = await resolveBusinessId(url.searchParams.get('adminClientId'), req)
  if (!resolved.ok) return NextResponse.json({ ok: false, error: resolved.error }, { status: resolved.status })

  let body: { consent?: boolean } = {}
  try { body = await req.json() } catch { /* empty */ }
  const consent = body.consent === true

  const supabase = createAdminClient()
  const { error } = await supabase
    .from('businesses')
    .update({
      owner_marketing_sms_consent: consent,
      owner_marketing_sms_consent_at: consent ? new Date().toISOString() : null,
    })
    .eq('id', resolved.businessId)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, consent })
}
