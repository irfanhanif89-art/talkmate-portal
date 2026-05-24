import { NextResponse } from 'next/server'
import { verifyCron } from '@/lib/cron-auth'
import { createAdminClient } from '@/lib/supabase/server'
import {
  validateAgentConfig,
  statusFromIssues,
  type HealthStatus,
} from '@/lib/agent-config-validator'
import type { AgentIssue } from '@/lib/agent-config-standard'
import { scanTranscript, TRANSCRIPT_PATTERN_LABELS } from '@/lib/transcript-scanner'
import { sendAgentHealthAlert } from '@/lib/notifications'

// Session 24 — Agent health check cron.
// Runs every 30 minutes (see vercel.json). Three responsibilities:
//   1. Fetch every live agent's Vapi config and validate it against
//      AGENT_CONFIG_STANDARD. Snapshot + raise alerts on changes.
//   2. Sweep any calls received in the last 60 minutes that have a
//      transcript but no scan yet, and run the transcript scanner.
//   3. Detect webhook gaps — businesses that had prior calls but
//      nothing in the last 24 hours during business hours.
//
// Auth: CRON_SECRET via Authorization header (verifyCron handles it).
//
// Failure mode: each business is tried independently. One business's
// 5xx from Vapi doesn't stop the others. Every catch block logs and
// continues. The endpoint returns a summary so the cron dashboard
// makes the run visible.

const VAPI_BASE = 'https://api.vapi.ai/assistant'
const AEST_OFFSET_MS = 10 * 60 * 60 * 1000
const DEDUPE_HOURS = 2
const WEBHOOK_GAP_HOURS = 24

interface BusinessRow {
  id: string
  name: string | null
  vapi_agent_id: string | null
  owner_user_id: string | null
}

interface RunSummary {
  businesses_checked: number
  config_issues_found: number
  alerts_created: number
  telegrams_sent: number
  transcripts_scanned: number
  transcript_violations_found: number
  webhook_gaps_detected: number
  errors: string[]
}

