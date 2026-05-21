import { NextResponse } from 'next/server'
import { verifyCron } from '@/lib/cron-auth'
import { createAdminClient } from '@/lib/supabase/server'

// Session 22B — Daily quality digest.
//
// Sends one Telegram message per day to the operator chat summarising
// yesterday's scored calls: total, average score, flagged count, a
// per-client breakdown, and the lowest-scoring call.
//
// Scheduled for 8am AEST every day. Vercel crons run in UTC, so the
// vercel.json entry is `0 22 * * *` (22:00 UTC = 8:00 AEST in
// Brisbane, which doesn't observe DST). Don't get confused by the
// brief's `0 8 * * *` shorthand — that would fire at 6pm AEST.
//
// Like every other notification on this codebase, delivery is
// best-effort: if Telegram fails or the chat isn't configured we
// return ok=false with a reason but never throw.

const TG_BASE = 'https://api.telegram.org/bot'
const PORTAL_BASE = 'https://app.talkmate.com.au'
// Brisbane = UTC+10 year-round (no DST).
const AEST_OFFSET_MS = 10 * 60 * 60 * 1000

interface ScoredCallRow {
  id: string
  business_id: string
  caller_number: string | null
  intelligence_score: number | null
  intelligence_status: string | null
  intelligence_flags: unknown
  intelligence_scored_at: string | null
  vapi_call_id: string | null
  // Session 24 — needed to identify genuine dropped calls so we can
  // exclude them from the score average. A call with duration < 10s
  // and only the short_call flag is a caller hang-up, not an agent
  // failure — including it in the average is unfairly punitive.
  duration_seconds: number | null
}

// Session 24 — a row qualifies as a "dropped call" when the caller
// barely engaged (under 10 seconds) and the only flag the scorer
// raised was short_call. Anything else (no_resolution, agent_error,
// missed_lead, sms_mismatch, etc.) still counts toward the average
// because it represents real agent behaviour worth measuring.
function isDroppedCall(row: ScoredCallRow): boolean {
  const duration = row.duration_seconds ?? 0
  if (duration >= 10) return false
  const flags = Array.isArray(row.intelligence_flags) ? row.intelligence_flags : []
  if (flags.length === 0) return true // ultra-short, scorer saw nothing worth flagging
  if (flags.length !== 1) return false
  const onlyFlag = flags[0] as { type?: string } | string
  const type = typeof onlyFlag === 'string' ? onlyFlag : onlyFlag?.type
  return type === 'short_call'
}

interface BusinessLookup {
  id: string
  name: string | null
}

function yesterdayWindowUtc(): { start: string; end: string; label: string } {
  // Treat the day boundary as midnight AEST; convert back to UTC for
  // the database query. "Yesterday" relative to current Brisbane time.
  const nowAest = new Date(Date.now() + AEST_OFFSET_MS)
  const yAest = new Date(nowAest)
  yAest.setUTCDate(yAest.getUTCDate() - 1)
  yAest.setUTCHours(0, 0, 0, 0)
  const startAest = yAest.getTime()
  const endAest = startAest + 24 * 60 * 60 * 1000

  // Back to real UTC.
  const startUtc = new Date(startAest - AEST_OFFSET_MS)
  const endUtc = new Date(endAest - AEST_OFFSET_MS)

  const label = yAest.toISOString().slice(0, 10) // YYYY-MM-DD AEST
  return { start: startUtc.toISOString(), end: endUtc.toISOString(), label }
}

