// Smart-list seeds (Session 2 brief Part 1). Universal lists are seeded for
// every business; industry-specific lists are added on top based on
// businesses.industry. The seeder is idempotent — it skips any list whose
// name already exists for the client.

import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveSmartList, type FilterRules } from './smart-list-resolver'

export type IndustrySlug =
  | 'restaurants' | 'towing' | 'real_estate' | 'trades'
  | 'healthcare' | 'ndis' | 'retail' | 'professional_services' | 'other'

export interface SmartListSeed {
  name: string
  description: string
  filter_rules: FilterRules
  icon?: string
  color?: string
  industry?: IndustrySlug
}

const UNIVERSAL: SmartListSeed[] = [
  { name: 'All Contacts', description: 'Every contact TalkMate has captured', icon: '👥', color: '#1565C0', filter_rules: {} },
  { name: 'New This Week', description: 'First contact in the last 7 days', icon: '✨', color: '#8B5CF6', filter_rules: { first_seen_days: 7 } },
  { name: 'Repeat Callers', description: 'Called 3 or more times', icon: '🔄', color: '#E8622A', filter_rules: { min_call_count: 3 } },
  { name: 'Needs Follow-up', description: 'Callback requested in the last 14 days', icon: '📞', color: '#F59E0B', filter_rules: { outcome: 'callback_requested', outcome_days: 14 } },
  { name: 'Complaints', description: 'Tagged as complaint in last 30 days', icon: '⚠️', color: '#EF4444', filter_rules: { tag: 'complaint', tag_days: 30 } },
]

const INDUSTRY: Record<IndustrySlug, SmartListSeed[]> = {
  restaurants: [
    { name: 'Regulars', description: 'Called 5+ times in last 60 days', icon: '⭐', color: '#22C55E', filter_rules: { min_call_count: 5, days: 60 } },
    { name: 'Lapsed Regulars', description: 'Was a regular, last call over 21 days ago', icon: '😴', color: '#94A3B8', filter_rules: { was_regular: true, last_seen_min_days: 21 } },
    { name: 'Delivery Customers', description: 'Tagged as delivery order', icon: '🚗', color: '#3B82F6', filter_rules: { tag: 'delivery' } },
    { name: 'High Value', description: 'Upsell accepted on last call', icon: '💰', color: '#F59E0B', filter_rules: { tag: 'upsell_accepted' } },
  ],
  towing: [
    { name: 'Account Clients', description: 'Tagged as account client', icon: '🏢', color: '#1565C0', filter_rules: { tag: 'account_client' } },
    { name: 'Repeat Breakdowns', description: 'Called 2+ times', icon: '🚗', color: '#E8622A', filter_rules: { min_call_count: 2 } },
    { name: 'After Hours Calls', description: 'Called outside business hours', icon: '🌙', color: '#8B5CF6', filter_rules: { tag: 'after_hours' } },
  ],
  real_estate: [
    { name: 'New Enquiries', description: 'First contact this week, buyer or renter', icon: '🏠', color: '#22C55E', filter_rules: { first_seen_days: 7, industry_tag: 'buy_or_rent' } },
    { name: 'Hot Leads', description: 'Pre-approved buyers', icon: '🔥', color: '#E8622A', filter_rules: { industry_data_field: 'pre_approved', industry_data_value: true } },
    { name: 'Inspection Booked', description: 'In inspection booked pipeline stage', icon: '📅', color: '#1565C0', filter_rules: { pipeline_stage: 'Inspection Booked' } },
    { name: 'Stale Leads', description: 'In pipeline but no contact in 14+ days', icon: '⏰', color: '#94A3B8', filter_rules: { in_pipeline: true, last_seen_min_days: 14 } },
    { name: 'Sellers', description: 'Enquiry type is sell or appraisal', icon: '🔑', color: '#F59E0B', filter_rules: { industry_data_field: 'enquiry_type', industry_data_value: 'sell' } },
  ],
  trades: [
    { name: 'Quote Requested', description: 'Price enquiry in last 30 days', icon: '📋', color: '#F59E0B', filter_rules: { tag: 'price_enquiry', tag_days: 30 } },
    { name: 'Recurring Clients', description: 'Called 3+ times', icon: '⭐', color: '#22C55E', filter_rules: { min_call_count: 3 } },
    { name: 'Emergency Jobs', description: 'Tagged as urgent', icon: '🚨', color: '#EF4444', filter_rules: { tag: 'urgent' } },
  ],
  healthcare: [
    { name: 'Recent Patients', description: 'First contact in last 30 days', icon: '🏥', color: '#22C55E', filter_rules: { first_seen_days: 30 } },
    { name: 'Lapsed Patients', description: 'No contact in 42+ days', icon: '📋', color: '#94A3B8', filter_rules: { last_seen_min_days: 42 } },
    { name: 'Appointment Bookings', description: 'Outcome was booking made', icon: '📅', color: '#1565C0', filter_rules: { outcome: 'booking_made' } },
  ],
  ndis: [
    { name: 'Participants', description: 'Tagged as participant', icon: '💙', color: '#1565C0', filter_rules: { tag: 'participant' } },
    { name: 'Support Coordinators', description: 'Tagged as coordinator', icon: '👤', color: '#8B5CF6', filter_rules: { tag: 'coordinator' } },
    { name: 'New Enquiries', description: 'First contact this week', icon: '✨', color: '#22C55E', filter_rules: { first_seen_days: 7 } },
  ],
  retail: [
    { name: 'Repeat Customers', description: 'Called 3+ times', icon: '⭐', color: '#22C55E', filter_rules: { min_call_count: 3 } },
    { name: 'Stock Enquiries', description: 'Tagged as stock enquiry', icon: '📦', color: '#1565C0', filter_rules: { tag: 'stock_enquiry' } },
    { name: 'Complaints', description: 'Tagged as complaint', icon: '⚠️', color: '#EF4444', filter_rules: { tag: 'complaint' } },
  ],
  professional_services: [
    { name: 'New Enquiries', description: 'First contact this week', icon: '✨', color: '#22C55E', filter_rules: { first_seen_days: 7 } },
    { name: 'Unconverted Leads', description: 'Enquiry but no follow-up booking', icon: '📋', color: '#F59E0B', filter_rules: { outcome: 'enquiry_answered', no_followup: true } },
    { name: 'Existing Clients', description: 'Called 2+ times', icon: '⭐', color: '#1565C0', filter_rules: { min_call_count: 2 } },
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

// Refresh contact_count + last_refreshed_at on every smart list for a client
// using resolveSmartList so the count exactly matches what the UI shows.
export async function refreshSmartListCounts(admin: SupabaseClient, clientId: string) {
  const { data: lists } = await admin.from('smart_lists').select('id, filter_rules').eq('client_id', clientId)
  if (!lists) return
  const now = new Date().toISOString()
  for (const list of lists) {
    const { total } = await resolveSmartList(admin, clientId, (list.filter_rules ?? {}) as FilterRules, { limit: 1 })
    await admin.from('smart_lists').update({ contact_count: total, last_refreshed_at: now }).eq('id', list.id)
  }
}
