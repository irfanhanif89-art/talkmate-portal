// POST /api/integrations/hubspot/disconnect — session auth (or ?adminClientId).
// Clears stored tokens. Does not revoke on HubSpot's side (not required).

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { resolveBusinessId } from '@/lib/resolve-business'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const adminClientId = request.nextUrl.searchParams.get('adminClientId')
  const auth = await resolveBusinessId(adminClientId, request)
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const admin = createAdminClient()
  const { error } = await admin.from('businesses').update({
    hubspot_access_token: null,
    hubspot_refresh_token: null,
    hubspot_portal_id: null,
    hubspot_connected_at: null,
  }).eq('id', auth.businessId)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
