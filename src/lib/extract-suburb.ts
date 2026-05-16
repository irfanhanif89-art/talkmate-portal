// Session 16 -- helper for scheduler / dispatch route display.
// Pulls the suburb out of a full Australian address like
// "5/53 Horne St, Campbellfield VIC 3061" and falls back to the
// original string (truncated) when parsing cannot find a state code.

const AU_STATES = ['VIC', 'NSW', 'QLD', 'SA', 'WA', 'TAS', 'NT', 'ACT'] as const

export function extractSuburb(address: string | null | undefined): string | null {
  if (!address || typeof address !== 'string') return null
  const trimmed = address.trim()
  if (!trimmed) return null

  const parts = trimmed.split(',').map(p => p.trim()).filter(Boolean)
  // Walk parts in reverse so multi-comma addresses still resolve.
  // The chunk that contains a state code holds either "Suburb STATE"
  // or "Suburb STATE 3061".
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i]
    const tokens = part.split(/\s+/)
    const stateIdx = tokens.findIndex(t => AU_STATES.includes(t.toUpperCase() as typeof AU_STATES[number]))
    if (stateIdx > 0) {
      return tokens.slice(0, stateIdx).join(' ').trim() || null
    }
  }

  // No state code anywhere -- fall back to last comma-separated chunk
  // truncated to keep it block-friendly.
  const tail = parts[parts.length - 1] ?? trimmed
  return tail.length > 24 ? tail.slice(0, 24).trim() + '...' : tail
}

export function routeLabel(
  pickup: string | null | undefined,
  dropoff: string | null | undefined,
  fallback?: string | null,
): string | null {
  const p = extractSuburb(pickup)
  const d = extractSuburb(dropoff)
  if (p && d) return `${p} → ${d}`
  if (p) return p
  if (d) return d
  return fallback?.trim() || null
}
