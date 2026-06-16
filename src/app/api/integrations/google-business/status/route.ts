// GET /api/integrations/google-business/status — session auth (or ?adminClientId)

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { resolveBusinessId } from '@/lib/resolve-business'
import { isGbpConfigured } from '@/lib/integrations/google-business'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const adminClientId = request.nextUrl.searchParams.get('adminClientId')
  const auth = await resolveBusinessId(adminClientId, request)
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const admin = createAdminClient()
  const { data: biz } = await admin
    .from('businesses')
    .select('google_refresh_token, google_business_location_id, google_business_name, google_business_connected_at')
    .eq('id', auth.businessId)
    .maybeSingle()

  return NextResponse.json({
    ok: true,
    configured: isGbpConfigured(),
    google_connected: Boolean(biz?.google_refresh_token),
    connected: Boolean(biz?.google_business_location_id),
    business_name: (biz?.google_business_name as string | null) ?? null,
    connected_at: (biz?.google_business_connected_at as string | null) ?? null,
  })
}
