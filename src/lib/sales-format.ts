// Small formatting helpers used across the /sales/* portal pages.

export type LeadStatus =
  | 'new' | 'contacted' | 'demo_booked' | 'demo_done'
  | 'proposal_sent' | 'won' | 'lost' | 'nurture' | 'bad_lead'

export interface StatusStyle {
  label: string
  bg: string
  color: string
  border: string
}

export const LEAD_STATUS_STYLES: Record<LeadStatus, StatusStyle> = {
  new:           { label: 'New',           bg: 'rgba(123,174,212,0.12)', color: '#7BAED4', border: 'rgba(123,174,212,0.3)' },
  contacted:     { label: 'Contacted',     bg: 'rgba(74,159,232,0.15)',  color: '#4A9FE8', border: 'rgba(74,159,232,0.35)' },
  demo_booked:   { label: 'Demo Booked',   bg: 'rgba(168,85,247,0.15)',  color: '#a855f7', border: 'rgba(168,85,247,0.35)' },
  demo_done:     { label: 'Demo Done',     bg: 'rgba(217,70,239,0.15)',  color: '#d946ef', border: 'rgba(217,70,239,0.35)' },
  proposal_sent: { label: 'Proposal Sent', bg: 'rgba(245,158,11,0.15)',  color: '#f59e0b', border: 'rgba(245,158,11,0.35)' },
  won:           { label: 'Won',           bg: 'rgba(34,197,94,0.15)',   color: '#22c55e', border: 'rgba(34,197,94,0.35)' },
  lost:          { label: 'Lost',          bg: 'rgba(239,68,68,0.12)',   color: '#ef4444', border: 'rgba(239,68,68,0.3)' },
  nurture:       { label: 'Nurture',       bg: 'rgba(232,98,42,0.12)',   color: '#E8622A', border: 'rgba(232,98,42,0.3)' },
  bad_lead:      { label: 'Bad Lead',      bg: 'rgba(100,116,139,0.18)', color: '#94a3b8', border: 'rgba(100,116,139,0.4)' },
}

export const LEAD_STATUS_COLUMNS: LeadStatus[] = [
  'new', 'contacted', 'demo_booked', 'demo_done',
  'proposal_sent', 'won', 'lost', 'bad_lead',
]

export const LOST_REASONS: Array<{ value: string; label: string }> = [
  { value: 'not_interested',     label: 'Not interested' },
  { value: 'too_expensive',      label: 'Too expensive' },
  { value: 'competitor_chosen',  label: 'Competitor chosen' },
  { value: 'bad_timing',         label: 'Bad timing' },
  { value: 'no_decision_maker',  label: 'No decision maker' },
  { value: 'unreachable',        label: 'Unreachable' },
  { value: 'already_a_client',   label: 'Already a client' },
  { value: 'other',              label: 'Other' },
]

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const diffMs = Date.now() - then
  const mins = Math.floor(diffMs / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo ago`
  const years = Math.floor(days / 365)
  return `${years}y ago`
}

export function daysSince(iso: string | null | undefined): number {
  if (!iso) return 0
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return 0
  return Math.floor((Date.now() - then) / 86_400_000)
}

export function formatCurrency(n: number): string {
  return `$${n.toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('en-AU', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
