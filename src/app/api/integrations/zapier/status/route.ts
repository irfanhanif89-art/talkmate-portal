// GET /api/integrations/zapier/status — session auth (or ?adminClientId)

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { resolveBusinessId } from '@/lib/resolve-business'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const adminClientId = request.nextUrl.searchParams.get('adminClientId')
  const auth = await resolveBusinessId(adminClientId, request)
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const admin = createAdminClient()
  const { data: biz } = await admin
    .from('businesses')
    .select('zapier_webhook_url, zapier_connected_at, zapier_last_triggered_at')
    .eq('id', auth.businessId)
    .maybeSingle()

  return NextResponse.json({
    ok: true,
    connected: Boolean(biz?.zapier_webhook_url),
    webhook_url: (biz?.zapier_webhook_url as string | null) ?? null,
    connected_at: (biz?.zapier_connected_at as string | null) ?? null,
    last_triggered_at: (biz?.zapier_last_triggered_at as string | null) ?? null,
  })
}
