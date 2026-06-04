// Session 4B — calls flagged for a closer look (frustration detected in the
// existing scoring pass). GET, cookie/admin/Bearer auth.
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { resolveBusinessId } from '@/lib/resolve-business'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const adminClientId = url.searchParams.get('adminClientId')
  const resolved = await resolveBusinessId(adminClientId, req)
  if (!resolved.ok) {
    return NextResponse.json({ ok: false, error: resolved.error }, { status: resolved.status })
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('calls')
    .select('id, started_at, duration_seconds, caller_number, intelligence_flags, intelligence_summary, needs_review_at')
    .eq('business_id', resolved.businessId)
    .eq('needs_review', true)
    .order('needs_review_at', { ascending: false })
    .limit(10)

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, calls: data ?? [] })
}
