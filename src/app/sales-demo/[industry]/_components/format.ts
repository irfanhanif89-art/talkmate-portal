// Pure formatting helpers for the demo portal.
// No em dashes. No external date libs.

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}m ${s}s`
}

export function formatRelative(iso: string): string {
  const now = Date.now()
  const then = new Date(iso).getTime()
  const diffSeconds = Math.round((now - then) / 1000)

  if (diffSeconds < 60) return 'just now'
  const diffMinutes = Math.floor(diffSeconds / 60)
  if (diffMinutes < 60) return `${diffMinutes} min ago`
  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays === 1) return 'yesterday'
  if (diffDays < 7) return `${diffDays} days ago`
  return new Date(iso).toLocaleDateString('en-AU', { day: '2-digit', month: 'short' })
}

export function formatFuture(iso: string): string {
  const now = Date.now()
  const then = new Date(iso).getTime()
  const diffMs = then - now

  if (diffMs <= 0) return formatRelative(iso)

  const diffSeconds = Math.round(diffMs / 1000)
  const diffMinutes = Math.floor(diffSeconds / 60)
  if (diffMinutes < 60) return `in ${diffMinutes} min`
  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `in ${diffHours} hour${diffHours === 1 ? '' : 's'}`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays === 1) return 'tomorrow'
  return `in ${diffDays} days`
}

export function formatScheduled(iso: string): string {
  const now = Date.now()
  const then = new Date(iso).getTime()
  if (then > now) return formatFuture(iso)
  return formatRelative(iso)
}
