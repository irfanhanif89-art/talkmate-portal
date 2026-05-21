import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin-auth'
import AgentHealthView from './agent-health-view'

// Session 24 — Agent Health Monitor.
// Admin-only dashboard. Server page fetches every active agent's
// latest config snapshot, recent transcript violations, and the open
// alert queue. The view component handles filtering and per-row
// resolve actions.
//
// Re-uses requireAdmin (super-admin email or users.role = 'admin')
// for auth gating — same pattern as /admin/clients/:id/golive.

export const dynamic = 'force-dynamic'

interface BusinessRow {
  id: string
  name: string | null
  vapi_agent_id: string | null
  health_status: string | null
  health_issues_count: number | null
  last_health_check_at: string | null
}

interface SnapshotRow {
  id: string
  business_id: string
  vapi_assistant_id: string
  snapshot_at: string
  health_status: string
  health_issues: unknown
}

interface AlertRow {
  id: string
  business_id: string
  vapi_assistant_id: string
  alert_type: string
  severity: string
  title: string
  detail: string
  issue_code: string | null
  call_id: string | null
  resolved_at: string | null
  resolved_by: string | null
  telegram_sent: boolean
  created_at: string
}

interface ViolationRow {
  id: string
  call_id: string
  business_id: string
  pattern_code: string
  severity: string
  pattern_match: string
  context_snippet: string | null
  created_at: string
}

export default async function AgentHealthPage() {
  const auth = await requireAdmin()
  if (!auth.ok) redirect('/login')

  const admin = createAdminClient()

  // 1. All active businesses with a Vapi agent. We render one card
  //    per business so the operator gets a top-down view.
  const { data: businessesData } = await admin
    .from('businesses')
    .select('id, name, vapi_agent_id, health_status, health_issues_count, last_health_check_at')
    .not('vapi_agent_id', 'is', null)
    .not('account_status', 'in', '(cancelled,expired)')
    .order('name', { ascending: true })

  const businesses = (businessesData ?? []) as BusinessRow[]

  // 2. Latest snapshot per business — used to populate the expanded
  //    issue list under each card. Limit 1 per biz via a window in
  //    the application layer (Postgres doesn't have DISTINCT ON in
  //    PostgREST without a view).
  const { data: snapshotsData } = await admin
    .from('agent_config_snapshots')
    .select('id, business_id, vapi_assistant_id, snapshot_at, health_status, health_issues')
    .in('business_id', businesses.map(b => b.id).length > 0 ? businesses.map(b => b.id) : ['00000000-0000-0000-0000-000000000000'])
    .order('snapshot_at', { ascending: false })
    .limit(500)

  const latestSnapshot = new Map<string, SnapshotRow>()
  for (const s of (snapshotsData ?? []) as SnapshotRow[]) {
    if (!latestSnapshot.has(s.business_id)) latestSnapshot.set(s.business_id, s)
  }

  // 3. Recent transcript violations — 7-day window, capped at 50.
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const { data: violationsData } = await admin
    .from('transcript_violations')
    .select('id, call_id, business_id, pattern_code, severity, pattern_match, context_snippet, created_at')
    .gte('created_at', sevenDaysAgo)
    .order('created_at', { ascending: false })
    .limit(50)

  // 4. Open alerts (unresolved). Cap at 100 — anything beyond that and
  //    the operator should triage in bulk anyway.
  const { data: alertsData } = await admin
    .from('agent_health_alerts')
    .select('id, business_id, vapi_assistant_id, alert_type, severity, title, detail, issue_code, call_id, resolved_at, resolved_by, telegram_sent, created_at')
    .order('created_at', { ascending: false })
    .limit(100)

  const bizNameById = new Map<string, string>()
  for (const b of businesses) bizNameById.set(b.id, b.name ?? 'Unknown')

  const lastChecked = businesses
    .map(b => b.last_health_check_at)
    .filter((s): s is string => Boolean(s))
    .sort()
    .pop() ?? null

  return (
    <AgentHealthView
      businesses={businesses}
      latestSnapshot={Array.from(latestSnapshot.values())}
      violations={(violationsData ?? []) as ViolationRow[]}
      alerts={(alertsData ?? []) as AlertRow[]}
      bizNameById={Object.fromEntries(bizNameById)}
      lastChecked={lastChecked}
    />
  )
}
