// POST /api/integrations/google-business/disconnect — session auth (or ?adminClientId)
// Clears only the GBP location link. Does NOT disconnect the main Google OAuth
// (that would also break Gmail + Calendar).

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
    google_business_location_id: null,
    google_business_name: null,
    google_business_connected_at: null,
  }).eq('id', auth.businessId)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
