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
    .select('id, business_id, caller_number, intelligence_score, intelligence_status, intelligence_flags, intelligence_scored_at, vapi_call_id')
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

  const scores = rows.map(r => r.intelligence_score ?? 0)
  const avg = scores.reduce((s, n) => s + n, 0) / total
  const flaggedCount = rows.filter(r => {
    const flags = Array.isArray(r.intelligence_flags) ? r.intelligence_flags : []
    return flags.length > 0 || (r.intelligence_score ?? 10) < 5
  }).length

  // Per-business rollups.
  const byBiz = new Map<string, { count: number; sum: number; flagged: number }>()
  for (const r of rows) {
    const slot = byBiz.get(r.business_id) ?? { count: 0, sum: 0, flagged: 0 }
    slot.count += 1
    slot.sum += r.intelligence_score ?? 0
    const flags = Array.isArray(r.intelligence_flags) ? r.intelligence_flags : []
    if (flags.length > 0 || (r.intelligence_score ?? 10) < 5) slot.flagged += 1
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
      const a = (s.sum / s.count).toFixed(1)
      return `• ${escapeMarkdown(name)}: ${s.count} call${s.count === 1 ? '' : 's'}, avg ${a}/10, ${s.flagged} flagged`
    })
    .sort()
    .join('\n')

  // All-clear shortcut when nothing scored under 7.
  const allClear = rows.every(r => (r.intelligence_score ?? 0) >= 7)
  if (allClear) {
    await sendTelegram(botToken, chatId,
      `📊 *TalkMate Daily Quality Report — ${label}*\n\nAll clear — ${total} call${total === 1 ? '' : 's'} scored, all above 7/10.`,
    )
    return NextResponse.json({ ok: true, total, all_clear: true, label })
  }

  // Lowest-scoring call (rows are ordered ascending by score).
  const worst = rows[0]
  const worstName = bizNameById.get(worst.business_id) ?? 'Unknown'
  const worstLink = `${PORTAL_BASE}/admin/clients/${worst.business_id}/portal/calls`
  const worstLine = `${escapeMarkdown(worst.caller_number ?? 'Unknown caller')} at ${escapeMarkdown(worstName)} — ${worst.intelligence_score}/10`

  const message = [
    `📊 *TalkMate Daily Quality Report — ${label}*`,
    ``,
    `Calls scored yesterday: ${total}`,
    `Average score: ${avg.toFixed(1)}/10`,
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
  return NextResponse.json({ ok: sent, total, flagged: flaggedCount, label })
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
