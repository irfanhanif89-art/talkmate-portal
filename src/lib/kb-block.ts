// Shared helpers for the Train TalkMate knowledge-base block that the
// Vapi assistant's system prompt carries. Used by both the user-triggered
// sync route and the cron route so the block format stays in one place.

export interface KbEntry {
  category: 'faq' | 'service' | 'hours' | 'pricing' | 'team' | 'custom'
  question: string
  answer: string
  sort_order?: number
}

const CATEGORY_HEADERS: Record<KbEntry['category'], string> = {
  faq: 'Frequently asked questions',
  service: 'Services',
  hours: 'Business hours',
  pricing: 'Pricing',
  team: 'Team',
  custom: 'Other information',
}

// The system-prompt block bookends are kept stable so injectKbBlock can
// find and replace existing blocks without touching the rest of the
// prompt. Don't change the header line — the regex below is anchored on it.
export const KB_BLOCK_HEADER = 'BUSINESS KNOWLEDGE:'
const KB_BLOCK_RE = /^BUSINESS KNOWLEDGE:[\s\S]*?(?:\n\s*\n|$)/m

function categoryOrder(c: KbEntry['category']): number {
  return ['faq', 'service', 'hours', 'pricing', 'team', 'custom'].indexOf(c)
}

export function buildKbBlock(entries: KbEntry[]): string {
  if (entries.length === 0) return ''

  // Group by category, preserve sort_order within group.
  const groups = new Map<KbEntry['category'], KbEntry[]>()
  for (const e of entries) {
    const list = groups.get(e.category) ?? []
    list.push(e)
    groups.set(e.category, list)
  }
  const orderedCats = Array.from(groups.keys()).sort((a, b) => categoryOrder(a) - categoryOrder(b))

  const lines: string[] = [KB_BLOCK_HEADER]
  lines.push('Use the information below to answer questions about the business. If the answer is not here, say you will take a message.')
  for (const cat of orderedCats) {
    const list = (groups.get(cat) ?? []).slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    if (list.length === 0) continue
    lines.push('')
    lines.push(`${CATEGORY_HEADERS[cat]}:`)
    for (const entry of list) {
      lines.push(`- Q: ${entry.question.trim()}`)
      lines.push(`  A: ${entry.answer.trim()}`)
    }
  }
  return lines.join('\n')
}

export function injectKbBlock(prompt: string, entries: KbEntry[]): { next: string; changed: boolean } {
  const block = buildKbBlock(entries)

  // No active entries → strip any existing block.
  if (!block) {
    if (!KB_BLOCK_RE.test(prompt)) return { next: prompt, changed: false }
    const next = prompt.replace(KB_BLOCK_RE, '')
    return { next, changed: next !== prompt }
  }

  if (KB_BLOCK_RE.test(prompt)) {
    const replaced = prompt.replace(KB_BLOCK_RE, block + '\n\n')
    return { next: replaced, changed: replaced !== prompt }
  }
  const trimmed = prompt.replace(/\s+$/, '')
  const next = `${trimmed}\n\n${block}\n`
  return { next, changed: true }
}
