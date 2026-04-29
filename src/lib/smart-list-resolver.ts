// Resolves smart-list filter_rules → matching contacts for a given business.
// Used by:
// - smart list detail page (/contacts/smart-lists/[id])
// - custom list builder live preview (/api/smart-lists/preview)
// - Command Centre contact_list_query intent (Part 5)
//
// Filter rules supported (per Session 2 brief Part 1):
//   min_call_count: N            — call_count >= N
//   first_seen_days: N           — first_seen >= now - N days
//   last_seen_min_days: N        — last_seen <= now - N days  (lapsed)
//   tag: 'tagname'               — tags contains tagname
//   tag_days: N                  — combined with tag, tag applied within N days (via contact_calls.tags_applied)
//   outcome: 'outcome_type'      — most recent contact_calls.outcome === outcome_type
//   outcome_days: N              — combined with outcome, within N days
//   pipeline_stage: 'Stage Name' — contact in that named stage
//   in_pipeline: true            — contact has any pipeline stage row
//   industry_data_field +
//     industry_data_value        — industry_data ->> field === value
//   industry_tag: 'buy_or_rent'  — special tag for real estate buy/rent enquiries
//   was_regular: true            — call_count >= 5 at some point (proxy: call_count >= 5 OR has 'regular' tag)
//   no_followup: true            — outcome === enquiry_answered AND call_count === 1
//   days: N                      — combined with min_call_count: only count calls within N days
//
// Returns { contacts, total } where contacts is up to `limit` rows.

import type { SupabaseClient } from '@supabase/supabase-js'

export interface FilterRules {
  min_call_count?: number
  first_seen_days?: number
  last_seen_min_days?: number
  tag?: string
  tag_days?: number
  outcome?: string
  outcome_days?: number
  pipeline_stage?: string
  in_pipeline?: boolean
  industry_data_field?: string
  industry_data_value?: string | number | boolean
  industry_tag?: string
  was_regular?: boolean
  no_followup?: boolean
  days?: number
}

export interface ResolvedContact {
  id: string
  name: string | null
  phone: string
  email: string | null
  call_count: number
  first_seen: string
  last_seen: string
  tags: string[] | null
  industry_data: Record<string, unknown>
}

const dayMs = 24 * 60 * 60 * 1000

function isoNDaysAgo(n: number): string {
  return new Date(Date.now() - n * dayMs).toISOString()
}

// Build the base contacts query (RLS via service role; client_id is supplied
// explicitly so this can also be used for admin or cron contexts).
function baseQuery(supabase: SupabaseClient, clientId: string) {
  return supabase
    .from('contacts')
    .select('id, name, phone, email, call_count, first_seen, last_seen, tags, industry_data', { count: 'exact' })
    .eq('client_id', clientId)
    .eq('is_merged', false)
}

