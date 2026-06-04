'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { LayoutGrid, List as ListIcon, Search, Plus } from 'lucide-react'
import {
  LEAD_STATUS_COLUMNS, LEAD_STATUS_STYLES,
  type LeadStatus, daysSince, timeAgo, formatCurrency,
} from '@/lib/sales-format'
import { StatsBar, type StatItem } from '@/components/portal/ui-v2/stats-bar'
import {
  KanbanBoard, KanbanColumn, KanbanCard,
} from '@/components/portal/ui-v2/kanban'
import { ButtonV2 } from '@/components/portal/ui-v2/button'
import { Tag, type TagVariant } from '@/components/portal/ui-v2/tag'
import LeadDrawer from './lead-drawer'
import AddLeadModal from './add-lead-modal'

// Plan prices defined here (not imported from admin-auth to avoid pulling next/headers into a client component)
const PLAN_PRICE: Record<'starter' | 'growth' | 'pro', number> = {
  starter: 299,
  growth: 499,
  pro: 799,
}

export interface LeadRow {
  id: string
  business_name: string
  contact_name: string | null
  phone: string | null
  email: string | null
  industry: string | null
  suburb: string | null
  state: string | null
  website: string | null
  source: string | null
  notes: string | null
  status: LeadStatus
  approval_status: 'pending' | 'approved' | 'rejected' | null
  won_plan: 'starter' | 'growth' | 'pro' | null
  won_at: string | null
  lost_reason: string | null
  bad_lead_reason: string | null
  business_id: string | null
  created_at: string
  updated_at: string
}

type ViewMode = 'kanban' | 'list'

interface Props {
  initialLeads: LeadRow[]
  repId: string
}

// Map a lead's won_plan to a monthly AUD value
function leadMrr(lead: LeadRow): number {
  if (!lead.won_plan) return 0
  return PLAN_PRICE[lead.won_plan] ?? 0
}

// Map industry string to the closest Tag variant
function industryTagVariant(industry: string | null): TagVariant {
  if (!industry) return 'question'
  const lower = industry.toLowerCase()
  if (lower.includes('trade') || lower.includes('plumb') || lower.includes('elec') || lower.includes('build')) return 'emergency'
  if (lower.includes('food') || lower.includes('hospit') || lower.includes('cater') || lower.includes('resto')) return 'book'
  if (lower.includes('tow') || lower.includes('transport') || lower.includes('logis')) return 'transfer'
  if (lower.includes('health') || lower.includes('med') || lower.includes('dent') || lower.includes('physio')) return 'book'
  if (lower.includes('retail') || lower.includes('ecomm')) return 'quote'
  return 'question'
}

// Determine accent for a card based on recency of update
function cardAccent(lead: LeadRow): 'hot' | 'warm' | undefined {
  if (lead.status === 'won' || lead.status === 'lost' || lead.status === 'bad_lead') return undefined
  const days = daysSince(lead.updated_at)
  if (days === 0) return 'hot'
  if (days === 1) return 'warm'
  return undefined
}

// Map LEAD_STATUS_COLUMNS to KanbanColumn tone + title color
function columnTone(status: LeadStatus): 'default' | 'won' | 'lost' {
  if (status === 'won') return 'won'
  if (status === 'lost' || status === 'bad_lead') return 'lost'
  return 'default'
}

// Terminal statuses don't need the "Add lead" footer
const TERMINAL_STATUSES: LeadStatus[] = ['won', 'lost', 'bad_lead']

