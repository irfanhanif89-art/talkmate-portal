import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin-auth'

// One-shot rescore endpoint — admin only.
//
// Resets intelligence_status to 'pending' on calls already scored at
// or below max_score within the last days_back days, so the regular
// /api/cron/score-pending-calls sweep picks them up and rescores them
// with the corrected SYSTEM_PROMPT.
//
// Returns { reset_count } so admin can see how many calls will be
// rescored on the next cron tick (every 10 min per vercel.json).
//
// Body: { days_back?: number, max_score?: number }
//   - days_back default: 7
//   - max_score  default: 4

const DEFAULT_DAYS_BACK = 7
const DEFAULT_MAX_SCORE = 4

// Cap the sweep so an admin can't accidentally reset thousands of
// rows at once. If you really need a bigger sweep, call this twice.
const HARD_CAP = 500

export async function POST(req: Request) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const body = (await req.json().catch(() => ({}))) as { days_back?: unknown; max_score?: unknown }

  const daysBackRaw = Number(body.days_back)
  const days_back = Number.isFinite(daysBackRaw) && daysBackRaw > 0 && daysBackRaw <= 90
    ? Math.floor(daysBackRaw)
    : DEFAULT_DAYS_BACK

  const maxScoreRaw = Number(body.max_score)
  const max_score = Number.isFinite(maxScoreRaw) && maxScoreRaw >= 1 && maxScoreRaw <= 10
    ? Math.floor(maxScoreRaw)
    : DEFAULT_MAX_SCORE

  const supabase = createAdminClient()
  const cutoff = new Date(Date.now() - days_back * 24 * 60 * 60 * 1000).toISOString()

  // Pull the matching ids first so we can return the exact count and
  // respect HARD_CAP without doing a bulk RPC.
  const { data: candidates, error: queryErr } = await supabase
    .from('calls')
    .select('id')
    .in('intelligence_status', ['resolved', 'review', 'critical'])
    .lte('intelligence_score', max_score)
    .gte('created_at', cutoff)
    .not('vapi_call_id', 'is', null)
    .not('transcript', 'is', null)
    .order('created_at', { ascending: false })
    .limit(HARD_CAP)

  if (queryErr) {
    return NextResponse.json({ ok: false, error: queryErr.message }, { status: 500 })
  }

  const ids = (candidates ?? []).map(r => r.id)
  if (ids.length === 0) {
    return NextResponse.json({ ok: true, reset_count: 0, days_back, max_score })
  }

  const { error: updateErr } = await supabase
    .from('calls')
    .update({ intelligence_status: 'pending' })
    .in('id', ids)

  if (updateErr) {
    return NextResponse.json({ ok: false, error: updateErr.message }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    reset_count: ids.length,
    days_back,
    max_score,
    note: 'Reset to pending — the score-pending-calls cron picks them up on the next 10-minute tick.',
  })
}