export async function GET(req: Request) {
  const auth = verifyCron(req)
  if (auth) return auth

  const apiKey = process.env.VAPI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: 'VAPI_API_KEY not configured' }, { status: 500 })
  }

  const supabase = createAdminClient()
  const summary: RunSummary = {
    businesses_checked: 0,
    config_issues_found: 0,
    alerts_created: 0,
    telegrams_sent: 0,
    transcripts_scanned: 0,
    transcript_violations_found: 0,
    webhook_gaps_detected: 0,
    errors: [],
  }

  // ── 1. config validation ─────────────────────────────────────────
  const { data: bizRows, error: bizErr } = await supabase
    .from('businesses')
    .select('id, name, vapi_agent_id, owner_user_id')
    .not('vapi_agent_id', 'is', null)
    .not('account_status', 'in', '(cancelled,expired)')

  if (bizErr) {
    return NextResponse.json({ ok: false, error: bizErr.message }, { status: 500 })
  }

  const businesses = (bizRows ?? []) as BusinessRow[]
  for (const biz of businesses) {
    if (!biz.vapi_agent_id) continue
    summary.businesses_checked += 1
    try {
      const res = await fetch(`${VAPI_BASE}/${biz.vapi_agent_id}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${apiKey}` },
      })

      if (!res.ok) {
        summary.errors.push(`${biz.name ?? biz.id}: Vapi GET ${res.status}`)
        await supabase.from('businesses')
          .update({
            last_health_check_at: new Date().toISOString(),
            health_status: 'unknown',
          })
          .eq('id', biz.id)
        continue
      }

      const assistant = await res.json() as Record<string, unknown>
      const issues = validateAgentConfig(assistant)
      const status: HealthStatus = statusFromIssues(issues)

      summary.config_issues_found += issues.length

      // Snapshot — store every run. Trims at 90 days via Supabase
      // retention if needed but the volume is tiny (≤ 2 rows/agent/hour).
      await supabase.from('agent_config_snapshots').insert({
        business_id: biz.id,
        vapi_assistant_id: biz.vapi_agent_id,
        config_json: assistant,
        health_status: status,
        health_issues: issues,
      })

      await supabase.from('businesses')
        .update({
          last_health_check_at: new Date().toISOString(),
          health_status: status,
          health_issues_count: issues.length,
        })
        .eq('id', biz.id)

      // Auto-resolve open config_issue alerts whose issue_code is no
      // longer detected. Without this, the 2-hour dedup window expires
      // and the next run re-creates an identical alert row, producing
      // duplicates indefinitely until an admin clicks Mark Resolved.
      // Gated on alert_type = 'config_issue' so webhook_gap and
      // transcript_violation alerts (different lifecycle) are untouched.
      // Safe vs. transient Vapi failures: the outer loop `continue`s on
      // a non-OK GET above, so we only reach here when validation ran.
      const currentIssueCodes = new Set(issues.map(i => i.code))
      const { data: openAlerts } = await supabase
        .from('agent_health_alerts')
        .select('id, issue_code')
        .eq('business_id', biz.id)
        .eq('alert_type', 'config_issue')
        .is('resolved_at', null)

      const toResolve = (openAlerts ?? []).filter(
        a => a.issue_code && !currentIssueCodes.has(a.issue_code)
      )

      if (toResolve.length > 0) {
        await supabase
          .from('agent_health_alerts')
          .update({
            resolved_at: new Date().toISOString(),
            resolved_by: 'auto:config_issue_no_longer_detected',
          })
          .in('id', toResolve.map(a => a.id))
      }

      // Raise / dedupe alerts per issue code.
      for (const issue of issues) {
        const created = await maybeCreateConfigAlert(supabase, biz, issue)
        if (created) {
          summary.alerts_created += 1
          if (issue.severity === 'critical') {
            const sent = await sendCriticalConfigTelegram(biz, issue)
            if (sent) summary.telegrams_sent += 1
            if (sent && created) {
              await supabase.from('agent_health_alerts')
                .update({ telegram_sent: true, telegram_sent_at: new Date().toISOString() })
                .eq('id', created)
            }
          }
        }
      }
    } catch (e) {
      const msg = (e as Error).message
      summary.errors.push(`${biz.name ?? biz.id}: ${msg}`)
      console.error('[agent-health-check]', biz.id, msg)
    }
  }

  // ── 2. transcript scan ───────────────────────────────────────────
  // Pull calls from the last 60 minutes that have a transcript but
  // haven't been scanned yet. The score-call-async hot path also
  // scans, but this is the safety net for calls scored before the
  // scanner shipped or calls that bypassed the scoring path.
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { data: unscannedCalls } = await supabase
    .from('calls')
    .select('id, business_id, transcript, ended_at, created_at')
    .eq('scanned_for_patterns', false)
    .gte('created_at', oneHourAgo)
    .not('transcript', 'is', null)

  for (const call of (unscannedCalls ?? []) as Array<{ id: string; business_id: string; transcript: string | null; ended_at: string | null; created_at: string }>) {
    const transcript = (call.transcript ?? '').trim()
    if (!transcript) {
      await supabase.from('calls').update({ scanned_for_patterns: true }).eq('id', call.id)
      continue
    }
    try {
      const violations = scanTranscript(transcript, call.id, call.business_id)
      summary.transcripts_scanned += 1
      summary.transcript_violations_found += violations.length

      if (violations.length > 0) {
        await supabase.from('transcript_violations').insert(violations.map(v => ({
          call_id: v.call_id,
          business_id: v.business_id,
          pattern_code: v.pattern_code,
          severity: v.severity,
          pattern_match: v.pattern_match,
          context_snippet: v.context_snippet,
        })))

        const critical = violations.filter(v => v.severity === 'critical')
        if (critical.length > 0) {
          const bizName = businesses.find(b => b.id === call.business_id)?.name ?? 'TalkMate client'
          for (const v of critical) {
            await sendAgentHealthAlert({
              kind: 'transcript_violation',
              businessName: bizName,
              businessId: call.business_id,
              vapiAssistantId: null,
              title: TRANSCRIPT_PATTERN_LABELS[v.pattern_code] ?? v.pattern_code,
              detail: `Pattern: ${v.pattern_code}\nFound: "${v.pattern_match}"`,
              contextSnippet: v.context_snippet,
              callTimestamp: call.ended_at ?? call.created_at,
            })
            summary.telegrams_sent += 1
          }
        }
      }

      await supabase.from('calls')
        .update({
          scanned_for_patterns: true,
          pattern_violations_count: violations.length,
        })
        .eq('id', call.id)
    } catch (e) {
      console.error('[agent-health-check] transcript scan failed', call.id, (e as Error).message)
    }
  }

  // ── 3. webhook gap detection ─────────────────────────────────────
  // Only fire during AEST business hours (8am–8pm) to avoid spamming
  // overnight. Once-per-day dedupe so we don't ping every 30 minutes.
  if (isBusinessHoursAest()) {
    const cutoff = new Date(Date.now() - WEBHOOK_GAP_HOURS * 60 * 60 * 1000).toISOString()
    for (const biz of businesses) {
      try {
        const { count: recent } = await supabase
          .from('calls')
          .select('id', { count: 'exact', head: true })
          .eq('business_id', biz.id)
          .gte('created_at', cutoff)
        if ((recent ?? 0) > 0) continue

        const { count: anyEver } = await supabase
          .from('calls')
          .select('id', { count: 'exact', head: true })
          .eq('business_id', biz.id)
        if ((anyEver ?? 0) === 0) continue // brand-new client, no gap to detect

        // 24h dedupe on webhook_gap alerts for this business.
        const recentAlertCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
        const { data: existing } = await supabase
          .from('agent_health_alerts')
          .select('id')
          .eq('business_id', biz.id)
          .eq('alert_type', 'webhook_gap')
          .gte('created_at', recentAlertCutoff)
          .limit(1)
        if (existing && existing.length > 0) continue

        const { data: lastCall } = await supabase
          .from('calls')
          .select('created_at')
          .eq('business_id', biz.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        const lastCallText = lastCall?.created_at
          ? new Date(lastCall.created_at as string).toISOString()
          : 'never'

        const { data: insertedAlert } = await supabase
          .from('agent_health_alerts')
          .insert({
            business_id: biz.id,
            vapi_assistant_id: biz.vapi_agent_id ?? '',
            alert_type: 'webhook_gap',
            severity: 'warning',
            title: 'No calls received in last 24 hours',
            detail: `Last call: ${lastCallText}. Check: phone number forward may be broken.`,
            issue_code: 'webhook_gap',
          })
          .select('id')
          .single()

        summary.webhook_gaps_detected += 1

        await sendAgentHealthAlert({
          kind: 'webhook_gap',
          businessName: biz.name ?? 'TalkMate client',
          businessId: biz.id,
          vapiAssistantId: biz.vapi_agent_id ?? null,
          title: 'No calls received in last 24 hours',
          detail: `Last call: ${lastCallText}\nCheck: phone number forward may be broken`,
        })

        if (insertedAlert?.id) {
          await supabase.from('agent_health_alerts')
            .update({ telegram_sent: true, telegram_sent_at: new Date().toISOString() })
            .eq('id', insertedAlert.id)
        }
        summary.telegrams_sent += 1
      } catch (e) {
        console.error('[agent-health-check] webhook gap check failed', biz.id, (e as Error).message)
      }
    }
  }

  return NextResponse.json({ ok: true, summary })
}