export default function LeadsBoard({ initialLeads, repId }: Props) {
  const search = useSearchParams()
  const [leads, setLeads] = useState<LeadRow[]>(initialLeads)
  const [view, setView] = useState<ViewMode>('kanban')
  const [filterText, setFilterText] = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | LeadStatus>('all')
  const [filterIndustry, setFilterIndustry] = useState<string>('all')
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null)
  const [addLeadOpen, setAddLeadOpen] = useState(false)

  // Persist view choice in localStorage
  useEffect(() => {
    const stored = localStorage.getItem('sales-leads-view')
    if (stored === 'kanban' || stored === 'list') setView(stored)
  }, [])
  useEffect(() => { localStorage.setItem('sales-leads-view', view) }, [view])

  // Allow ?lead=ID query param (used from dashboard "Log Activity" link)
  useEffect(() => {
    const id = search.get('lead')
    if (id) setSelectedLeadId(id)
  }, [search])

  const industries = useMemo(() => {
    const set = new Set<string>()
    for (const l of leads) if (l.industry) set.add(l.industry)
    return Array.from(set).sort()
  }, [leads])

  const filtered = useMemo(() => {
    return leads.filter(l => {
      if (filterStatus !== 'all' && l.status !== filterStatus) return false
      if (filterIndustry !== 'all' && l.industry !== filterIndustry) return false
      if (filterText) {
        const t = filterText.toLowerCase()
        const haystack = `${l.business_name} ${l.contact_name ?? ''} ${l.suburb ?? ''}`.toLowerCase()
        if (!haystack.includes(t)) return false
      }
      return true
    })
  }, [leads, filterText, filterStatus, filterIndustry])

  const grouped = useMemo(() => {
    const m: Record<string, LeadRow[]> = {}
    for (const status of LEAD_STATUS_COLUMNS) m[status] = []
    for (const l of filtered) {
      const col = LEAD_STATUS_COLUMNS.includes(l.status) ? l.status : 'new'
      m[col].push(l)
    }
    return m
  }, [filtered])

  // ── Stats bar computations (from real data) ──────────────────────────────
  const stats = useMemo<StatItem[]>(() => {
    const activeStatuses: LeadStatus[] = ['new', 'contacted', 'demo_booked', 'demo_done', 'proposal_sent', 'nurture']
    const activeLeads = leads.filter(l => activeStatuses.includes(l.status))
    const wonLeads = leads.filter(l => l.status === 'won')

    // Pipeline value: sum of plan MRR for all active leads (use growth as default if no plan set)
    const pipelineValue = activeLeads.reduce((sum, l) => {
      return sum + (l.won_plan ? leadMrr(l) : PLAN_PRICE.growth)
    }, 0)

    // Won this sprint: won leads (we don't have sprint window here, so count all won)
    const wonCount = wonLeads.length

    // MRR closed: sum of won_plan MRR for won leads
    const mrrClosed = wonLeads.reduce((sum, l) => sum + leadMrr(l), 0)

    // Close rate: won / (won + lost + bad_lead) if any terminal
    const lostCount = leads.filter(l => l.status === 'lost' || l.status === 'bad_lead').length
    const total = wonCount + lostCount
    const closeRate = total > 0 ? Math.round((wonCount / total) * 100) : 0

    return [
      { value: activeLeads.length.toString(), label: 'Active leads' },
      { value: formatCurrency(pipelineValue), label: 'Pipeline value', color: 'var(--color-orange)' },
      { value: wonCount.toString(), label: 'Won', color: 'var(--color-green)' },
      { value: mrrClosed > 0 ? formatCurrency(mrrClosed) : '—', label: 'MRR closed', color: 'var(--color-green)' },
      { value: total > 0 ? `${closeRate}%` : '—', label: 'Close rate' },
    ]
  }, [leads])

  const selectedLead = leads.find(l => l.id === selectedLeadId) ?? null

  function patchLead(updated: LeadRow) {
    setLeads(prev => prev.map(l => l.id === updated.id ? updated : l))
  }
  function removeLead(id: string) {
    setLeads(prev => prev.filter(l => l.id !== id))
    setSelectedLeadId(null)
  }

  return (
    <div className="flex flex-col min-h-screen bg-bg w-full min-w-0 overflow-x-hidden">
      {/* Stats bar */}
      <StatsBar stats={stats} />

      {/* Page content */}
      <div className="px-4 sm:px-6 pt-5 pb-10 flex flex-col gap-4 flex-1 min-w-0">
        {/* Header row */}
        <div className="flex items-center justify-between flex-wrap gap-3 min-w-0">
          <div className="min-w-0">
            <h1 className="text-[22px] font-[800] tracking-[-0.5px] text-text m-0">My Pipeline</h1>
            <p className="text-[13px] text-dim mt-0.5">
              {filtered.length} of {leads.length} leads
            </p>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <ButtonV2 variant="primary" onClick={() => setAddLeadOpen(true)}>
              <Plus className="w-[14px] h-[14px]" />
              Add Lead
            </ButtonV2>

            {/* View toggle */}
            <div className="flex bg-card border border-line rounded-[10px] p-[3px]">
              {(['kanban', 'list'] as ViewMode[]).map(m => (
                <button
                  key={m}
                  onClick={() => setView(m)}
                  className={[
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-[7px] text-[12px] font-bold transition-colors cursor-pointer border-none',
                    view === m
                      ? 'bg-[linear-gradient(135deg,#f58a42,#e86526)] text-white'
                      : 'bg-transparent text-dim hover:text-text',
                  ].join(' ')}
                >
                  {m === 'kanban' ? <LayoutGrid className="w-[13px] h-[13px]" /> : <ListIcon className="w-[13px] h-[13px]" />}
                  {m === 'kanban' ? 'Pipeline' : 'List'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Filter bar */}
        <div className="flex gap-2.5 flex-wrap">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px] max-w-[360px]">
            <Search className="absolute top-1/2 left-3 -translate-y-1/2 w-[14px] h-[14px] text-dim pointer-events-none" />
            <input
              value={filterText}
              onChange={e => setFilterText(e.target.value)}
              placeholder="Search business or contact"
              className="w-full pl-9 pr-3 py-2.5 rounded-[9px] bg-card border border-line text-text text-[13px] placeholder:text-faint outline-none focus:border-orange/50 transition-colors"
            />
          </div>

          {/* Industry filter */}
          <select
            value={filterIndustry}
            onChange={e => setFilterIndustry(e.target.value)}
            disabled={industries.length === 0}
            className="px-3 py-2.5 rounded-[9px] bg-card border border-line text-text text-[13px] outline-none cursor-pointer disabled:opacity-50"
          >
            <option value="all">All industries</option>
            {industries.map(i => <option key={i} value={i}>{i}</option>)}
          </select>

          {/* Status filter */}
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value as 'all' | LeadStatus)}
            className="px-3 py-2.5 rounded-[9px] bg-card border border-line text-text text-[13px] outline-none cursor-pointer"
          >
            <option value="all">All statuses</option>
            {LEAD_STATUS_COLUMNS.map(s => (
              <option key={s} value={s}>{LEAD_STATUS_STYLES[s].label}</option>
            ))}
          </select>
        </div>

        {/* Empty state */}
        {leads.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 p-10 rounded-xl bg-card border border-dashed border-line-strong text-center">
            <p className="text-[14px] font-semibold text-text m-0">No leads yet.</p>
            <p className="text-[13px] text-dim m-0">Start building your pipeline by adding your first lead.</p>
            <ButtonV2 variant="primary" onClick={() => setAddLeadOpen(true)}>
              <Plus className="w-[14px] h-[14px]" />
              Add Your First Lead
            </ButtonV2>
          </div>
        ) : view === 'kanban' ? (
          <KanbanBoardView grouped={grouped} onSelect={setSelectedLeadId} onAddLead={() => setAddLeadOpen(true)} />
        ) : (
          <LeadListView leads={filtered} onSelect={setSelectedLeadId} />
        )}
      </div>

      {/* Drawer */}
      {selectedLead && (
        <LeadDrawer
          lead={selectedLead}
          repId={repId}
          onClose={() => setSelectedLeadId(null)}
          onUpdated={patchLead}
          onRemoved={removeLead}
        />
      )}

      {/* Add lead modal */}
      {addLeadOpen && (
        <AddLeadModal
          onClose={() => setAddLeadOpen(false)}
          onCreated={(lead) => setLeads(prev => [lead, ...prev])}
        />
      )}
    </div>
  )
}

