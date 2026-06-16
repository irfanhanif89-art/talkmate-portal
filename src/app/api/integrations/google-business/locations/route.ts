// GET /api/integrations/google-business/locations — session auth (or ?adminClientId)
// Lists the client's GBP locations using their existing Google connection.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { resolveBusinessId } from '@/lib/resolve-business'
import { getGoogleAccessToken, listGbpLocations } from '@/lib/integrations/google-business'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const adminClientId = request.nextUrl.searchParams.get('adminClientId')
  const auth = await resolveBusinessId(adminClientId, request)
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const admin = createAdminClient()
  const { data: biz } = await admin
    .from('businesses')
    .select('google_refresh_token')
    .eq('id', auth.businessId)
    .maybeSingle()

  if (!biz?.google_refresh_token) {
    return NextResponse.json({ ok: false, error: 'google_not_connected', message: 'Connect your Google account first.' }, { status: 200 })
  }

  const token = await getGoogleAccessToken({ google_refresh_token: biz.google_refresh_token as string })
  if (!token) return NextResponse.json({ ok: false, error: 'google_token_failed' }, { status: 200 })

  const locations = await listGbpLocations(token)
  return NextResponse.json({ ok: true, locations })
}
