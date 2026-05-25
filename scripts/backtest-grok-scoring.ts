// Back-test: re-score the most-recent Claude-scored calls with Grok and
// compare the results against four quality bars.
//
// READ-ONLY against the calls table. Reads existing Claude scores and
// transcripts, re-scores via `scoreViaGrok` (exported from
// `call-intelligence.ts`), writes per-call detail to
// `scripts/backtest-results.json`.
//
// Run:
//   # Make sure these env vars are exported from your local .env.local
//   #   NEXT_PUBLIC_SUPABASE_URL
//   #   SUPABASE_SERVICE_ROLE_KEY
//   #   GROK_API_KEY
//   # Node 20.6+ users can also pass --env-file=.env.local
//   npx tsx scripts/backtest-grok-scoring.ts
//
// Notes:
//   - This script does NOT honour SCORING_PROVIDER — it always exercises
//     the Grok path so we can compare against Claude's persisted scores.
//   - Creates its own Supabase admin client (bypasses the Next.js server
//     helper which imports `next/headers` and won't work outside Next).
//
// Created: 2026-05-25 hotfix Grok scoring migration.

import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { writeFileSync } from 'node:fs'
import {
  scoreViaGrok,
  type CallIntelligenceInput,
  type RelatedSms,
} from '../src/lib/call-intelligence'

const BACKTEST_SIZE = 100
const CRITICAL_FLAGS = new Set(['agent_error', 'missed_lead', 'sms_mismatch'])

interface CallRow {
  id: string
  business_id: string
  transcript: string | null
  summary: string | null
  duration_seconds: number | null
  caller_number: string | null
  outcome: string | null
  started_at: string | null
  ended_at: string | null
  created_at: string
  intelligence_score: number | null
  intelligence_flags: unknown
  intelligence_status: string | null
}

interface BusinessRow {
  id: string
  name: string | null
  industry: string | null
  business_type: string | null
}

interface VipRow {
  phone: string | null
  name: string | null
  vip_bypass: boolean | null
}

interface SmsRow {
  to_phone: string | null
  message: string
  sms_type: string | null
  status: string | null
  sent_at: string | null
}

interface ResultRow {
  call_id: string
  business_id: string
  claude_score: number
  grok_score: number | null
  delta: number | null
  claude_flagged: boolean
  grok_flagged: boolean
  claude_critical_flags: string[]
  grok_critical_flags: string[]
  error: string | null
}

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL not set')
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not set')
  return createSupabaseClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

function extractCriticalFlagTypes(rawFlags: unknown): string[] {
  if (!Array.isArray(rawFlags)) return []
  return rawFlags
    .map(f => (f && typeof f === 'object' ? (f as { type?: string }).type : null))
    .filter((t): t is string => typeof t === 'string' && CRITICAL_FLAGS.has(t))
}

async function buildBacktestInput(
  supabase: ReturnType<typeof createAdminClient>,
  call: CallRow,
): Promise<CallIntelligenceInput | null> {
  // Mirror score-call-async's lookups: business + active vip_callers +
  // related sms_log inside the 10-minute window after the call ended.
  const [bizRes, vipRes] = await Promise.all([
    supabase
      .from('businesses')
      .select('id, name, industry, business_type')
      .eq('id', call.business_id)
      .maybeSingle(),
    supabase
      .from('vip_callers')
      .select('phone, name, vip_bypass')
      .eq('client_id', call.business_id)
      .eq('is_active', true),
  ])

  const business = bizRes.data as BusinessRow | null
  if (!business) return null
  const vips = (vipRes.data ?? []) as VipRow[]

  const callEndIso = call.ended_at ?? call.created_at
  const windowEndIso = new Date(Date.parse(callEndIso) + 10 * 60 * 1000).toISOString()

  const { data: smsData } = await supabase
    .from('sms_log')
    .select('to_phone, message, sms_type, status, sent_at')
    .eq('client_id', call.business_id)
    .gte('sent_at', callEndIso)
    .lte('sent_at', windowEndIso)
    .order('sent_at', { ascending: true })

  const relatedSms = ((smsData ?? []) as SmsRow[]).map<RelatedSms>(s => ({
    sms_type: s.sms_type,
    to_phone: s.to_phone,
    message: s.message,
    status: s.status,
    sent_at: s.sent_at,
  }))

  return {
    transcript: call.transcript ?? '',
    summary: call.summary,
    duration_seconds: call.duration_seconds,
    caller_phone: call.caller_number,
    outcome: call.outcome,
    business_name: business.name ?? 'this business',
    industry: business.industry ?? business.business_type ?? null,
    vip_callers: vips
      .filter(v => !!v.phone)
      .map(v => ({
        phone: v.phone as string,
        name: v.name ?? '',
        vip_bypass: !!v.vip_bypass,
      })),
    related_sms: relatedSms,
  }
}