// ── Kanban board ──────────────────────────────────────────────────────────────
function KanbanBoardView({
  grouped,
  onSelect,
  onAddLead,
}: {
  grouped: Record<string, LeadRow[]>
  onSelect: (id: string) => void
  onAddLead: () => void
}) {
  return (
    <KanbanBoard>
      {LEAD_STATUS_COLUMNS.map(status => {
        const style = LEAD_STATUS_STYLES[status]
        const items = grouped[status] ?? []
        const tone = columnTone(status)
        const isTerminal = TERMINAL_STATUSES.includes(status)

        return (
          <KanbanColumn
            key={status}
            title={style.label}
            count={items.length}
            tone={tone}
            titleColor={style.color}
            onAddLead={isTerminal ? undefined : onAddLead}
          >
            {items.length === 0 ? (
              <div className="text-[12px] text-faint italic py-4 text-center">Empty</div>
            ) : (
              items.map(lead => {
                const days = daysSince(lead.updated_at)
                const metaText = days === 0 ? 'today' : timeAgo(lead.updated_at)
                const industry = lead.industry
                const variant = industry ? industryTagVariant(industry) : null

                return (
                  <KanbanCard
                    key={lead.id}
                    business={lead.business_name}
                    contact={lead.contact_name ?? undefined}
                    plan={lead.won_plan
                      ? `${lead.won_plan.charAt(0).toUpperCase()}${lead.won_plan.slice(1)} — $${PLAN_PRICE[lead.won_plan]}/mo`
                      : undefined}
                    tag={variant && industry ? { variant, label: industry } : undefined}
                    meta={metaText}
                    accent={cardAccent(lead)}
                    wonBadge={lead.status === 'won'}
                    onClick={() => onSelect(lead.id)}
                  />
                )
              })
            )}
          </KanbanColumn>
        )
      })}
    </KanbanBoard>
  )
}

