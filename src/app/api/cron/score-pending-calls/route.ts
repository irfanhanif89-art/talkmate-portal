import { NextResponse } from 'next/server'
import { verifyCron } from '@/lib/cron-auth'
import { createAdminClient } from '@/lib/supabase/server'
import { scoreCallAsync } from '@/lib/score-call-async'

// Session 18 — Call Intelligence retry sweep.
// Runs every 10 minutes (see vercel.json). Picks up calls that ended
// without a scoring result (transient Anthropic errors, late
// transcripts, cold-start hiccups) and rescores them. Bounded to recent
// calls so we don't keep re-scoring stale ones forever.

const BATCH_LIMIT = 10
const LOOKBACK_HOURS = 24

interface PendingCallRow {
  vapi_call_id: string | null
  business_id: string
}

export async function GET(request: Request) {
  const auth = verifyCron(request)
  if (auth) return auth

  const supabase = createAdminClient()
  const cutoff = new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('calls')
    .select('vapi_call_id, business_id')
    .in('intelligence_status', ['pending', 'error'])
    .gte('created_at', cutoff)
    .not('vapi_call_id', 'is', null)
    .not('transcript', 'is', null)
    .order('created_at', { ascending: false })
    .limit(BATCH_LIMIT)

  if (error) {
    console.error('[score-pending-calls] query failed', error.message)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  const rows = (data ?? []) as PendingCallRow[]
  if (rows.length === 0) {
    return NextResponse.json({ ok: true, attempted: 0 })
  }

  // Run sequentially to keep load on Anthropic (and our wallet) bounded.
  // The webhook is the primary path; this cron is a safety net.
  let attempted = 0
  for (const row of rows) {
    if (!row.vapi_call_id) continue
    attempted++
    await scoreCallAsync(row.vapi_call_id, row.business_id, 2)
  }

  return NextResponse.json({ ok: true, attempted })
}
