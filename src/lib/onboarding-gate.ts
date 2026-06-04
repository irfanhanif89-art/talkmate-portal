// Session 4A (Round 1) — client onboarding go-live gate.
//
// This is the lightweight CLIENT-FACING onboarding gate (5 step-completions),
// stored in the new `go_live_checklist` table. It is intentionally SEPARATE
// from the heavyweight admin operational readiness module in
// `golive-checks.ts` (Session 20, `client_golive_checklist`, 28 checks with
// live Vapi calls). Different concern, different table — they coexist.
//
// It must never gate the Stripe/Payment step; it only governs the final
// "Go Live" action.

import type { createAdminClient } from '@/lib/supabase/server'

export const MIN_KB_ENTRIES = 5

export type GateItemKey =
  | 'agentNamed' | 'modeSelected' | 'kbEntriesAdded' | 'vipReviewed' | 'announcementSent'

export interface GateItem {
  passed: boolean
  label: string
  action: string
  count?: number
  required?: number
}

export interface GoLiveStatus {
  ready: boolean
  completionPercent: number
  checklist: Record<GateItemKey, GateItem>
}

type AdminClient = ReturnType<typeof createAdminClient>

interface ChecklistRow {
  agent_named: boolean | null
  mode_selected: boolean | null
  kb_entries_added: boolean | null
  vip_callers_reviewed: boolean | null
  announcement_sent: boolean | null
}

// Recomputes the KB-count-derived flag and returns the full status. Also
// upserts kb_entries_added so the stored row stays accurate.
export async function getGoLiveStatus(
  supabase: AdminClient,
  businessId: string,
): Promise<GoLiveStatus> {
  // Ensure a checklist row exists.
  await supabase.from('go_live_checklist').upsert(
    { business_id: businessId },
    { onConflict: 'business_id', ignoreDuplicates: true },
  )

  const [{ data: rowData }, kbCountRes, bizRes] = await Promise.all([
    supabase.from('go_live_checklist').select('agent_named, mode_selected, kb_entries_added, vip_callers_reviewed, announcement_sent').eq('business_id', businessId).maybeSingle(),
    supabase.from('knowledge_base_entries').select('id', { count: 'exact', head: true }).eq('business_id', businessId).eq('is_active', true),
    supabase.from('businesses').select('agent_name, integration_mode').eq('id', businessId).maybeSingle(),
  ])

  const row = (rowData as ChecklistRow | null) ?? {
    agent_named: false, mode_selected: false, kb_entries_added: false,
    vip_callers_reviewed: false, announcement_sent: false,
  }
  const kbCount = kbCountRes.count ?? 0
  const biz = (bizRes.data as { agent_name: string | null; integration_mode: string | null } | null) ?? null

  // Derived truths (don't trust stale flags for these two).
  const kbPassed = kbCount >= MIN_KB_ENTRIES
  const agentNamed = (row.agent_named ?? false) || (!!biz?.agent_name && biz.agent_name !== 'TalkMate')
  const modeSelected = (row.mode_selected ?? false) || !!biz?.integration_mode

  // Keep the derived kb flag in sync.
  if ((row.kb_entries_added ?? false) !== kbPassed) {
    await supabase.from('go_live_checklist')
      .update({ kb_entries_added: kbPassed, updated_at: new Date().toISOString() })
      .eq('business_id', businessId)
  }

  const checklist: Record<GateItemKey, GateItem> = {
    agentNamed: { passed: agentNamed, label: 'Name your assistant', action: '/onboarding?step=identity' },
    modeSelected: { passed: modeSelected, label: 'Choose how TalkMate answers', action: '/onboarding?step=integration' },
    kbEntriesAdded: { passed: kbPassed, count: kbCount, required: MIN_KB_ENTRIES, label: 'Add knowledge base entries', action: '/train' },
    vipReviewed: { passed: row.vip_callers_reviewed ?? false, label: 'Review your VIP callers', action: '/vip-callers' },
    announcementSent: { passed: row.announcement_sent ?? false, label: 'Notify your customers', action: '/onboarding/announcement' },
  }

  const items = Object.values(checklist)
  const passedCount = items.filter(i => i.passed).length
  const completionPercent = Math.round((passedCount / items.length) * 100)
  const ready = passedCount === items.length

  // Stamp passed_at / go_live_gate_passed once everything is green.
  if (ready) {
    await Promise.all([
      supabase.from('go_live_checklist').update({ passed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('business_id', businessId).is('passed_at', null),
      supabase.from('businesses').update({ go_live_gate_passed: true }).eq('id', businessId),
    ])
  }

  return { ready, completionPercent, checklist }
}

// Helper to flip a single stored flag (used by event handlers: VIP visit,
// announcement send, etc.).
export async function markGateItem(
  supabase: AdminClient,
  businessId: string,
  patch: Partial<Record<'agent_named' | 'mode_selected' | 'kb_entries_added' | 'vip_callers_reviewed' | 'announcement_sent', boolean>>,
): Promise<void> {
  await supabase.from('go_live_checklist').upsert(
    { business_id: businessId, ...patch, updated_at: new Date().toISOString() },
    { onConflict: 'business_id' },
  )
}
