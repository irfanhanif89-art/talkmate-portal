// Default smart lists per the Session 1 brief Part 4. We seed a set of system
// lists for every client at industry-selection time. Filter rules are stored
// as JSON on the smart_lists row and executed at query time by the
// /contacts list page (rules → Supabase query builder).

import type { SupabaseClient } from '@supabase/supabase-js'

export type IndustrySlug =
  | 'restaurants' | 'towing' | 'real_estate' | 'trades'
  | 'healthcare' | 'ndis' | 'retail' | 'professional_services' | 'other'

export interface SmartListSeed {
  name: string
  description: string
  filter_rules: Record<string, unknown>
  icon?: string
  color?: string
  industry?: IndustrySlug
}

// Universal lists — seeded for every client regardless of industry.
const UNIVERSAL: SmartListSeed[] = [
  { name: 'All Contacts', description: 'Every contact captured by TalkMate.', filter_rules: { all: true }, icon: 'users', color: '#1565C0' },
  { name: 'New This Week', description: 'Contacts first seen in the last 7 days.', filter_rules: { first_seen_within_days: 7 }, icon: 'sparkles', color: '#22C55E' },
  { name: 'Repeat Callers', description: 'Contacts with 3 or more calls.', filter_rules: { call_count_min: 3 }, icon: 'repeat', color: '#8B5CF6' },
  { name: 'Needs Follow-up', description: 'Callers who requested a callback in the last 14 days.', filter_rules: { has_outcome: 'callback_requested', outcome_within_days: 14 }, icon: 'phone', color: '#F59E0B' },
  { name: 'Complaints', description: 'Contacts tagged as a complaint in the last 30 days.', filter_rules: { has_tag: 'complaint', tag_within_days: 30 }, icon: 'alert-triangle', color: '#EF4444' },
]

const INDUSTRY: Record<IndustrySlug, SmartListSeed[]> = {
  restaurants: [
    { name: 'Regulars', description: '5+ calls in the last 60 days.', filter_rules: { call_count_min: 5, last_seen_within_days: 60 }, icon: 'star', color: '#E8622A' },
    { name: 'Lapsed Regulars', description: 'Was a regular, no call in 21+ days.', filter_rules: { call_count_min: 5, last_seen_after_days: 21 }, icon: 'clock', color: '#9CA3AF' },
  ],
  real_estate: [
    { name: 'New Enquiries', description: 'First seen this week, looking to buy or rent.', filter_rules: { first_seen_within_days: 7, industry_data: { enquiry_type: ['buy', 'rent'] } }, icon: 'sparkles', color: '#22C55E' },
    { name: 'Hot Leads', description: 'Pre-approved buyers.', filter_rules: { industry_data: { pre_approved: true } }, icon: 'flame', color: '#E8622A' },
    { name: 'Stale Leads', description: 'In pipeline but no contact in 14+ days.', filter_rules: { in_pipeline: true, last_seen_after_days: 14 }, icon: 'clock', color: '#9CA3AF' },
  ],
  trades: [
    { name: 'Quote Requested', description: 'Callbacks or pricing enquiries.', filter_rules: { has_outcome: ['callback_requested', 'enquiry_answered'], has_tag: 'price_enquiry' }, icon: 'file-text', color: '#1565C0' },
    { name: 'Recurring Clients', description: 'Contacts with 3+ calls.', filter_rules: { call_count_min: 3 }, icon: 'repeat', color: '#22C55E' },
  ],
  towing: [
    { name: 'Repeat Customers', description: 'Has called more than once.', filter_rules: { call_count_min: 2 }, icon: 'repeat', color: '#22C55E' },
  ],
  healthcare: [
    { name: 'New Patients', description: 'First seen in the last 14 days.', filter_rules: { first_seen_within_days: 14 }, icon: 'sparkles', color: '#22C55E' },
  ],
  ndis: [
    { name: 'Active Participants', description: '3+ calls in the last 60 days.', filter_rules: { call_count_min: 3, last_seen_within_days: 60 }, icon: 'users', color: '#1565C0' },
  ],
  retail: [
    { name: 'Loyal Customers', description: '5+ calls in the last 90 days.', filter_rules: { call_count_min: 5, last_seen_within_days: 90 }, icon: 'star', color: '#E8622A' },
  ],
  professional_services: [
    { name: 'Active Clients', description: '3+ calls in the last 90 days.', filter_rules: { call_count_min: 3, last_seen_within_days: 90 }, icon: 'briefcase', color: '#1565C0' },
  ],
  other: [],
}

export function defaultSmartLists(industry: IndustrySlug | null | undefined): SmartListSeed[] {
  if (!industry) return UNIVERSAL
  return [...UNIVERSAL, ...(INDUSTRY[industry] ?? [])]
}

// Idempotently seed default smart lists for a business.
export async function seedDefaultSmartLists(
  admin: SupabaseClient,
  clientId: string,
  industry: IndustrySlug | null,
) {
  const seeds = defaultSmartLists(industry)
  const { data: existing } = await admin.from('smart_lists').select('name').eq('client_id', clientId)
  const existingNames = new Set((existing ?? []).map(r => r.name as string))
  const toInsert = seeds
    .filter(s => !existingNames.has(s.name))
    .map(s => ({
      client_id: clientId,
      name: s.name,
      description: s.description,
      filter_rules: s.filter_rules,
      is_system: true,
      industry: s.industry ?? industry ?? null,
      icon: s.icon ?? null,
      color: s.color ?? null,
      contact_count: 0,
      last_refreshed_at: null,
    }))
  if (toInsert.length === 0) return { inserted: 0 }
  const { error } = await admin.from('smart_lists').insert(toInsert)
  if (error) {
    console.error('[seedDefaultSmartLists]', error)
    return { inserted: 0, error }
  }
  return { inserted: toInsert.length }
}

// Refresh contact_count + last_refreshed_at for the system smart lists of a
// given client. Cheap counts only — no full contact materialisation.
export async function refreshSmartListCounts(admin: SupabaseClient, clientId: string) {
  const { data: lists } = await admin.from('smart_lists').select('id, filter_rules').eq('client_id', clientId)
  if (!lists) return

  const now = new Date().toISOString()
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  for (const list of lists) {
    const rules = (list.filter_rules ?? {}) as Record<string, unknown>
    let q = admin.from('contacts').select('id', { count: 'exact', head: true }).eq('client_id', clientId).eq('is_merged', false)

    if (rules.first_seen_within_days === 7) q = q.gte('first_seen', sevenDaysAgo)
    if (rules.first_seen_within_days === 14) q = q.gte('first_seen', fourteenDaysAgo)
    if (rules.last_seen_within_days === 60) q = q.gte('last_seen', new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString())
    if (rules.last_seen_after_days === 14) q = q.lte('last_seen', fourteenDaysAgo)
    if (rules.last_seen_after_days === 21) q = q.lte('last_seen', new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString())
    if (typeof rules.call_count_min === 'number') q = q.gte('call_count', rules.call_count_min as number)
    if (rules.has_tag === 'complaint') q = q.contains('tags', ['complaint']).gte('updated_at', thirtyDaysAgo)

    const { count } = await q
    await admin.from('smart_lists').update({ contact_count: count ?? 0, last_refreshed_at: now }).eq('id', list.id)
  }
}