async function main(): Promise<void> {
  const supabase = createAdminClient()

  if (!process.env.GROK_API_KEY) {
    console.error('GROK_API_KEY not set — cannot run back-test')
    process.exit(1)
  }

  const { data: calls, error } = await supabase
    .from('calls')
    .select(
      'id, business_id, transcript, summary, duration_seconds, caller_number, outcome, started_at, ended_at, created_at, intelligence_score, intelligence_flags, intelligence_status',
    )
    .not('intelligence_score', 'is', null)
    .not('transcript', 'is', null)
    .order('intelligence_scored_at', { ascending: false })
    .limit(BACKTEST_SIZE)

  if (error || !calls) {
    console.error('Failed to fetch calls:', error?.message)
    process.exit(1)
  }

  if (calls.length === 0) {
    console.error('No Claude-scored calls found. Cannot back-test on an empty set.')
    process.exit(1)
  }

  console.log(`Back-testing ${calls.length} calls against Grok (${'grok-4.20-0309-non-reasoning'})...`)

  const results: ResultRow[] = []

  for (const call of calls as CallRow[]) {
    try {
      const input = await buildBacktestInput(supabase, call)
      if (!input) {
        throw new Error(`business ${call.business_id} not found`)
      }

      const grokResult = await scoreViaGrok(input)

      results.push({
        call_id: call.id,
        business_id: call.business_id,
        claude_score: call.intelligence_score!,
        grok_score: grokResult.score,
        delta: grokResult.score - call.intelligence_score!,
        claude_flagged: call.intelligence_score! < 5,
        grok_flagged: grokResult.score < 5,
        claude_critical_flags: extractCriticalFlagTypes(call.intelligence_flags),
        grok_critical_flags: extractCriticalFlagTypes(grokResult.flags),
        error: null,
      })
    } catch (e) {
      results.push({
        call_id: call.id,
        business_id: call.business_id,
        claude_score: call.intelligence_score!,
        grok_score: null,
        delta: null,
        claude_flagged: (call.intelligence_score ?? 0) < 5,
        grok_flagged: false,
        claude_critical_flags: extractCriticalFlagTypes(call.intelligence_flags),
        grok_critical_flags: [],
        error: (e as Error).message,
      })
    }
    process.stdout.write('.')
  }
  console.log()

  const successful = results.filter(r => r.error === null && r.grok_score !== null)
  const errorCount = results.length - successful.length

  if (successful.length === 0) {
    console.error('\nEvery call errored. Likely model name or API key issue — abort cutover.')
    writeFileSync(
      'scripts/backtest-results.json',
      JSON.stringify({ passed: false, errorCount, results }, null, 2),
    )
    process.exit(1)
  }

  const meanAbsDelta = successful.reduce((s, r) => s + Math.abs(r.delta!), 0) / successful.length
  const meanDelta = successful.reduce((s, r) => s + r.delta!, 0) / successful.length
  const flaggedAgreement =
    successful.filter(r => r.claude_flagged === r.grok_flagged).length / successful.length

  const claudeCriticalCalls = successful.filter(r => r.claude_critical_flags.length > 0)
  const criticalFlagRecall =
    claudeCriticalCalls.length === 0
      ? 1.0
      : claudeCriticalCalls.filter(r =>
          r.claude_critical_flags.some(f => r.grok_critical_flags.includes(f)),
        ).length / claudeCriticalCalls.length

  const errorRate = errorCount / results.length

  const bars = {
    'Avg |delta| per call (target ≤ 0.5)': meanAbsDelta.toFixed(2),
    'Classification agreement at 5-boundary (target ≥ 85%)':
      `${(flaggedAgreement * 100).toFixed(1)}%`,
    'Critical flag recall (target ≥ 90%)': `${(criticalFlagRecall * 100).toFixed(1)}%`,
    'Directional bias mean delta (target |x| ≤ 0.3)': meanDelta.toFixed(2),
    'Error rate (target ≤ 5%)': `${errorCount}/${results.length} (${(errorRate * 100).toFixed(1)}%)`,
  }

  console.log('\n=== Quality bars ===')
  for (const [k, v] of Object.entries(bars)) console.log(`  ${k}: ${v}`)

  const passed =
    meanAbsDelta <= 0.5 &&
    flaggedAgreement >= 0.85 &&
    criticalFlagRecall >= 0.9 &&
    Math.abs(meanDelta) <= 0.3 &&
    errorRate <= 0.05

  console.log(
    `\n=== Verdict: ${passed ? 'PASS — safe to cutover to Grok' : 'FAIL — fall back to Anthropic Haiku'} ===\n`,
  )

  writeFileSync(
    'scripts/backtest-results.json',
    JSON.stringify(
      {
        bars,
        passed,
        errorCount,
        meanAbsDelta,
        meanDelta,
        flaggedAgreement,
        criticalFlagRecall,
        errorRate,
        results,
      },
      null,
      2,
    ),
  )
  console.log('Per-call detail written to scripts/backtest-results.json')
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
