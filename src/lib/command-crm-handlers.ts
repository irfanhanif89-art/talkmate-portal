// CRM intent handlers used by the Command Centre. Each returns a string
// formatted for WhatsApp/Telegram (numbered list, line breaks, etc.) — the
// parse route uses these to fill in `responseMessage` for read-only intents
// before returning to the user, so the JSON Grok produces is treated as a
// hint and not the final response text for these CRM intents.

import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveSmartList, type FilterRules } from './smart-list-resolver'

function formatPhone(phone: string): string {
  const m = phone.match(/^\+61(\d{3})(\d{3})(\d{3})$/)
  return m ? `+61 ${m[1]} ${m[2]} ${m[3]}` : phone
}

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return 'never'
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000))
  if (days < 1) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days} days ago`
  if (days < 365) return `${Math.floor(days / 30)} months ago`
  return `${Math.floor(days / 365)} years ago`
}

function truncate(arr: string[], n: number): { lines: string[]; remainder: number } {
  if (arr.length <= n) return { lines: arr, remainder: 0 }
  return { lines: arr.slice(0, n), remainder: arr.length - n }
}

// contact_lookup: "Find [name]", "Who is [name]", "Has [name] called before"
export async function handleContactLookup(
  supabase: SupabaseClient,
  clientId: string,
  name: string,
): Promise<string> {
  if (!name?.trim()) return 'Who would you like me to look up?'
  // Case-insensitive partial match.
  const { data: contacts } = await supabase
    .from('contacts')
    .select('id, name, phone, email, call_count, last_seen, tags')
    .eq('client_id', clientId).eq('is_merged', false)
    .ilike('name', `%${name.trim()}%`)
    .limit(5)

  if (!contacts || contacts.length === 0) {
    return `I couldn't find a contact called "${name}". They may not have called yet.`
  }
  if (contacts.length > 1) {
    const lines = contacts.map((c, i) => `${i + 1}. ${c.name} — ${formatPhone(c.phone)} — ${c.call_count} calls`)
    return `I found ${contacts.length} matches for "${name}":\n${lines.join('\n')}\nWho do you mean?`
  }

  const c = contacts[0]
  // Last 3 call summaries for context.
  const { data: recentCalls } = await supabase
    .from('contact_calls')
    .select('call_at, outcome, summary')
    .eq('contact_id', c.id)
    .order('call_at', { ascending: false })
    .limit(3)

  const summaryLines = (recentCalls ?? []).map(rc => {
    const ago = timeAgo(rc.call_at as string)
    const outcome = (rc.outcome as string | null)?.replace(/_/g, ' ') ?? 'no outcome'
    const summary = (rc.summary as string | null) ?? ''
    return `• ${ago}: ${outcome}${summary ? ` — ${summary}` : ''}`
  })

  return [
    `${c.name}`,
    `${formatPhone(c.phone)}${c.email ? ` · ${c.email}` : ''}`,
    `${c.call_count} call${c.call_count === 1 ? '' : 's'}, last ${timeAgo(c.last_seen as string)}`,
    (c.tags ?? []).length > 0 ? `Tags: ${(c.tags as string[]).join(', ')}` : '',
    summaryLines.length > 0 ? '\nRecent calls:' : '',
    ...summaryLines,
  ].filter(Boolean).join('\n')
}

