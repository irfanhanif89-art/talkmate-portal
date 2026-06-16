// GET /api/integrations/hubspot/status — session auth (or ?adminClientId).
// Never returns raw tokens.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { resolveBusinessId } from '@/lib/resolve-business'
import { isHubSpotConfigured } from '@/lib/integrations/hubspot'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const adminClientId = request.nextUrl.searchParams.get('adminClientId')
  const auth = await resolveBusinessId(adminClientId, request)
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const admin = createAdminClient()
  const { data: biz } = await admin
    .from('businesses')
    .select('hubspot_access_token, hubspot_portal_id, hubspot_connected_at')
    .eq('id', auth.businessId)
    .maybeSingle()

  return NextResponse.json({
    ok: true,
    configured: isHubSpotConfigured(),
    connected: Boolean(biz?.hubspot_access_token),
    portal_id: (biz?.hubspot_portal_id as string | null) ?? null,
    connected_at: (biz?.hubspot_connected_at as string | null) ?? null,
  })
}