// Create a config_issue alert only if there isn't already an unresolved
// one for the same business + issue code in the last DEDUPE_HOURS.
// Returns the new alert id, or null if deduped.
async function maybeCreateConfigAlert(
  supabase: ReturnType<typeof createAdminClient>,
  biz: BusinessRow,
  issue: AgentIssue,
): Promise<string | null> {
  const cutoff = new Date(Date.now() - DEDUPE_HOURS * 60 * 60 * 1000).toISOString()
  const { data: existing } = await supabase
    .from('agent_health_alerts')
    .select('id')
    .eq('business_id', biz.id)
    .eq('issue_code', issue.code)
    .is('resolved_at', null)
    .gte('created_at', cutoff)
    .limit(1)
  if (existing && existing.length > 0) return null

  const { data: inserted, error } = await supabase
    .from('agent_health_alerts')
    .insert({
      business_id: biz.id,
      vapi_assistant_id: biz.vapi_agent_id ?? '',
      alert_type: 'config_issue',
      severity: issue.severity,
      title: issue.message,
      detail: `Field: ${issue.field}\nExpected: ${stringify(issue.expected)}\nActual: ${stringify(issue.actual)}`,
      issue_code: issue.code,
    })
    .select('id')
    .single()

  if (error) {
    console.error('[agent-health-check] alert insert failed', biz.id, issue.code, error.message)
    return null
  }
  return inserted?.id ?? null
}

async function sendCriticalConfigTelegram(biz: BusinessRow, issue: AgentIssue): Promise<boolean> {
  try {
    await sendAgentHealthAlert({
      kind: 'config_issue',
      businessName: biz.name ?? 'TalkMate client',
      businessId: biz.id,
      vapiAssistantId: biz.vapi_agent_id ?? null,
      title: issue.message,
      detail: '',
      field: issue.field,
      expected: issue.expected,
      actual: issue.actual,
    })
    return true
  } catch (e) {
    console.error('[agent-health-check] telegram send failed', biz.id, (e as Error).message)
    return false
  }
}

function stringify(value: unknown): string {
  if (value === null || value === undefined) return String(value)
  if (typeof value === 'string') return value
  try { return JSON.stringify(value) } catch { return String(value) }
}

// 8am - 8pm AEST (Brisbane, no DST).
function isBusinessHoursAest(): boolean {
  const nowAest = new Date(Date.now() + AEST_OFFSET_MS)
  const hour = nowAest.getUTCHours()
  return hour >= 8 && hour < 20
}