// contact_list_query: matches the user's words against smart list names/descriptions.
export async function handleContactListQuery(
  supabase: SupabaseClient,
  clientId: string,
  hint: string,
): Promise<string> {
  // Pull every smart list and try to match by name/description fuzzily.
  const { data: lists } = await supabase
    .from('smart_lists')
    .select('id, name, description, filter_rules')
    .eq('client_id', clientId)
  if (!lists || lists.length === 0) {
    return 'You don\'t have any smart lists yet. Open your portal Contacts → Smart lists to create one.'
  }
  const lower = (hint ?? '').toLowerCase()
  const scored = lists.map(l => ({
    list: l,
    score:
      ((l.name as string)?.toLowerCase().includes(lower) ? 2 : 0) +
      ((l.description as string | null)?.toLowerCase().includes(lower) ? 1 : 0),
  })).sort((a, b) => b.score - a.score)
  const best = scored[0]?.score > 0 ? scored[0].list : lists[0]

  const { contacts, total } = await resolveSmartList(supabase, clientId, (best.filter_rules ?? {}) as FilterRules, { limit: 10 })
  if (total === 0) {
    return `Your "${best.name}" list is empty right now.`
  }
  const allLines = contacts.map((c, i) => {
    const who = c.name ?? formatPhone(c.phone)
    return `${i + 1}. ${who} — last ${timeAgo(c.last_seen)}`
  })
  const { lines, remainder } = truncate(allLines, 10)
  const header = `Your "${best.name}" — ${total} contact${total === 1 ? '' : 's'}:`
  const more = remainder > 0 ? `\n\n…and ${remainder} more. Open the portal for the full list.` : ''
  return [header, ...lines].join('\n') + more
}

// pipeline_query: stage breakdown or contacts in a specific stage.
export async function handlePipelineQuery(
  supabase: SupabaseClient,
  clientId: string,
  stageHint: string | null,
): Promise<string> {
  const { data: stages } = await supabase
    .from('pipeline_stages').select('id, stage_name, color, stage_order')
    .eq('client_id', clientId)
    .order('stage_order', { ascending: true })
  if (!stages || stages.length === 0) {
    return 'Your pipeline isn\'t configured yet. Open the portal → Pipeline to seed default stages for your industry.'
  }

  // Stage breakdown query.
  const { data: pipeline } = await supabase
    .from('contact_pipeline')
    .select('stage_id, contact_id, entered_at, contacts(name, phone)')
    .eq('client_id', clientId)
  const byStage = new Map<string, Array<{ name: string | null; phone: string; days: number }>>()
  for (const s of stages) byStage.set(s.id as string, [])
  for (const p of pipeline ?? []) {
    const c = (p.contacts as unknown) as { name: string | null; phone: string }
    if (!c) continue
    const days = Math.floor((Date.now() - new Date(p.entered_at as string).getTime()) / (24 * 60 * 60 * 1000))
    byStage.get(p.stage_id as string)?.push({ name: c.name, phone: c.phone, days })
  }

  if (stageHint && stageHint.trim()) {
    const lower = stageHint.toLowerCase()
    const stage = stages.find(s => (s.stage_name as string).toLowerCase().includes(lower))
    if (!stage) {
      return `I don't have a stage matching "${stageHint}". Stages are: ${stages.map(s => s.stage_name).join(', ')}.`
    }
    const items = byStage.get(stage.id as string) ?? []
    if (items.length === 0) return `No contacts in ${stage.stage_name} right now.`
    const lines = items.slice(0, 10).map((c, i) => `${i + 1}. ${c.name ?? formatPhone(c.phone)} — ${c.days}d in stage`)
    const more = items.length > 10 ? `\n…and ${items.length - 10} more.` : ''
    return [`${stage.stage_name} (${items.length}):`, ...lines].join('\n') + more
  }

  // Default: stage breakdown
  const summary = stages.map(s => `${s.stage_name} (${(byStage.get(s.id as string) ?? []).length})`).join(', ')
  return `Your pipeline: ${summary}.`
}

// Returns null if no name extractable.
export function extractNameFromIntent(actionParams: Record<string, unknown> | undefined, message: string): string | null {
  const fromParams = (actionParams?.name as string | undefined)?.trim()
  if (fromParams) return fromParams
  // Cheap fallback: pull the first capitalised word group (e.g. "Find Mike" → "Mike").
  const m = message.match(/(?:find|tag|mark|note for|about|who is|has)\s+([A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)?)/i)
  return m?.[1] ?? null
}
