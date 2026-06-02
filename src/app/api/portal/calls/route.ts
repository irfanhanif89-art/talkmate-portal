// GET /api/portal/calls — mobile call log for the business owner.
//
// The web portal renders calls via server components; the mobile app needs a
// JSON list. Bearer (or cookie) via requireClient. Returns recent calls for
// the owner's business; the mobile screen does its own status/outcome
// filtering, so we just return the rows (capped) newest-first.

import { NextResponse } from 'next/server'
import { requireClient } from '@/lib/portal-auth'

export const dynamic = 'force-dynamic'

const MAX_LIMIT = 200

export async function GET(request: Request) {
  const auth = await requireClient(request)
  if ('error' in auth) return auth.error
  const { supabase, clientId } = auth

  const { searchParams } = new URL(request.url)
  const limit = Math.min(parseInt(searchParams.get('limit') || '100', 10) || 100, MAX_LIMIT)

  const { data, error } = await supabase
    .from('calls')
    .select('id, caller_name, caller_number, started_at, created_at, duration_seconds, outcome, summary, transcript, recording_url, intelligence_score, is_vip_caller, was_abandoned, booking_id')
    .eq('business_id', clientId)
    .order('started_at', { ascending: false, nullsFirst: false })
    .limit(limit)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ calls: data ?? [] })
}
