import { NextResponse } from 'next/server'
import { verifyCron } from '@/lib/cron-auth'
import { createAdminClient } from '@/lib/supabase/server'
import { scoreCallAsync } from '@/lib/score-call-async'

// Session 18 — Call Intelligence retry sweep.
// Runs every 10 minutes (see vercel.json). Picks up calls that ended
// without a scoring result (transient Anthropic errors, late
// transcripts, cold-start hiccups) and rescores them. Bounded to recent
// calls so we don't keep re-scoring stale ones forever.
//
// Session 22 (fix-scoring-prompt) — also picks up a small batch of
// false-negative candidates: calls already scored in the last 7 days
// at <=4/10 whose only flag was 'short_call'. Those were mostly
// scored low because the supervisor model misread the standard
// greeting + recording notice as wrong. The corrected SYSTEM_PROMPT
// in call-intelligence.ts won't repeat that mistake, so resetting
// them to pending lets this cron rescore them with the new prompt.
// Note: the brief references intelligence_status = 'scored', but the
// actual values stored are 'resolved' | 'review' | 'critical' (plus
// 'pending' | 'error'). "Scored" here means any non-pending,
// non-error status.

const BATCH_LIMIT = 10
// Session 28 (H13): pending uses 24h, error uses 7 days. Error rows
// older than 24h were permanently stuck under the old single window —
// the recovery sweep could never reach them.
const PENDING_LOOKBACK_HOURS = 24
const ERROR_LOOKBACK_HOURS = 7 * 24

// False-negative rescore knobs (kept small so a stuck row can't
// hog the budget — the admin one-shot endpoint can do bigger sweeps).
const FALSE_NEG_LOOKBACK_DAYS = 7
const FALSE_NEG_MAX_SCORE = 4
const FALSE_NEG_BATCH = 5

interface PendingCallRow {
  vapi_call_id: string | null
  business_id: string
  created_at: string
}

interface FalseNegRow {
  id: string
  intelligence_flags: unknown
}

export async function GET(request: Request) {
  const auth = verifyCron(request)
  if (auth) return auth

  const supabase = createAdminClient()
  const pendingCutoff = new Date(Date.now() - PENDING_LOOKBACK_HOURS * 60 * 60 * 1000).toISOString()
  const errorCutoff = new Date(Date.now() - ERROR_LOOKBACK_HOURS * 60 * 60 * 1000).toISOString()

  // ── Step 1: reset false-negative candidates back to 'pending' so
  //           the normal pending sweep below picks them up.
  const falseNegCutoff = new Date(
    Date.now() - FALSE_NEG_LOOKBACK_DAYS * 24 * 60 * 60 * 1000
  ).toISOString()

  let falseNegResetCount = 0
  try {
    const { data: candidates } = await supabase
      .from('calls')
      .select('id, intelligence_flags')
      .in('intelligence_status', ['resolved', 'review', 'critical'])
      .lte('intelligence_score', FALSE_NEG_MAX_SCORE)
      .gte('intelligence_scored_at', falseNegCutoff)
      .not('vapi_call_id', 'is', null)
      .not('transcript', 'is', null)
      .limit(FALSE_NEG_BATCH * 4) // grab extra so the filter below has room

    const onlyShortCall = (candidates ?? []).filter((row: FalseNegRow) => {
      const flags = Array.isArray(row.intelligence_flags) ? row.intelligence_flags : []
      if (flags.length !== 1) return false
      const first = flags[0] as { type?: string } | null
      return first?.type === 'short_call'
    }).slice(0, FALSE_NEG_BATCH)

    if (onlyShortCall.length > 0) {
      const ids = onlyShortCall.map(r => r.id)
      const { error: resetErr } = await supabase
        .from('calls')
        .update({ intelligence_status: 'pending' })
        .in('id', ids)
      if (resetErr) {
        console.error('[score-pending-calls] false-neg reset failed', resetErr.message)
      } else {
        falseNegResetCount = ids.length
      }
    }
  } catch (e) {
    // Don't let the false-neg sweep break the primary pending sweep.
    console.error('[score-pending-calls] false-neg sweep error', (e as Error).message)
  }

  // ── Step 2: rescore pending and error rows.
  //
  // Session 28 (H13): split into two queries so error rows get a wider
  // 7-day window without bloating the pending sweep. Then merge,
  // dedupe by vapi_call_id, sort oldest-first (prevents error rows
  // starving behind a flood of newer pending rows), and cap at the
  // original BATCH_LIMIT so we don't double the Anthropic spend.
  const [{ data: pendingData, error: pendingErr }, { data: errorData, error: errorErr }] = await Promise.all([
    supabase
      .from('calls')
      .select('vapi_call_id, business_id, created_at')
      .eq('intelligence_status', 'pending')
      .gte('created_at', pendingCutoff)
      .not('vapi_call_id', 'is', null)
      .not('transcript', 'is', null)
      .order('created_at', { ascending: true })
      .limit(BATCH_LIMIT),
    supabase
      .from('calls')
      .select('vapi_call_id, business_id, created_at')
      .eq('intelligence_status', 'error')
      .gte('created_at', errorCutoff)
      .not('vapi_call_id', 'is', null)
      .not('transcript', 'is', null)
      .order('created_at', { ascending: true })
      .limit(BATCH_LIMIT),
  ])

  if (pendingErr || errorErr) {
    const msg = pendingErr?.message ?? errorErr?.message ?? 'query failed'
    console.error('[score-pending-calls] query failed', msg)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }

  const merged = [...(pendingData ?? []), ...(errorData ?? [])] as PendingCallRow[]
  const rows = merged
    .filter((call, index, self) =>
      index === self.findIndex(c => c.vapi_call_id === call.vapi_call_id)
    )
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .slice(0, BATCH_LIMIT)

  if (rows.length === 0) {
    return NextResponse.json({ ok: true, attempted: 0, false_neg_reset: falseNegResetCount })
  }

  // Run sequentially to keep load on Anthropic (and our wallet) bounded.
  // The webhook is the primary path; this cron is a safety net.
  let attempted = 0
  for (const row of rows) {
    if (!row.vapi_call_id) continue
    attempted++
    await scoreCallAsync(row.vapi_call_id, row.business_id, 2)
  }

  return NextResponse.json({ ok: true, attempted, false_neg_reset: falseNegResetCount })
}