export async function resolveSmartList(
  supabase: SupabaseClient,
  clientId: string,
  rules: FilterRules,
  opts: { limit?: number; offset?: number; orderBy?: 'last_seen' | 'first_seen' | 'call_count' } = {},
): Promise<{ contacts: ResolvedContact[]; total: number }> {
  let q = baseQuery(supabase, clientId)

  // Simple direct rules
  if (typeof rules.min_call_count === 'number') q = q.gte('call_count', rules.min_call_count)
  if (typeof rules.first_seen_days === 'number') q = q.gte('first_seen', isoNDaysAgo(rules.first_seen_days))
  if (typeof rules.last_seen_min_days === 'number') q = q.lte('last_seen', isoNDaysAgo(rules.last_seen_min_days))
  if (rules.tag && !rules.tag_days) q = q.contains('tags', [rules.tag])

  // industry_data field/value: PostgREST JSONB containment.
  if (rules.industry_data_field && rules.industry_data_value !== undefined) {
    q = q.contains('industry_data', { [rules.industry_data_field]: rules.industry_data_value })
  }
  // Real-estate "buy_or_rent" sugar.
  if (rules.industry_tag === 'buy_or_rent') {
    // Either enquiry_type is 'buy' or 'rent' — Supabase can't OR on JSONB cleanly,
    // so we apply post-filter below after the rough fetch.
  }

  // was_regular sugar — proxy via call_count >= 5
  if (rules.was_regular) q = q.gte('call_count', 5)

  // Order
  const orderBy = opts.orderBy ?? 'last_seen'
  q = q.order(orderBy, { ascending: false })

  // Limit / offset
  const limit = opts.limit ?? 200
  const offset = opts.offset ?? 0
  q = q.range(offset, offset + limit - 1)

  const { data, count, error } = await q
  if (error) {
    console.error('[resolveSmartList]', error)
    return { contacts: [], total: 0 }
  }

  let rows = (data ?? []) as ResolvedContact[]

  // Post-filters that can't be expressed in a single Supabase query.
  if (rules.industry_tag === 'buy_or_rent') {
    rows = rows.filter(r => {
      const t = (r.industry_data as { enquiry_type?: string })?.enquiry_type
      return t === 'buy' || t === 'rent'
    })
  }

  // outcome / outcome_days / tag_days / pipeline_stage / in_pipeline / no_followup
  // All of these need a follow-up query against contact_calls or contact_pipeline.
  const needsCalls = !!(rules.outcome || rules.tag_days || rules.no_followup)
  const needsPipeline = !!(rules.pipeline_stage || rules.in_pipeline)

  if (needsCalls && rows.length > 0) {
    const ids = rows.map(r => r.id)
    let cq = supabase
      .from('contact_calls')
      .select('contact_id, outcome, call_at, tags_applied')
      .in('contact_id', ids)
      .order('call_at', { ascending: false })
    if (rules.outcome_days) cq = cq.gte('call_at', isoNDaysAgo(rules.outcome_days))
    const { data: calls } = await cq
    const callsByContact = new Map<string, { outcome: string | null; call_at: string; tags_applied: string[] | null }[]>()
    for (const c of calls ?? []) {
      const arr = callsByContact.get(c.contact_id as string) ?? []
      arr.push({ outcome: c.outcome as string | null, call_at: c.call_at as string, tags_applied: c.tags_applied as string[] | null })
      callsByContact.set(c.contact_id as string, arr)
    }
    rows = rows.filter(r => {
      const list = callsByContact.get(r.id) ?? []
      // outcome: most-recent call's outcome must match
      if (rules.outcome) {
        const recent = list[0]
        if (!recent || recent.outcome !== rules.outcome) return false
      }
      // tag_days: tag was applied within tag_days
      if (rules.tag && rules.tag_days) {
        const cutoff = Date.now() - rules.tag_days * dayMs
        const matched = list.find(c =>
          new Date(c.call_at).getTime() >= cutoff &&
          (c.tags_applied ?? []).includes(rules.tag!)
        )
        if (!matched) return false
      }
      // no_followup: outcome was enquiry_answered, no further call has happened
      if (rules.no_followup) {
        const recent = list[0]
        if (!recent || recent.outcome !== 'enquiry_answered') return false
        if (r.call_count > 1) return false
      }
      return true
    })
  }

  if (needsPipeline && rows.length > 0) {
    const ids = rows.map(r => r.id)
    const { data: pipelineRows } = await supabase
      .from('contact_pipeline')
      .select('contact_id, stage_id, pipeline_stages(stage_name)')
      .in('contact_id', ids)
    const pipeByContact = new Map<string, { stage_name: string | null }>()
    for (const p of pipelineRows ?? []) {
      const stageName = (p as { pipeline_stages?: { stage_name?: string } | null }).pipeline_stages?.stage_name ?? null
      pipeByContact.set(p.contact_id as string, { stage_name: stageName })
    }
    rows = rows.filter(r => {
      const inPipe = pipeByContact.has(r.id)
      if (rules.in_pipeline && !inPipe) return false
      if (rules.pipeline_stage) {
        if (!inPipe) return false
        if (pipeByContact.get(r.id)?.stage_name !== rules.pipeline_stage) return false
      }
      return true
    })
  }

  return { contacts: rows, total: count ?? rows.length }
}

// Friendly description used by Command Centre when announcing a smart list.
export function describeFilter(rules: FilterRules): string {
  const parts: string[] = []
  if (rules.min_call_count) parts.push(`${rules.min_call_count}+ calls`)
  if (rules.first_seen_days) parts.push(`first seen in last ${rules.first_seen_days} days`)
  if (rules.last_seen_min_days) parts.push(`no contact in ${rules.last_seen_min_days}+ days`)
  if (rules.tag) parts.push(`tagged "${rules.tag}"`)
  if (rules.outcome) parts.push(`outcome: ${rules.outcome.replace(/_/g, ' ')}`)
  if (rules.pipeline_stage) parts.push(`stage: ${rules.pipeline_stage}`)
  if (rules.in_pipeline) parts.push('in pipeline')
  if (rules.industry_data_field) parts.push(`${rules.industry_data_field}=${rules.industry_data_value}`)
  return parts.join(', ') || 'all contacts'
}
