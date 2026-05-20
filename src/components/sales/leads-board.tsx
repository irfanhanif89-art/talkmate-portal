'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { LayoutGrid, List as ListIcon, Search, Phone } from 'lucide-react'
import {
  LEAD_STATUS_COLUMNS, LEAD_STATUS_STYLES,
  type LeadStatus, daysSince, timeAgo,
} from '@/lib/sales-format'
import LeadDrawer from './lead-drawer'

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

export default function LeadsBoard({ initialLeads, repId }: Props) {
  const search = useSearchParams()
  const [leads, setLeads] = useState<LeadRow[]>(initialLeads)
  const [view, setView] = useState<ViewMode>('kanban')
  const [filterText, setFilterText] = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | LeadStatus>('all')
  const [filterIndustry, setFilterIndustry] = useState<string>('all')
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null)

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

  const selectedLead = leads.find(l => l.id === selectedLeadId) ?? null

  function patchLead(updated: LeadRow) {
    setLeads(prev => prev.map(l => l.id === updated.id ? updated : l))
  }
  function removeLead(id: string) {
    setLeads(prev => prev.filter(l => l.id !== id))
    setSelectedLeadId(null)
  }

  return (
    <div style={{ padding: '24px 24px 40px', fontFamily: 'Outfit, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: '-0.5px' }}>My Pipeline</h1>
          <p style={{ fontSize: 13, color: '#7BAED4', margin: 0, marginTop: 2 }}>
            {filtered.length} of {leads.length} leads
          </p>
        </div>

        {/* View toggle */}
        <div style={{ display: 'flex', background: '#0A1E38', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: 3 }}>
          {(['kanban', 'list'] as ViewMode[]).map(m => (
            <button
              key={m}
              onClick={() => setView(m)}
              style={{
                padding: '7px 12px', borderRadius: 7, border: 'none', cursor: 'pointer',
                background: view === m ? '#E8622A' : 'transparent',
                color: view === m ? 'white' : '#7BAED4',
                fontFamily: 'Outfit, sans-serif', fontSize: 12, fontWeight: 700,
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              {m === 'kanban' ? <LayoutGrid size={13} /> : <ListIcon size={13} />}
              {m === 'kanban' ? 'Pipeline' : 'List'}
            </button>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: 360 }}>
          <Search size={14} style={{ position: 'absolute', top: 12, left: 12, color: '#7BAED4' }} />
          <input
            value={filterText}
            onChange={e => setFilterText(e.target.value)}
            placeholder="Search business or contact"
            style={{
              width: '100%', padding: '10px 12px 10px 34px', borderRadius: 9,
              background: '#0A1E38', border: '1px solid rgba(255,255,255,0.08)',
              color: 'white', fontFamily: 'Outfit, sans-serif', fontSize: 13, outline: 'none',
            }}
          />
        </div>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value as 'all' | LeadStatus)}
          style={selectStyle}
        >
          <option value="all">All statuses</option>
          {LEAD_STATUS_COLUMNS.map(s => (
            <option key={s} value={s}>{LEAD_STATUS_STYLES[s].label}</option>
          ))}
        </select>
        <select
          value={filterIndustry}
          onChange={e => setFilterIndustry(e.target.value)}
          style={selectStyle}
          disabled={industries.length === 0}
        >
          <option value="all">All industries</option>
          {industries.map(i => <option key={i} value={i}>{i}</option>)}
        </select>
      </div>

      {leads.length === 0 ? (
        <div style={{
          padding: 40, borderRadius: 12, background: '#0A1E38',
          border: '1px dashed rgba(255,255,255,0.1)', textAlign: 'center',
        }}>
          <p style={{ fontSize: 14, color: '#7BAED4', margin: 0 }}>
            No leads assigned yet. Leads are assigned by your manager. Check back soon.
          </p>
        </div>
      ) : view === 'kanban' ? (
        <KanbanView grouped={grouped} onSelect={setSelectedLeadId} />
      ) : (
        <ListView leads={filtered} onSelect={setSelectedLeadId} />
      )}

      {selectedLead && (
        <LeadDrawer
          lead={selectedLead}
          repId={repId}
          onClose={() => setSelectedLeadId(null)}
          onUpdated={patchLead}
          onRemoved={removeLead}
        />
      )}
    </div>
  )
}

function KanbanView({ grouped, onSelect }: { grouped: Record<string, LeadRow[]>; onSelect: (id: string) => void }) {
  return (
    <div style={{
      display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 12,
      scrollSnapType: 'x mandatory',
    }}>
      {LEAD_STATUS_COLUMNS.map(status => {
        const style = LEAD_STATUS_STYLES[status]
        const items = grouped[status] ?? []
        return (
          <div
            key={status}
            style={{
              minWidth: 260, maxWidth: 280, flex: '0 0 auto',
              background: '#0A1E38', border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 12, padding: 12, scrollSnapAlign: 'start',
            }}
          >
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: 10,
            }}>
              <span style={{
                fontSize: 11, fontWeight: 800, color: style.color,
                textTransform: 'uppercase', letterSpacing: '0.06em',
              }}>{style.label}</span>
              <span style={{
                fontSize: 11, fontWeight: 700, color: '#7BAED4',
                background: 'rgba(255,255,255,0.05)', padding: '2px 7px', borderRadius: 99,
              }}>{items.length}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {items.length === 0 ? (
                <div style={{ fontSize: 12, color: '#4A7FBB', padding: '14px 8px', textAlign: 'center', fontStyle: 'italic' }}>
                  Empty
                </div>
              ) : items.map(lead => (
                <LeadCard key={lead.id} lead={lead} onClick={() => onSelect(lead.id)} />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function LeadCard({ lead, onClick }: { lead: LeadRow; onClick: () => void }) {
  const days = daysSince(lead.updated_at)
  const dayColor = days >= 3 ? '#ef4444' : days >= 2 ? '#f59e0b' : '#7BAED4'
  return (
    <button
      onClick={onClick}
      style={{
        textAlign: 'left', width: '100%',
        background: '#061322', border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 10, padding: 12, cursor: 'pointer',
        fontFamily: 'Outfit, sans-serif', color: 'white',
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.25, marginBottom: 4 }}>
        {lead.business_name}
      </div>
      {lead.contact_name && (
        <div style={{ fontSize: 12, color: '#7BAED4', marginBottom: 6 }}>
          {lead.contact_name}
        </div>
      )}
      {lead.phone && (
        <div style={{ fontSize: 12, color: '#4A9FE8', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 8 }}>
          <Phone size={11} /> {lead.phone}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        {lead.industry ? (
          <span style={{
            fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 99,
            background: 'rgba(74,159,232,0.12)', color: '#4A9FE8',
            border: '1px solid rgba(74,159,232,0.3)',
          }}>{lead.industry}</span>
        ) : <span />}
        <span style={{ fontSize: 11, color: dayColor, fontWeight: 700 }}>
          {days === 0 ? 'today' : `${days}d`}
        </span>
      </div>
    </button>
  )
}

function ListView({ leads, onSelect }: { leads: LeadRow[]; onSelect: (id: string) => void }) {
  return (
    <div style={{
      background: '#0A1E38', border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 12, overflow: 'hidden',
    }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 720 }}>
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.03)', color: '#4A7FBB', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              <th style={th}>Business</th>
              <th style={th}>Contact</th>
              <th style={th}>Phone</th>
              <th style={th}>Industry</th>
              <th style={th}>Status</th>
              <th style={th}>Last activity</th>
              <th style={th}>Days</th>
            </tr>
          </thead>
          <tbody>
            {leads.map(lead => {
              const sty = LEAD_STATUS_STYLES[lead.status]
              const days = daysSince(lead.updated_at)
              const dayColor = days >= 3 ? '#ef4444' : days >= 2 ? '#f59e0b' : '#7BAED4'
              return (
                <tr
                  key={lead.id}
                  onClick={() => onSelect(lead.id)}
                  style={{ borderTop: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer' }}
                >
                  <td style={td}><strong style={{ color: 'white' }}>{lead.business_name}</strong></td>
                  <td style={{ ...td, color: '#7BAED4' }}>{lead.contact_name ?? '—'}</td>
                  <td style={{ ...td, color: '#4A9FE8' }}>{lead.phone ?? '—'}</td>
                  <td style={{ ...td, color: '#7BAED4' }}>{lead.industry ?? '—'}</td>
                  <td style={td}>
                    <span style={{
                      display: 'inline-block', padding: '3px 9px', borderRadius: 99,
                      background: sty.bg, color: sty.color, border: `1px solid ${sty.border}`,
                      fontSize: 11, fontWeight: 700,
                    }}>{sty.label}</span>
                  </td>
                  <td style={{ ...td, color: '#7BAED4' }}>{timeAgo(lead.updated_at)}</td>
                  <td style={{ ...td, color: dayColor, fontWeight: 700 }}>{days === 0 ? 'today' : `${days}d`}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const selectStyle: React.CSSProperties = {
  padding: '10px 12px', borderRadius: 9,
  background: '#0A1E38', border: '1px solid rgba(255,255,255,0.08)',
  color: 'white', fontFamily: 'Outfit, sans-serif', fontSize: 13, outline: 'none',
}
const th: React.CSSProperties = { padding: '10px 12px', textAlign: 'left' }
const td: React.CSSProperties = { padding: '12px', verticalAlign: 'middle' }
