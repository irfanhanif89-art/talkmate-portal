// Call-ingestion watchdog — 2026-06 incident follow-up.
//
// The existing health crons only check whether Vapi's API is UP
// (vapi-health pings /health, health-monitor pings /assistant). They are
// blind to the failure that took 9 days to notice: Vapi was up and taking
// real calls, but end-of-call-report webhooks were not reaching our
// `calls` table (assistant serverUrl/secret had drifted). Every call was
// silently lost.
//
// This watcher closes that gap by comparing, per live agent, the newest
// call Vapi has against the newest call we have ingested. If Vapi has a
// recent call that never landed in our DB, ingestion is broken.
//
// Three states per run:
//   - lag detected + not recently alerted -> Telegram + system_alerts row
//   - lag detected + already alerted (<12h) -> no-op ('already_fired')
//   - no lag -> resolve any open alert, return 'healthy'
//
// Schedule: every 30 min at an off-minute (see vercel.json).

import { NextResponse } from 'next/server'
import { verifyCron } from '@/lib/cron-auth'
import { createAdminClient } from '@/lib/supabase/server'
import { sendAdminTelegram } from '@/lib/notifications'

const ALERT_TYPE = 'call_ingestion_lag'

// Vapi has a call this recent...
const VAPI_RECENT_WINDOW_MS = 6 * 60 * 60 * 1000      // 6h
// ...but our newest ingested call for that agent is older than the Vapi
// call by more than this grace period -> ingestion is lagging. The grace
// absorbs normal webhook delay + a single missed report.
const INGEST_GRACE_MS = 90 * 60 * 1000                // 90 min
// Don't re-alert more than once per this window.
const REALERT_WINDOW_MS = 12 * 60 * 60 * 1000         // 12h

interface VapiCallLite { id?: string; createdAt?: string }

async function newestVapiCall(assistantId: string, apiKey: string): Promise<Date | null> {
  try {
    const res = await fetch(
      `https://api.vapi.ai/call?assistantId=${assistantId}&limit=1`,
      { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(8000) },
    )
    if (!res.ok) return null
    const rows = (await res.json()) as VapiCallLite[]
    const ts = Array.isArray(rows) && rows[0]?.createdAt ? Date.parse(rows[0].createdAt) : NaN
    return Number.isFinite(ts) ? new Date(ts) : null
  } catch {
    return null
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
  const now = Date.now()

  // Live agents only: active, non-demo, with a Vapi agent configured.
  const { data: businesses, error: bizErr } = await supabase
    .from('businesses')
    .select('id, name, vapi_agent_id, is_demo, account_status')
    .not('vapi_agent_id', 'is', null)
    .eq('account_status', 'active')

  if (bizErr) {
    return NextResponse.json({ status: 'error', detail: bizErr.message }, { status: 500 })
  }

  const lagging: { name: string; agent: string; vapiNewest: string; dbNewest: string | null }[] = []

  for (const b of businesses ?? []) {
    if (b.is_demo) continue
    const agentId = (b.vapi_agent_id as string | null)?.trim()
    if (!agentId) continue

    const vapiNewest = await newestVapiCall(agentId, apiKey)
    if (!vapiNewest) continue                                   // no Vapi calls to compare
    if (now - vapiNewest.getTime() > VAPI_RECENT_WINDOW_MS) continue  // nothing recent on Vapi

    const { data: dbRow } = await supabase
      .from('calls')
      .select('created_at')
      .eq('business_id', b.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const dbNewest = dbRow?.created_at ? Date.parse(dbRow.created_at as string) : null

    const lag = dbNewest === null || (vapiNewest.getTime() - dbNewest) > INGEST_GRACE_MS
    if (lag) {
      lagging.push({
        name: (b.name as string | null) ?? b.id,
        agent: agentId,
        vapiNewest: vapiNewest.toISOString(),
        dbNewest: dbNewest ? new Date(dbNewest).toISOString() : null,
      })
    }
  }

  // ── Healthy: resolve any open alert and exit.
  if (lagging.length === 0) {
    await supabase
      .from('system_alerts')
      .update({ resolved: true, resolved_at: new Date().toISOString() })
      .eq('type', ALERT_TYPE)
      .eq('resolved', false)
    return NextResponse.json({ status: 'healthy', checked: (businesses ?? []).length })
  }

  // ── Lag detected: dedup against a recent unresolved alert.
  const { data: recentAlert } = await supabase
    .from('system_alerts')
    .select('id, sent_at')
    .eq('type', ALERT_TYPE)
    .eq('resolved', false)
    .order('sent_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const recentlyAlerted = recentAlert?.sent_at
    && (now - Date.parse(recentAlert.sent_at as string)) < REALERT_WINDOW_MS
  if (recentlyAlerted) {
    return NextResponse.json({ status: 'already_fired', lagging })
  }

  const lines = [
    '🚨 TalkMate call ingestion looks BROKEN',
    '',
    'These live agents have recent calls on Vapi that never reached the portal:',
    '',
    ...lagging.map(l =>
      `• ${l.name}: Vapi newest ${l.vapiNewest}, portal newest ${l.dbNewest ?? 'never'}`),
    '',
    'Likely cause: assistant serverUrl/serverUrlSecret drift (end-of-call-report not reaching /api/webhooks/vapi).',
    'Fix: run the agent Sync for each affected client, or check VAPI_WEBHOOK_SECRET.',
  ].join('\n')

  await sendAdminTelegram(message_safe(lines))

  await supabase.from('system_alerts').insert({
    type: ALERT_TYPE,
    severity: 'critical',
    message: `Call ingestion lag on ${lagging.length} live agent(s): ${lagging.map(l => l.name).join(', ')}`,
    resolved: false,
    sent_at: new Date().toISOString(),
    metadata: { lagging },
  })

  return NextResponse.json({ status: 'fired', lagging })
}

// Telegram has a 4096-char limit; keep the message comfortably under it.
function message_safe(s: string): string {
  return s.length > 3500 ? s.slice(0, 3500) + '\n…(truncated)' : s
}
