// Pure client-health evaluation logic, extracted from the
// /api/cron/client-health-watch route so it can be unit-tested without a
// database. The cron route owns fetching + alerting; this module owns
// the metric math + threshold decision.

// Tunable thresholds — keep at the top so they're easy to adjust.
export const CLIENT_HEALTH_CONFIG = {
  WINDOW_DAYS: 7,
  MIN_CALLS: 8, // below this, sample too small to judge — skip
  AVG_DURATION_LT: 20, // seconds
  SUB5_SHARE_GT: 0.5, // >50% of calls under 5 seconds
  SHORT_DURATION_S: 5,
  REPEAT_SHORT_CALLERS_GTE: 3, // distinct numbers calling repeatedly and bouncing
  SILENCE_RATE_GT: 0.15, // >15% of calls end in silence-timeout
  DEDUP_DAYS: 7,
}

export type CallRow = {
  duration_seconds: number | null
  caller_number: string | null
  ended_reason: string | null
}

export interface HealthResult {
  total: number
  avgDuration: number
  sub5Share: number
  silenceRate: number
  repeatShortCallers: number
  repeatShortNumbers: string[]
  reasons: string[]
  breached: boolean
  severity: 'warning' | 'critical'
  metrics: {
    avg_duration_s: number
    sub5_share: number
    silence_rate: number
    repeat_short_callers: number
    window_calls: number
  }
}

// Session 4B — account-level churn signals that the call-quality eval above
// can't see (a quiet client with zero calls never trips the call gate). Pure
// scoring; the cron supplies the inputs. health = 100 - riskScore; the cron
// alerts when riskScore is high (>= 60 by default).
export interface AccountSignalInput {
  daysSinceLogin: number | null
  kbCount: number
  callsLast7d: number
  accountAgeDays: number
  winbackEnabled: boolean
  reviewRequestsEnabled: boolean
  hasGoogleReviewUrl: boolean
  pendingGapsOver3d: number
}

export interface AccountSignalResult {
  riskScore: number
  healthScore: number
  reasons: string[]
}

export function evaluateAccountSignals(i: AccountSignalInput): AccountSignalResult {
  let risk = 0
  const reasons: string[] = []

  if (i.daysSinceLogin != null && i.daysSinceLogin > 14) {
    risk += 20; reasons.push(`No portal login in ${i.daysSinceLogin} days`)
  }
  if (i.kbCount < 5) {
    risk += 15; reasons.push(`Only ${i.kbCount} knowledge base entries`)
  }
  if (!i.winbackEnabled) {
    risk += 10; reasons.push('Win-back disabled')
  }
  if (!i.reviewRequestsEnabled && i.hasGoogleReviewUrl) {
    risk += 10; reasons.push('Review requests off despite a Google review link')
  }
  if (i.callsLast7d === 0 && i.accountAgeDays > 30) {
    risk += 25; reasons.push('No calls in the last 7 days (established client gone quiet)')
  }
  if (i.pendingGapsOver3d >= 3) {
    risk += 10; reasons.push(`${i.pendingGapsOver3d} unanswered questions pending 3+ days`)
  }

  return { riskScore: risk, healthScore: Math.max(0, 100 - risk), reasons }
}

export function evaluateClientHealth(calls: CallRow[]): HealthResult {
  const C = CLIENT_HEALTH_CONFIG
  const total = calls.length
  const durations = calls.map(c => c.duration_seconds ?? 0)
  const avgDuration = total ? durations.reduce((a, b) => a + b, 0) / total : 0

  const sub5 = calls.filter(c => (c.duration_seconds ?? 0) < C.SHORT_DURATION_S).length
  const sub5Share = total ? sub5 / total : 0

  const silence = calls.filter(c => c.ended_reason === 'silence-timed-out').length
  const silenceRate = total ? silence / total : 0

  // Distinct numbers that called >=2 times in the window and bounce on
  // average (avg duration under the short threshold) — i.e. regulars who
  // keep hanging up the moment they hear the agent.
  const byNumber = new Map<string, number[]>()
  for (const c of calls) {
    const n = (c.caller_number ?? '').trim()
    if (!n || n === 'anonymous') continue
    const arr = byNumber.get(n) ?? []
    arr.push(c.duration_seconds ?? 0)
    byNumber.set(n, arr)
  }
  let repeatShortCallers = 0
  const repeatShortNumbers: string[] = []
  for (const [num, durs] of byNumber) {
    if (durs.length < 2) continue
    const avg = durs.reduce((a, b) => a + b, 0) / durs.length
    if (avg < C.SHORT_DURATION_S) {
      repeatShortCallers++
      repeatShortNumbers.push(num)
    }
  }

  const reasons: string[] = []
  if (avgDuration < C.AVG_DURATION_LT)
    reasons.push(`Avg call duration ${avgDuration.toFixed(0)}s (under ${C.AVG_DURATION_LT}s)`)
  if (sub5Share > C.SUB5_SHARE_GT)
    reasons.push(`${(sub5Share * 100).toFixed(0)}% of calls under ${C.SHORT_DURATION_S}s (over ${(C.SUB5_SHARE_GT * 100).toFixed(0)}%)`)
  if (repeatShortCallers >= C.REPEAT_SHORT_CALLERS_GTE)
    reasons.push(`${repeatShortCallers} regular callers hanging up almost instantly`)
  if (silenceRate > C.SILENCE_RATE_GT)
    reasons.push(`${(silenceRate * 100).toFixed(0)}% of calls ended in silence (over ${(C.SILENCE_RATE_GT * 100).toFixed(0)}%)`)

  const breached = reasons.length > 0
  const severity: 'warning' | 'critical' =
    reasons.length >= 2 || avgDuration < 10 ? 'critical' : 'warning'

  return {
    total,
    avgDuration,
    sub5Share,
    silenceRate,
    repeatShortCallers,
    repeatShortNumbers: repeatShortNumbers.slice(0, 5),
    reasons,
    breached,
    severity,
    metrics: {
      avg_duration_s: Math.round(avgDuration),
      sub5_share: Number(sub5Share.toFixed(2)),
      silence_rate: Number(silenceRate.toFixed(2)),
      repeat_short_callers: repeatShortCallers,
      window_calls: total,
    },
  }
}
