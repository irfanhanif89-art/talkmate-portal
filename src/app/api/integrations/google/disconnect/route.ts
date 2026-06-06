// POST /api/integrations/google/disconnect[?adminClientId=]
// Clears the stored Google connection for this business.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { resolveBusinessId } from '@/lib/resolve-business'

export async function POST(request: NextRequest) {
  const adminClientId = request.nextUrl.searchParams.get('adminClientId')
  const resolved = await resolveBusinessId(adminClientId)
  if (!resolved.ok) {
    return NextResponse.json({ ok: false, error: resolved.error }, { status: resolved.status })
  }

  const admin = createAdminClient()
  await admin
    .from('businesses')
    .update({
      google_account_email: null,
      google_refresh_token: null,
      google_scopes: null,
      google_connected_at: null,
      gmail_enabled: false,
      google_calendar_enabled: false,
    })
    .eq('id', resolved.businessId)

  return NextResponse.json({ ok: true })
}
