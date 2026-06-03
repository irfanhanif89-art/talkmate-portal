'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download, Phone, Search } from 'lucide-react'
import Link from 'next/link'
import { DataTable } from '@/components/portal/ui-v2/data-table'
import { DetailPanel, StatGrid, HistoryRow } from '@/components/portal/ui-v2/detail-panel'
import { Chips } from '@/components/portal/ui-v2/chips'
import { ButtonV2 } from '@/components/portal/ui-v2/button'

// ─── Types ──────────────────────────────────────────────────────────────────

interface ContactRow {
  id: string
  name: string | null
  phone: string
  call_count: number | null
  last_seen: string | null
  first_seen: string | null
  tags: string[] | null
}

interface CallRecord {
  id: string
  call_id: string
  call_at: string
  duration_seconds: number | null
  outcome: string | null
  summary: string | null
  tags_applied: string[] | null
}

type ChipValue = 'all' | 'active' | 'new' | 'recurring'

const CHIPS: { value: ChipValue; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'new', label: 'New this month' },
  { value: 'recurring', label: 'Recurring' },
]

const TABLE_COLUMNS = [
  { key: 'customer', label: 'Customer', width: '1fr' },
  { key: 'phone', label: 'Phone', width: '140px' },
  { key: 'calls', label: 'Calls', width: '70px', align: 'right' as const },
  { key: 'lastContact', label: 'Last contact', width: '110px' },
  { key: 'status', label: 'Status', width: '90px' },
]

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatPhone(phone: string): string {
  const m = phone.match(/^\+61(\d{3})(\d{3})(\d{3})$/)
  if (m) return `+61 ${m[1]} ${m[2]} ${m[3]}`
  return phone
}

