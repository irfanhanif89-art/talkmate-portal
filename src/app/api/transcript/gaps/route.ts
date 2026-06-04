// Session 4B — pending transcript gaps for the current business.
// GET, Supabase user auth (cookie) + ?adminClientId= admin parity + Bearer.
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
    .from('transcript_gaps')
    .select('id, question, context, detected_at, call_id, calls(started_at, duration_seconds, caller_number)')
    .eq('business_id', resolved.businessId)
    .eq('status', 'pending')
    .order('detected_at', { ascending: false })
    .limit(20)

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, gaps: data ?? [] })
}
