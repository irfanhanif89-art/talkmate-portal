// Session 4A (Round 1) — admin-portal parity helpers for the onboarding /
// go-live surface. Pure functions so the admin client list, onboarding queue
// and client detail can all share the exact same readiness maths and
// integration-mode labels without duplicating logic or N+1 fetching.

import type { createAdminClient } from '@/lib/supabase/server'

type AdminClient = ReturnType<typeof createAdminClient>

// The 5 booleans that make up the client-facing go-live gate, as stored in
// the go_live_checklist table (one row per business_id).
export interface GoLiveChecklistRow {
  business_id: string
  agent_named: boolean | null
  mode_selected: boolean | null
  kb_entries_added: boolean | null
  vip_callers_reviewed: boolean | null
  announcement_sent: boolean | null
}

const CHECKLIST_FLAGS = [
  'agent_named', 'mode_selected', 'kb_entries_added',
  'vip_callers_reviewed', 'announcement_sent',
] as const

export interface ReadinessSummary {
  // null when no go_live_checklist row exists yet ("Not started").
  completionPercent: number | null
  passedCount: number
  totalCount: number
}

// Completion percent for a single checklist row. Returns a "Not started"
// summary (null percent) when the row is missing.
export function readinessFromRow(row: GoLiveChecklistRow | null | undefined): ReadinessSummary {
  const total = CHECKLIST_FLAGS.length
  if (!row) return { completionPercent: null, passedCount: 0, totalCount: total }
  const passed = CHECKLIST_FLAGS.reduce((n, f) => n + (row[f] ? 1 : 0), 0)
  return { completionPercent: Math.round((passed / total) * 100), passedCount: passed, totalCount: total }
}

// Batch-load go_live_checklist rows for a set of business ids and index them
// by business_id. A single query — used by the admin client list and the
// onboarding queue so neither page does per-row fetches.
export async function fetchReadinessByBusiness(
  supabase: AdminClient,
  businessIds: string[],
): Promise<Record<string, ReadinessSummary>> {
  const out: Record<string, ReadinessSummary> = {}
  const ids = Array.from(new Set(businessIds.filter(Boolean)))
  if (ids.length === 0) return out
  const { data } = await supabase
    .from('go_live_checklist')
    .select('business_id, agent_named, mode_selected, kb_entries_added, vip_callers_reviewed, announcement_sent')
    .in('business_id', ids)
  for (const r of (data ?? []) as GoLiveChecklistRow[]) {
    out[r.business_id] = readinessFromRow(r)
  }
  return out
}

// ── Integration mode chip ────────────────────────────────────────────────
// businesses.integration_mode is 'overflow' | 'after_hours' | 'full_time' | null.

export type IntegrationMode = 'overflow' | 'after_hours' | 'full_time'

export interface IntegrationModeChip {
  label: string
  color: string
  muted: boolean
}

const INTEGRATION_MODE_LABELS: Record<IntegrationMode, string> = {
  overflow: 'Overflow',
  after_hours: 'After hours',
  full_time: 'Full time',
}

// Maps the stored integration_mode value to a display chip. Unknown / null
// modes render as a muted "Not set".
export function integrationModeChip(mode: string | null | undefined): IntegrationModeChip {
  if (mode && mode in INTEGRATION_MODE_LABELS) {
    const colorMap: Record<IntegrationMode, string> = {
      overflow: '#4A9FE8',
      after_hours: '#F59E0B',
      full_time: '#22C55E',
    }
    const key = mode as IntegrationMode
    return { label: INTEGRATION_MODE_LABELS[key], color: colorMap[key], muted: false }
  }
  return { label: 'Not set', color: '#7BAED4', muted: true }
}
