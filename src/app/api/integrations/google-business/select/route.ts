// POST /api/integrations/google-business/select — session auth (or ?adminClientId)
// Body: { location_resource_name: string }. Saves the chosen GBP location.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { resolveBusinessId } from '@/lib/resolve-business'
import { getGoogleAccessToken, getGbpLocation } from '@/lib/integrations/google-business'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const adminClientId = request.nextUrl.searchParams.get('adminClientId')
  const auth = await resolveBusinessId(adminClientId, request)
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  let body: { location_resource_name?: string }
  try { body = await request.json() } catch { return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 }) }
  const locName = (body.location_resource_name ?? '').trim()
  if (!locName) return NextResponse.json({ ok: false, error: 'location_resource_name required' }, { status: 400 })

  const admin = createAdminClient()
  const { data: biz } = await admin.from('businesses').select('google_refresh_token').eq('id', auth.businessId).maybeSingle()
  if (!biz?.google_refresh_token) {
    return NextResponse.json({ ok: false, error: 'google_not_connected' }, { status: 200 })
  }

  const token = await getGoogleAccessToken({ google_refresh_token: biz.google_refresh_token as string })
  if (!token) return NextResponse.json({ ok: false, error: 'google_token_failed' }, { status: 200 })

  const details = await getGbpLocation(token, locName)
  const name = details?.name ?? null

  const { error } = await admin.from('businesses').update({
    google_business_location_id: locName,
    google_business_name: name,
    google_business_connected_at: new Date().toISOString(),
  }).eq('id', auth.businessId)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, name, address: details?.address ?? null })
}
