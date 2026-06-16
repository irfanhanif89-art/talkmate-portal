// POST /api/integrations/google-business/pull — session auth (or ?adminClientId)
// Re-fetches the saved GBP location and fills blank business fields ONLY
// (never overwrites name/address/opening_hours the client already set).

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { resolveBusinessId } from '@/lib/resolve-business'
import { getGoogleAccessToken, getGbpLocation } from '@/lib/integrations/google-business'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const adminClientId = request.nextUrl.searchParams.get('adminClientId')
  const auth = await resolveBusinessId(adminClientId, request)
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const admin = createAdminClient()
  const { data: biz } = await admin
    .from('businesses')
    .select('google_refresh_token, google_business_location_id, name, address, opening_hours')
    .eq('id', auth.businessId)
    .maybeSingle()

  if (!biz?.google_refresh_token || !biz?.google_business_location_id) {
    return NextResponse.json({ ok: false, error: 'gbp_not_connected' }, { status: 200 })
  }

  const token = await getGoogleAccessToken({ google_refresh_token: biz.google_refresh_token as string })
  if (!token) return NextResponse.json({ ok: false, error: 'google_token_failed' }, { status: 200 })

  const pulled = await getGbpLocation(token, biz.google_business_location_id as string)
  if (!pulled) return NextResponse.json({ ok: false, error: 'gbp_fetch_failed' }, { status: 200 })

  // Fill blanks only.
  const patch: Record<string, unknown> = { google_business_name: pulled.name ?? null }
  const isBlank = (v: unknown) => v == null || (typeof v === 'string' && v.trim() === '')
  if (isBlank(biz.name) && pulled.name) patch.name = pulled.name
  if (isBlank(biz.address) && pulled.address) patch.address = pulled.address
  if (isBlank(biz.opening_hours) && pulled.hours) patch.opening_hours = pulled.hours

  await admin.from('businesses').update(patch).eq('id', auth.businessId)

  return NextResponse.json({
    ok: true,
    pulled: { name: pulled.name, address: pulled.address, phone: pulled.phone, hours: pulled.hours },
  })
}
