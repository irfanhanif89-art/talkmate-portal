// Vapi call sync — pull-based call ingestion (2026-06-11).
//
// WHY THIS EXISTS: the push-based end-of-call-report webhook (/api/webhooks/vapi)
// has been returning 401 on live inbound phone calls because Vapi sends a
// webhook secret that no longer matches VAPI_WEBHOOK_SECRET, and the secret is
// redacted on every Vapi GET so it cannot be reliably re-set/verified via the
// API. Rather than keep fighting that, this cron makes ingestion PULL-based: it
// reads each live agent's recent calls straight from the Vapi REST API (which
// authenticates with VAPI_API_KEY — known good) and upserts any that are
// missing from `calls`. This is immune to the webhook-secret problem entirely.
//
// It is a pure data sync: it ONLY inserts the call row (transcript, summary,
// duration, recording, outcome). It deliberately does NOT run the webhook's
// side-effects (owner SMS, win-back, ServiceM8, Make.com) — firing those for
// calls that already ended would be wrong/spammy. CI scoring is picked up
// separately by /api/cron/score-pending-calls. The upsert is idempotent
// (onConflict vapi_call_id, ignoreDuplicates) so it never double-inserts and
// never overwrites a row the webhook may have written.
//
// Schedule: every 3 minutes (see vercel.json).

import { NextResponse } from 'next/server'
import { verifyCron } from '@/lib/cron-auth'
import { createAdminClient } from '@/lib/supabase/server'
import { DEMO_BUSINESS_ID, WEBSITE_DEMO_ASSISTANT_ID } from '@/lib/demo-config'
import { runCallSideEffects } from '@/lib/call-side-effects'

export const maxDuration = 60

// Only consider Vapi calls from the last 2h on each run. Generous enough to
// recover from a few missed cron cycles; small enough to keep each run cheap.
const LOOKBACK_MS = 2 * 60 * 60 * 1000

interface VapiCallFull {
  id?: string
  assistantId?: string
  phoneNumberId?: string
  customer?: { number?: string; name?: string }
  startedAt?: string
  endedAt?: string
  createdAt?: string
  status?: string
  transcript?: string
  summary?: string
  recordingUrl?: string
  stereoRecordingUrl?: string
  endedReason?: string
  analysis?: { summary?: string }
}

