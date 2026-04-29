'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Search, Upload, Download, ChevronRight } from 'lucide-react'

interface ContactRow {
  id: string
  name: string | null
  phone: string
  call_count: number | null
  last_seen: string | null
  first_seen: string | null
  tags: string[] | null
}

const RECENCY_FILTERS: Array<{ key: string; label: string; days: number | null }> = [
  { key: 'all', label: 'All time', days: null },
  { key: 'today', label: 'Today', days: 1 },
  { key: 'week', label: 'This week', days: 7 },
  { key: 'month', label: 'This month', days: 30 },
]

const COUNT_FILTERS: Array<{ key: string; label: string; min: number; max: number }> = [
  { key: 'any', label: 'Any', min: 0, max: 999 },
  { key: '1', label: '1 call', min: 1, max: 1 },
  { key: '2-5', label: '2-5 calls', min: 2, max: 5 },
  { key: '5+', label: '5+ calls', min: 5, max: 999 },
]

function formatPhone(phone: string): string {
  const m = phone.match(/^\+61(\d{3})(\d{3})(\d{3})$/)
  if (m) return `+61 ${m[1]} ${m[2]} ${m[3]}`
  return phone
}

function timeAgo(iso: string | null): string {
  if (!iso) return '—'
  const diffMs = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diffMs / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d ago`
  if (d < 30) return `${Math.floor(d / 7)}w ago`
  return `${Math.floor(d / 30)}mo ago`
}

function tagColor(tag: string): { bg: string; color: string } {
  const palette: Record<string, { bg: string; color: string }> = {
    new_caller: { bg: 'rgba(34,197,94,0.12)', color: '#22C55E' },
    repeat_caller: { bg: 'rgba(74,159,232,0.12)', color: '#4A9FE8' },
    complaint: { bg: 'rgba(239,68,68,0.12)', color: '#EF4444' },
    vip_potential: { bg: 'rgba(245,158,11,0.12)', color: '#F59E0B' },
    upsell_accepted: { bg: 'rgba(34,197,94,0.12)', color: '#22C55E' },
    after_hours: { bg: 'rgba(139,92,246,0.12)', color: '#8B5CF6' },
  }
  return palette[tag] ?? { bg: 'rgba(255,255,255,0.06)', color: '#7BAED4' }
}

export default function ContactsListClient({ initialContacts, totalCount }: {
  industry: string | null
  initialContacts: ContactRow[]
  totalCount: number
}) {
  const router = useRouter()
  const [contacts] = useState<ContactRow[]>(initialContacts)
  const [search, setSearch] = useState('')
  const [recency, setRecency] = useState('all')
  const [countFilter, setCountFilter] = useState('any')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim().toLowerCase()), 300)
    return () => clearTimeout(t)
  }, [search])

  const filtered = useMemo(() => {
    const recencyDef = RECENCY_FILTERS.find(r => r.key === recency)
    const countDef = COUNT_FILTERS.find(c => c.key === countFilter)
    const recencyCutoff = recencyDef?.days ? Date.now() - recencyDef.days * 24 * 60 * 60 * 1000 : null
    return contacts.filter(c => {
      if (debouncedSearch) {
        const haystack = `${c.name ?? ''} ${c.phone}`.toLowerCase()
        if (!haystack.includes(debouncedSearch)) return false
      }
      if (recencyCutoff !== null && (!c.last_seen || new Date(c.last_seen).getTime() < recencyCutoff)) return false
      if (countDef) {
        const cc = c.call_count ?? 0
        if (cc < countDef.min || cc > countDef.max) return false
      }
      return true
    })
  }, [contacts, debouncedSearch, recency, countFilter])

  const maxCalls = useMemo(() => Math.max(1, ...contacts.map(c => c.call_count ?? 0)), [contacts])

  return (
    <div style={{ padding: 28, color: '#F2F6FB' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#E8622A', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Your CRM</div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'white', margin: 0 }}>Contacts</h1>
          <p style={{ fontSize: 13, color: '#7BAED4', marginTop: 4 }}>{totalCount} total · captured automatically by TalkMate</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Link href="/contacts/smart-lists" style={btn('ghost')}>Smart lists</Link>
          <Link href="/contacts/import" style={btn('ghost')}><Upload size={14} /> Import</Link>
          <Link href="/contacts/export" style={btn('orange')}><Download size={14} /> Export CSV</Link>
        </div>
      </div>

      <div style={{
        background: '#0A1E38', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, padding: 14,
        display: 'grid', gridTemplateColumns: 'minmax(220px, 1fr) auto auto', gap: 10, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' as const,
      }}>
        <div style={{ position: 'relative' }}>
          <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#4A7FBB' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or phone…"
            style={{
              width: '100%', padding: '10px 14px 10px 36px',
              background: '#071829', border: '1px solid rgba(255,255,255,0.08)', color: 'white',
              borderRadius: 9, fontFamily: 'Outfit, sans-serif', fontSize: 14, outline: 'none',
            }}
          />
        </div>
        <select value={recency} onChange={e => setRecency(e.target.value)} style={selectStyle}>
          {RECENCY_FILTERS.map(r => <option key={r.key} value={r.key} style={{ background: '#0A1E38' }}>Last contact: {r.label}</option>)}
        </select>
        <select value={countFilter} onChange={e => setCountFilter(e.target.value)} style={selectStyle}>
          {COUNT_FILTERS.map(c => <option key={c.key} value={c.key} style={{ background: '#0A1E38' }}>Calls: {c.label}</option>)}
        </select>
      </div>

      <div style={{ background: '#0A1E38', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, overflow: 'hidden' }}>
        {filtered.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>👋</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'white', marginBottom: 6 }}>
              {totalCount === 0 ? 'Your contact list is empty.' : 'No contacts match your filters.'}
            </div>
            <p style={{ fontSize: 13, color: '#7BAED4', maxWidth: 460, margin: '0 auto', lineHeight: 1.6 }}>
              {totalCount === 0
                ? 'As TalkMate answers calls, contacts will appear here automatically. No data entry required.'
                : 'Try widening your search or recency filter.'}
            </p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' as const }}>
            <thead style={{ background: '#071829' }}>
              <tr>
                {['Contact', 'Phone', 'Calls', 'Last contact', 'Tags', ''].map(h => (
                  <th key={h} style={{ padding: '12px 18px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#7BAED4', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((c, i) => {
                const cc = c.call_count ?? 0
                const tagsToShow = (c.tags ?? []).slice(0, 2)
                const more = (c.tags?.length ?? 0) - tagsToShow.length
                return (
                  <tr
                    key={c.id}
                    onClick={() => router.push(`/contacts/${c.id}`)}
                    style={{ cursor: 'pointer', borderTop: i > 0 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '14px 18px', fontSize: 14, fontWeight: 600, color: 'white' }}>
                      {c.name || <span style={{ color: '#7BAED4' }}>Unknown caller</span>}
                    </td>
                    <td style={{ padding: '14px 18px', fontSize: 13, color: '#7BAED4' }}>{formatPhone(c.phone)}</td>
                    <td style={{ padding: '14px 18px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: 'white' }}>{cc}</span>
                        <div style={{ width: 60, height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
                          <div style={{ width: `${(cc / maxCalls) * 100}%`, height: '100%', background: '#E8622A', borderRadius: 2 }} />
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '14px 18px', fontSize: 12, color: '#7BAED4' }}>{timeAgo(c.last_seen)}</td>
                    <td style={{ padding: '14px 18px' }}>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' as const }}>
                        {tagsToShow.map(t => {
                          const color = tagColor(t)
                          return (
                            <span key={t} style={{
                              fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 99,
                              background: color.bg, color: color.color, textTransform: 'capitalize' as const,
                            }}>{t.replace(/_/g, ' ')}</span>
                          )
                        })}
                        {more > 0 && (
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 99, background: 'rgba(255,255,255,0.06)', color: '#7BAED4' }}>+{more}</span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                      <ChevronRight size={16} color="#4A7FBB" />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

const selectStyle: React.CSSProperties = {
  background: '#071829', border: '1px solid rgba(255,255,255,0.08)', color: 'white',
  borderRadius: 9, padding: '10px 12px', fontFamily: 'Outfit, sans-serif', fontSize: 13, outline: 'none', cursor: 'pointer',
}

function btn(variant: 'orange' | 'ghost'): React.CSSProperties {
  const base: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '10px 16px', borderRadius: 9, fontSize: 13, fontWeight: 600,
    cursor: 'pointer', textDecoration: 'none', fontFamily: 'Outfit, sans-serif',
  }
  if (variant === 'orange') return { ...base, background: '#E8622A', color: 'white', border: 'none', fontWeight: 700 }
  return { ...base, background: 'transparent', color: '#4A9FE8', border: '1px solid rgba(74,159,232,0.3)' }
}