function timeAgo(iso: string | null): string {
  if (!iso) return '—'
  const diffMs = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diffMs / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d ago`
  if (d < 30) return `${Math.floor(d / 7)}w ago`
  return `${Math.floor(d / 30)}mo ago`
}

function fmtDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })
}

/** Derive status from real data: "active" within 30 days, "new" first_seen within 30 days, else "inactive" */
function deriveStatus(c: ContactRow): 'active' | 'new' | 'inactive' {
  const now = Date.now()
  const thirtyDays = 30 * 24 * 60 * 60 * 1000
  if (c.first_seen && now - new Date(c.first_seen).getTime() < thirtyDays) return 'new'
  if (c.last_seen && now - new Date(c.last_seen).getTime() < thirtyDays) return 'active'
  return 'inactive'
}

/** Gradient avatars from initials */
const AVATAR_GRADIENTS = [
  'linear-gradient(135deg,#2a5060,#1a3545)',
  'linear-gradient(135deg,#402850,#261538)',
  'linear-gradient(135deg,#1a4030,#0e2820)',
  'linear-gradient(135deg,#3a3020,#241e10)',
  'linear-gradient(135deg,#1a3050,#0e1e34)',
  'linear-gradient(135deg,#403020,#261e0e)',
  'linear-gradient(135deg,#2a3050,#1a1e34)',
]

function initials(name: string | null, phone: string): string {
  if (name) {
    const parts = name.trim().split(/\s+/)
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    return parts[0].slice(0, 2).toUpperCase()
  }
  return phone.slice(-2)
}

function avatarGradient(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0
  return AVATAR_GRADIENTS[Math.abs(h) % AVATAR_GRADIENTS.length]
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function ContactsListClient({
  initialContacts,
  totalCount,
}: {
  industry: string | null
  initialContacts: ContactRow[]
  totalCount: number
}) {
  const [contacts] = useState<ContactRow[]>(initialContacts)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [chip, setChip] = useState<ChipValue>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [panelCalls, setPanelCalls] = useState<CallRecord[]>([])
  const [panelLoading, setPanelLoading] = useState(false)

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim().toLowerCase()), 300)
    return () => clearTimeout(t)
  }, [search])

  // Filter contacts by chip + search
  const filtered = useMemo(() => {
    const now = Date.now()
    const thirtyDays = 30 * 24 * 60 * 60 * 1000
    return contacts.filter(c => {
      if (debouncedSearch) {
        const hay = `${c.name ?? ''} ${c.phone}`.toLowerCase()
        if (!hay.includes(debouncedSearch)) return false
      }
      if (chip === 'active') {
        if (!c.last_seen || now - new Date(c.last_seen).getTime() >= thirtyDays) return false
        // exclude "new" contacts from active bucket
        if (c.first_seen && now - new Date(c.first_seen).getTime() < thirtyDays) return false
      }
      if (chip === 'new') {
        if (!c.first_seen || now - new Date(c.first_seen).getTime() >= thirtyDays) return false
      }
      if (chip === 'recurring') {
        if ((c.call_count ?? 0) < 2) return false
      }
      return true
    })
  }, [contacts, debouncedSearch, chip])

  // Selected contact object
  const selectedContact = useMemo(
    () => contacts.find(c => c.id === selectedId) ?? null,
    [contacts, selectedId],
  )

  // Load call history when a contact is selected
  const loadCalls = useCallback(async (contactId: string) => {
    setPanelLoading(true)
    setPanelCalls([])
    try {
      const res = await fetch(`/api/contacts/${contactId}/calls`)
      if (res.ok) {
        const data = await res.json()
        setPanelCalls(data.calls ?? [])
      }
    } catch {
      // ignore fetch errors — history simply won't show
    } finally {
      setPanelLoading(false)
    }
  }, [])

  function handleRowClick(row: ContactRow) {
    setSelectedId(row.id)
    loadCalls(row.id)
  }

  // Chip counts
  const chipCounts = useMemo(() => {
    const now = Date.now()
    const thirtyDays = 30 * 24 * 60 * 60 * 1000
    return {
      all: contacts.length,
      active: contacts.filter(c => {
        if (!c.last_seen || now - new Date(c.last_seen).getTime() >= thirtyDays) return false
        if (c.first_seen && now - new Date(c.first_seen).getTime() < thirtyDays) return false
        return true
      }).length,
      new: contacts.filter(c => c.first_seen && now - new Date(c.first_seen).getTime() < thirtyDays).length,
      recurring: contacts.filter(c => (c.call_count ?? 0) >= 2).length,
    }
  }, [contacts])

  // Render table cell
  function renderCell(row: ContactRow, col: string) {
    const status = deriveStatus(row)
    switch (col) {
      case 'customer':
        return (
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-9 h-9 rounded-[10px] flex items-center justify-center text-[13px] font-bold flex-shrink-0 text-[#cfe0f2]"
              style={{ background: avatarGradient(row.id) }}
            >
              {initials(row.name, row.phone)}
            </div>
            <div className="min-w-0">
              <div className="text-[14px] font-bold truncate">
                {row.name ?? <span className="text-dim">Unknown caller</span>}
              </div>
            </div>
          </div>
        )
      case 'phone':
        return <span className="text-[13px] text-dim">{formatPhone(row.phone)}</span>
      case 'calls':
        return <span className="text-[14px] font-bold tabular-nums">{row.call_count ?? 0}</span>
      case 'lastContact':
        return <span className="text-[12px] text-dim">{timeAgo(row.last_seen)}</span>
      case 'status':
        return <StatusTag status={status} />
      default:
        return null
    }
  }

  // ── Panel content ──────────────────────────────────────────────────────────
  const panelHeader = selectedContact ? (
    <div className="flex gap-3.5 items-center p-[22px]">
      <div
        className="w-[52px] h-[52px] rounded-[14px] flex items-center justify-center text-[20px] font-extrabold flex-shrink-0 text-[#cfe0f2]"
        style={{ background: avatarGradient(selectedContact.id) }}
      >
        {initials(selectedContact.name, selectedContact.phone)}
      </div>
      <div>
        <div className="text-[18px] font-extrabold tracking-tight">
          {selectedContact.name ?? <span className="text-dim">Unknown caller</span>}
        </div>
        <div className="text-[13px] text-dim mt-[3px]">
          {formatPhone(selectedContact.phone)}
        </div>
      </div>
    </div>
  ) : null

  const memberMonths = selectedContact?.first_seen
    ? Math.max(0, Math.round((Date.now() - new Date(selectedContact.first_seen).getTime()) / (30 * 24 * 60 * 60 * 1000)))
    : null

  const panelStats = selectedContact
    ? [
        { value: selectedContact.call_count ?? 0, label: 'Total calls' },
        { value: memberMonths !== null ? `${memberMonths}mo` : '—', label: 'Member since' },
        { value: timeAgo(selectedContact.last_seen), label: 'Last contact' },
        { value: (selectedContact.tags ?? []).length || '—', label: 'Tags' },
      ]
    : []

  return (
    <div className="p-7 flex flex-col gap-5 h-full">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[10px] font-bold text-orange uppercase tracking-[.1em] mb-1.5">Your CRM</div>
          <h1 className="text-[1.55rem] font-extrabold tracking-tight">Contacts</h1>
          <p className="text-[13px] text-dim mt-1">
            {totalCount} total · captured automatically by TalkMate
          </p>
        </div>
        <Link href="/contacts/export">
          <ButtonV2 variant="secondary" className="gap-2 text-[13px]">
            <Download size={14} />
            Export CSV
          </ButtonV2>
        </Link>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Search */}
        <div className="relative flex-shrink-0 w-[260px]">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-faint pointer-events-none"
          />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or phone…"
            className="w-full pl-9 pr-3 py-[9px] bg-card border border-line rounded-[10px] text-[13.5px] text-text placeholder:text-faint outline-none focus:border-[rgba(238,106,44,.4)] transition"
          />
        </div>

        {/* Chips */}
        <Chips
          chips={CHIPS.map(c => ({ ...c, count: chipCounts[c.value] }))}
          value={chip}
          onChange={setChip}
        />
      </div>

      {/* Body: table + panel */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4 overflow-hidden">
        {/* Table area */}
        <div className="bg-card border border-line rounded-[var(--r)] overflow-hidden flex flex-col min-h-0">
          {filtered.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center py-12 text-center px-8">
              <div className="text-[32px] mb-3">👋</div>
              <div className="text-[15px] font-bold mb-2">
                {totalCount === 0 ? 'Your contact list is empty.' : 'No contacts match your filters.'}
              </div>
              <p className="text-[13px] text-dim max-w-[460px] leading-relaxed">
                {totalCount === 0
                  ? 'As TalkMate answers calls, contacts will appear here automatically. No data entry required.'
                  : 'Try widening your search or changing the filter.'}
              </p>
            </div>
          ) : (
            <DataTable
              columns={TABLE_COLUMNS}
              rows={filtered}
              renderCell={renderCell}
              getRowKey={r => r.id}
              selectedKey={selectedId ?? undefined}
              onRowClick={handleRowClick}
              className="flex-1"
            />
          )}
        </div>

        {/* Detail panel */}
        <div className="hidden lg:flex flex-col min-h-0">
          {selectedContact ? (
            <DetailPanel header={panelHeader} className="flex-1">
              {/* Stats grid */}
              <StatGrid stats={panelStats} />

              {/* Tags */}
              {(selectedContact.tags ?? []).length > 0 && (
                <div className="px-[18px] pb-[14px] border-b border-line">
                  <div className="text-[11px] font-bold uppercase tracking-[.08em] text-faint mb-2">Tags</div>
                  <div className="flex gap-1.5 flex-wrap">
                    {(selectedContact.tags ?? []).map(t => (
                      <span
                        key={t}
                        className="text-[10.5px] font-bold px-2.5 py-[4px] rounded-full bg-[rgba(74,159,232,.12)] text-blue capitalize"
                      >
                        {t.replace(/_/g, ' ')}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Call history */}
              <div className="px-[18px] py-4">
                <div className="text-[11px] font-bold uppercase tracking-[.08em] text-faint mb-3">
                  Call history
                </div>
                {panelLoading ? (
                  <div className="text-[13px] text-dim py-4 text-center">Loading…</div>
                ) : panelCalls.length === 0 ? (
                  <div className="text-[13px] text-dim py-4 text-center">No calls yet.</div>
                ) : (
                  panelCalls.slice(0, 8).map(call => (
                    <HistoryRow
                      key={call.id}
                      icon={<Phone size={14} color="rgba(240,120,50,1)" />}
                      iconColor="rgba(238,106,44,.14)"
                      title={call.summary ?? call.outcome?.replace(/_/g, ' ') ?? 'Call'}
                      meta={fmtDateTime(call.call_at)}
                    />
                  ))
                )}

                {/* Link to full contact page */}
                <Link
                  href={`/contacts/${selectedContact.id}`}
                  className="mt-4 flex items-center justify-center gap-2 text-[12.5px] font-semibold text-dim hover:text-text transition py-2.5 border border-line rounded-lg"
                >
                  View full profile →
                </Link>
              </div>
            </DetailPanel>
          ) : (
            /* Empty state for panel */
            <div className="flex-1 bg-card border border-line rounded-[var(--r)] flex flex-col items-center justify-center text-center p-8 gap-3">
              <div className="w-11 h-11 rounded-full bg-card-2 border border-line flex items-center justify-center">
                <Phone size={18} className="text-faint" />
              </div>
              <div className="text-[14px] font-bold">Select a contact</div>
              <p className="text-[12.5px] text-dim leading-relaxed max-w-[200px]">
                Click any row to see call history and details.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── StatusTag ───────────────────────────────────────────────────────────────

function StatusTag({ status }: { status: 'active' | 'new' | 'inactive' }) {
  if (status === 'active')
    return (
      <span className="inline-block text-[11.5px] font-bold px-[10px] py-[4px] rounded-[8px] bg-green-soft text-green">
        Active
      </span>
    )
  if (status === 'new')
    return (
      <span className="inline-block text-[11.5px] font-bold px-[10px] py-[4px] rounded-[8px] bg-[rgba(238,106,44,.14)] text-orange">
        New
      </span>
    )
  return (
    <span className="inline-block text-[11.5px] font-bold px-[10px] py-[4px] rounded-[8px] bg-white/[.06] text-dim">
      Inactive
    </span>
  )
}