async function fetchVapiCalls(query: string, apiKey: string): Promise<VapiCallFull[]> {
  try {
    const res = await fetch(`https://api.vapi.ai/call?${query}&limit=50`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return []
    const rows = await res.json()
    return Array.isArray(rows) ? (rows as VapiCallFull[]) : []
  } catch {
    return []
  }
}

function deriveOutcome(reason: string | null | undefined): string {
  switch (reason) {
    case 'customer-ended-call':
    case 'assistant-ended-call':
    case 'phone-call-provider-closed-websocket':
      return 'completed'
    case 'assistant-forwarded-call':
      return 'transferred'
    case 'customer-did-not-answer':
    case 'silence-timed-out':
    case 'voicemail':
    case 'twilio-failed-to-connect':
      return 'missed'
    case 'pipeline-error':
    case 'assistant-error':
      return 'failed'
    default:
      return reason || 'completed'
  }
}

function toCallRow(c: VapiCallFull, businessId: string): Record<string, unknown> {
  const started = c.startedAt ?? c.createdAt ?? null
  const ended = c.endedAt ?? null
  const durationSeconds =
    started && ended ? Math.max(0, Math.round((Date.parse(ended) - Date.parse(started)) / 1000)) : 0
  return {
    business_id: businessId,
    vapi_call_id: c.id,
    caller_number: c.customer?.number ?? null,
    caller_name: c.customer?.name ?? null,
    started_at: started,
    ended_at: ended,
    duration_seconds: durationSeconds,
    transcript: c.transcript ?? '',
    summary: c.analysis?.summary ?? c.summary ?? null,
    recording_url: c.recordingUrl ?? c.stereoRecordingUrl ?? null,
    ended_reason: c.endedReason ?? null,
    outcome: deriveOutcome(c.endedReason),
    created_at: started ?? new Date().toISOString(),
  }
}

export async function GET(request: Request) {
  const auth = verifyCron(request)
  if (auth) return auth

  const apiKey = process.env.VAPI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ status: 'error', detail: 'VAPI_API_KEY not set' }, { status: 500 })
  }

  const supabase = createAdminClient()
  const cutoff = Date.now() - LOOKBACK_MS

  // Each task: pull a set of Vapi calls and attribute them to one business.
  const tasks: { businessId: string; calls: VapiCallFull[] }[] = []

  // 1. Live customer agents — match by the business's own Vapi assistant id.
  const { data: businesses, error: bizErr } = await supabase
    .from('businesses')
    .select('id, vapi_agent_id, is_demo, account_status')
    .not('vapi_agent_id', 'is', null)
    .in('account_status', ['active', 'trial'])

  if (bizErr) {
    return NextResponse.json({ status: 'error', detail: bizErr.message }, { status: 500 })
  }

  for (const b of businesses ?? []) {
    if (b.is_demo) continue
    const agentId = (b.vapi_agent_id as string | null)?.trim()
    if (!agentId) continue
    const calls = await fetchVapiCalls(`assistantId=${agentId}`, apiKey)
    tasks.push({ businessId: b.id as string, calls })
  }

  // 2. Demo business — phone calls arrive on the demo number under whichever
  // template the launcher last loaded (so match by phoneNumberId, not assistant),
  // and Talk-button web calls arrive under the website demo assistant.
  const demoPhoneId = process.env.VAPI_DEMO_PHONE_NUMBER_ID
  const demoCalls: VapiCallFull[] = []
  if (demoPhoneId) demoCalls.push(...(await fetchVapiCalls(`phoneNumberId=${demoPhoneId}`, apiKey)))
  demoCalls.push(...(await fetchVapiCalls(`assistantId=${WEBSITE_DEMO_ASSISTANT_ID}`, apiKey)))
  const seen = new Set<string>()
  const demoUnique = demoCalls.filter((c) => c.id && !seen.has(c.id) && (seen.add(c.id), true))
  tasks.push({ businessId: DEMO_BUSINESS_ID, calls: demoUnique })

  // Upsert missing calls per task. Idempotent: existing vapi_call_ids are skipped.
  let inserted = 0
  const perBusiness: Record<string, number> = {}
  const newCallIds: string[] = []
  for (const t of tasks) {
    const rows = t.calls
      .filter((c) => !!c.id && c.status === 'ended')
      .filter((c) => {
        const ts = Date.parse(c.startedAt ?? c.createdAt ?? '')
        return Number.isFinite(ts) && ts > cutoff
      })
      .map((c) => toCallRow(c, t.businessId))
    if (!rows.length) continue

    const { data, error } = await supabase
      .from('calls')
      .upsert(rows, { onConflict: 'vapi_call_id', ignoreDuplicates: true })
      .select('id')
    if (error) {
      console.error('[vapi-call-sync] upsert failed', { businessId: t.businessId, error: error.message })
      continue
    }
    const n = data?.length ?? 0
    if (n > 0) {
      inserted += n
      perBusiness[t.businessId] = n
      for (const r of data ?? []) if (r?.id) newCallIds.push(r.id as string)
    }
  }

  // Run post-call side-effects (owner alert SMS + missed-call win-back) for the
  // calls we just ingested. This is the live replacement for the dead push
  // webhook: runCallSideEffects claims `side_effects_at` so nothing double-fires,
  // and it internally skips demo / non-active accounts. Only newly-inserted ids
  // are processed (ignoreDuplicates means `data` excludes pre-existing rows), so
  // a call is never re-processed on a later cron cycle.
  let sideEffectsRun = 0
  if (newCallIds.length) {
    await Promise.allSettled(newCallIds.map((id) => runCallSideEffects(supabase, id)))
    sideEffectsRun = newCallIds.length
  }

  return NextResponse.json({ status: 'ok', agentsChecked: tasks.length, inserted, sideEffectsRun, perBusiness })
}