export async function GET(request: Request) {
  const auth = verifyCron(request)
  if (auth) return auth

  const botToken = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID
  if (!botToken || !chatId) {
    return NextResponse.json({ ok: false, reason: 'Telegram not configured' })
  }

  const supabase = createAdminClient()
  const { start, end, label } = yesterdayWindowUtc()

  const { data: calls, error } = await supabase
    .from('calls')
    .select('id, business_id, caller_number, intelligence_score, intelligence_status, intelligence_flags, intelligence_scored_at, vapi_call_id, duration_seconds')
    .gte('intelligence_scored_at', start)
    .lt('intelligence_scored_at', end)
    .not('intelligence_score', 'is', null)
    .order('intelligence_score', { ascending: true })

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  const rows = (calls ?? []) as ScoredCallRow[]
  const total = rows.length

  // Empty day — short and sweet.
  if (total === 0) {
    await sendTelegram(botToken, chatId,
      `📊 *TalkMate Daily Quality Report — ${label}*\n\nAll quiet yesterday — no calls scored.`,
    )
    return NextResponse.json({ ok: true, total: 0, label })
  }

  // Session 24 — split rows into scoreable vs dropped before averaging.
  // Dropped calls (sub-10s with only short_call) are surfaced as a
  // separate count so the operator still sees them, but they don't
  // drag the average down. This was the calibration bug Glen and
  // Chris complained about — silent hang-ups scoring 3/10 made the
  // weekly average look catastrophic when nothing was actually wrong.
  const scoreable = rows.filter(r => !isDroppedCall(r))
  const droppedCount = rows.length - scoreable.length
  const scoreableTotal = scoreable.length
  const scores = scoreable.map(r => r.intelligence_score ?? 0)
  const avg = scoreableTotal > 0
    ? scores.reduce((s, n) => s + n, 0) / scoreableTotal
    : 0
  const flaggedCount = scoreable.filter(r => {
    const flags = Array.isArray(r.intelligence_flags) ? r.intelligence_flags : []
    return flags.length > 0 || (r.intelligence_score ?? 10) < 5
  }).length

  // Per-business rollups — also excludes dropped calls from per-client averages.
  const byBiz = new Map<string, { count: number; sum: number; flagged: number; dropped: number }>()
  for (const r of rows) {
    const slot = byBiz.get(r.business_id) ?? { count: 0, sum: 0, flagged: 0, dropped: 0 }
    if (isDroppedCall(r)) {
      slot.dropped += 1
    } else {
      slot.count += 1
      slot.sum += r.intelligence_score ?? 0
      const flags = Array.isArray(r.intelligence_flags) ? r.intelligence_flags : []
      if (flags.length > 0 || (r.intelligence_score ?? 10) < 5) slot.flagged += 1
    }
    byBiz.set(r.business_id, slot)
  }

  // Resolve business names for the IDs we actually saw.
  const bizIds = Array.from(byBiz.keys())
  const { data: bizRows } = await supabase
    .from('businesses')
    .select('id, name')
    .in('id', bizIds)
  const bizNameById = new Map<string, string>()
  for (const b of (bizRows ?? []) as BusinessLookup[]) {
    bizNameById.set(b.id, b.name ?? 'Unknown')
  }

  const perClientLines = Array.from(byBiz.entries())
    .map(([id, s]) => {
      const name = bizNameById.get(id) ?? 'Unknown'
      if (s.count === 0) {
        // Only dropped calls — show the dropped count without an avg.
        return `• ${escapeMarkdown(name)}: 0 scoreable calls, ${s.dropped} dropped (excluded)`
      }
      const a = (s.sum / s.count).toFixed(1)
      const droppedSuffix = s.dropped > 0 ? `, ${s.dropped} dropped (excluded)` : ''
      return `• ${escapeMarkdown(name)}: ${s.count} call${s.count === 1 ? '' : 's'}, avg ${a}/10, ${s.flagged} flagged${droppedSuffix}`
    })
    .sort()
    .join('\n')

  // All-clear shortcut when nothing scoreable was below 7.
  const allClear = scoreable.length > 0 && scoreable.every(r => (r.intelligence_score ?? 0) >= 7)
  if (allClear) {
    const droppedSuffix = droppedCount > 0
      ? ` (${droppedCount} dropped call${droppedCount === 1 ? '' : 's'} excluded from average.)`
      : ''
    await sendTelegram(botToken, chatId,
      `📊 *TalkMate Daily Quality Report — ${label}*\n\nAll clear — ${scoreableTotal} call${scoreableTotal === 1 ? '' : 's'} scored, all above 7/10.${droppedSuffix}`,
    )
    return NextResponse.json({ ok: true, total, scoreable: scoreableTotal, dropped: droppedCount, all_clear: true, label })
  }

  // Lowest-scoring call — pick the worst scoreable call, not a dropped one.
  // Fall back to the worst row only when every call was dropped.
  const worst = scoreable[0] ?? rows[0]
  const worstName = bizNameById.get(worst.business_id) ?? 'Unknown'
  const worstLink = `${PORTAL_BASE}/admin/clients/${worst.business_id}/portal/calls`
  const worstLine = `${escapeMarkdown(worst.caller_number ?? 'Unknown caller')} at ${escapeMarkdown(worstName)} — ${worst.intelligence_score}/10`

  const droppedNote = droppedCount > 0
    ? `\n${droppedCount} dropped call${droppedCount === 1 ? '' : 's'} excluded from score average`
    : ''

  const message = [
    `📊 *TalkMate Daily Quality Report — ${label}*`,
    ``,
    `Calls scored yesterday: ${scoreableTotal}${droppedNote}`,
    scoreableTotal > 0 ? `Average score: ${avg.toFixed(1)}/10` : `Average score: n/a (only dropped calls)`,
    `Flagged calls: ${flaggedCount}`,
    ``,
    `*By client:*`,
    perClientLines,
    ``,
    `*Lowest scoring call:*`,
    worstLine,
    `[Review](${worstLink})`,
  ].join('\n')

  const sent = await sendTelegram(botToken, chatId, message)
  return NextResponse.json({ ok: sent, total, scoreable: scoreableTotal, dropped: droppedCount, flagged: flaggedCount, label })
}

async function sendTelegram(token: string, chatId: string, text: string): Promise<boolean> {
  try {
    const res = await fetch(`${TG_BASE}${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
      }),
    })
    return res.ok
  } catch {
    return false
  }
}

function escapeMarkdown(s: string): string {
  return s.replace(/([_*`\[\]])/g, '\\$1')
}