// ── List view ─────────────────────────────────────────────────────────────────
function LeadListView({
  leads,
  onSelect,
}: {
  leads: LeadRow[]
  onSelect: (id: string) => void
}) {
  return (
    <div className="bg-card border border-line rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]" style={{ minWidth: 720 }}>
          <thead>
            <tr className="bg-card-2 text-faint text-[11px] uppercase tracking-[.06em]">
              <th className="px-4 py-2.5 text-left font-semibold">Business</th>
              <th className="px-4 py-2.5 text-left font-semibold">Contact</th>
              <th className="px-4 py-2.5 text-left font-semibold">Industry</th>
              <th className="px-4 py-2.5 text-left font-semibold">Plan</th>
              <th className="px-4 py-2.5 text-left font-semibold">Status</th>
              <th className="px-4 py-2.5 text-left font-semibold">Last activity</th>
              <th className="px-4 py-2.5 text-left font-semibold">Age</th>
            </tr>
          </thead>
          <tbody>
            {leads.map(lead => {
              const sty = LEAD_STATUS_STYLES[lead.status]
              const days = daysSince(lead.updated_at)
              const dayColorClass = days >= 3 ? 'text-red-400' : days >= 2 ? 'text-gold' : 'text-dim'
              const industry = lead.industry
              const variant = industry ? industryTagVariant(industry) : null

              return (
                <tr
                  key={lead.id}
                  onClick={() => onSelect(lead.id)}
                  className="border-t border-line cursor-pointer hover:bg-card-2 transition-colors"
                >
                  <td className="px-4 py-3 font-[700] text-text">{lead.business_name}</td>
                  <td className="px-4 py-3 text-dim">{lead.contact_name ?? '—'}</td>
                  <td className="px-4 py-3">
                    {variant && industry
                      ? <Tag variant={variant}>{industry}</Tag>
                      : <span className="text-faint">—</span>}
                  </td>
                  <td className="px-4 py-3 text-orange font-semibold text-[12px]">
                    {lead.won_plan
                      ? `${lead.won_plan.charAt(0).toUpperCase()}${lead.won_plan.slice(1)}`
                      : <span className="text-faint">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-[700]"
                      style={{ background: sty.bg, color: sty.color, border: `1px solid ${sty.border}` }}
                    >
                      {sty.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-dim">{timeAgo(lead.updated_at)}</td>
                  <td className={`px-4 py-3 font-[700] ${dayColorClass}`}>
                    {days === 0 ? 'today' : `${days}d`}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
