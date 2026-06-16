// GET /api/integrations/myob/status — session auth (or ?adminClientId).

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { resolveBusinessId } from '@/lib/resolve-business'
import { isMyobConfigured } from '@/lib/integrations/myob'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const adminClientId = request.nextUrl.searchParams.get('adminClientId')
  const auth = await resolveBusinessId(adminClientId, request)
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const admin = createAdminClient()
  const { data: biz } = await admin
    .from('businesses')
    .select('myob_access_token, myob_company_id, myob_company_name, myob_connected_at')
    .eq('id', auth.businessId)
    .maybeSingle()

  return NextResponse.json({
    ok: true,
    configured: isMyobConfigured(),
    connected: Boolean(biz?.myob_access_token),
    company_name: (biz?.myob_company_name as string | null) ?? null,
    company_id: (biz?.myob_company_id as string | null) ?? null,
    connected_at: (biz?.myob_connected_at as string | null) ?? null,
  })
}
