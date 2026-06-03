// GET /api/industry-packs
// Returns the list of industries that have active packs available.
// Dual-mode auth (user cookie or ?adminClientId) via resolveBusinessId.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { resolveBusinessId } from '@/lib/resolve-business'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const adminClientId = request.nextUrl.searchParams.get('adminClientId')
  const auth = await resolveBusinessId(adminClientId, request)
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('industry_packs')
    .select('industry')
    .eq('is_active', true)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  const industries = Array.from(new Set((data ?? []).map((r) => r.industry as string))).sort()
  return NextResponse.json({ ok: true, industries })
}
