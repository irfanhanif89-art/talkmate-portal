'use client'

import { useEffect, useMemo, useState } from 'react'

interface QuoteRow {
  id: string
  call_id: string | null
  caller_phone: string | null
  pickup_address: string | null
  dropoff_address: string | null
  distance_km: number | null
  duration_minutes: number | null
  truck_type: string | null
  rate_type: string | null
  base_price: number | null
  addons: Array<{ name: string; price: number; quantity: number }> | null
  total_price: number | null
  is_poa: boolean
  status: 'given' | 'accepted' | 'declined' | 'expired'
  quote_valid_until: string | null
  created_at: string
}

interface Stats {
  total: number
  accepted: number
  declined: number
  avg_distance_km: number
}

interface Props {
  adminClientId?: string | null
}

function listUrl(adminClientId: string | null | undefined): string {
  if (adminClientId) return `/api/admin/businesses/${encodeURIComponent(adminClientId)}/quotes`
  return '/api/portal/quotes'
}

function patchUrl(adminClientId: string | null | undefined, quoteId: string): string {
  if (adminClientId) return `/api/admin/businesses/${encodeURIComponent(adminClientId)}/quotes/${encodeURIComponent(quoteId)}`
  return `/api/portal/quotes/${encodeURIComponent(quoteId)}`
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('en-AU', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  })
}

function truckLabel(t: string | null): string {
  switch (t) {
    case 'loaded_tilt_tray': return 'Loaded Tilt Tray'
    case 'empty_tilt_tray': return 'Empty Tilt Tray'
    case 'sideloader_40ft': return 'Sideloader 40ft'
    default: return t ?? '—'
  }
}

function statusBadge(status: QuoteRow['status']) {
  const map: Record<QuoteRow['status'], { bg: string; color: string; label: string }> = {
    given: { bg: 'rgba(120,144,156,0.18)', color: '#90A4AE', label: 'Given' },
    accepted: { bg: 'rgba(34,197,94,0.18)', color: '#22C55E', label: 'Accepted' },
    declined: { bg: 'rgba(239,68,68,0.18)', color: '#EF4444', label: 'Declined' },
    expired: { bg: 'rgba(245,158,11,0.18)', color: '#F59E0B', label: 'Expired' },
  }
  const s = map[status]
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 99, background: s.bg, color: s.color }}>
      {s.label}
    </span>
  )
}

export default function QuotesLogView({ adminClientId }: Props) {
  const [quotes, setQuotes] = useState<QuoteRow[]>([])
  const [stats, setStats] = useState<Stats>({ total: 0, accepted: 0, declined: 0, avg_distance_km: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openMenu, setOpenMenu] = useState<string | null>(null)

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(listUrl(adminClientId))
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'Could not load quotes')
      setQuotes(data.quotes ?? [])
      setStats(data.stats ?? { total: 0, accepted: 0, declined: 0, avg_distance_km: 0 })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function setStatus(id: string, status: QuoteRow['status']) {
    setOpenMenu(null)
    const prior = quotes.find(q => q.id === id)
    setQuotes(qs => qs.map(q => q.id === id ? { ...q, status } : q))
    try {
      const res = await fetch(patchUrl(adminClientId, id), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) throw new Error()
    } catch {
      // Revert on failure
      if (prior) setQuotes(qs => qs.map(q => q.id === id ? prior : q))
    }
  }

  const StatCard = useMemo(() => function StatCard({ label, value, color }: { label: string; value: string | number; color?: string }) {
    return (
      <div style={{ background: '#0A1E38', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, padding: '14px 18px', flex: 1, minWidth: 180 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#4A7FBB', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{label}</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: color ?? 'white' }}>{value}</div>
      </div>
    )
  }, [])

  return (
    <div style={{ padding: 32, maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'white', marginBottom: 4 }}>Quote Log</h1>
        <p style={{ fontSize: 13, color: '#7BAED4', margin: 0 }}>Every quote your agent has given callers.</p>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' as const, marginBottom: 24 }}>
        <StatCard label="Quotes this month" value={stats.total} />
        <StatCard label="Accepted" value={stats.accepted} color="#22C55E" />
        <StatCard label="Declined" value={stats.declined} color="#EF4444" />
        <StatCard label="Avg distance" value={`${stats.avg_distance_km}km`} />
      </div>

      {error && (
        <div style={{ padding: '12px 16px', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, color: '#FCA5A5', marginBottom: 16 }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ color: '#7BAED4' }}>Loading quotes…</div>
      ) : quotes.length === 0 ? (
        <div style={{ padding: '40px 24px', background: '#0A1E38', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: 14, textAlign: 'center' as const }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'white', marginBottom: 6 }}>No quotes yet</div>
          <div style={{ fontSize: 13, color: '#7BAED4' }}>When your agent gives a caller a quote, it will appear here.</div>
        </div>
      ) : (
        <div style={{ background: '#0A1E38', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' as const }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, color: '#C8D8EA' }}>
              <thead>
                <tr style={{ background: '#071829' }}>
                  {['Date / Time', 'Caller', 'Pickup', 'Dropoff', 'Distance', 'Truck Type', 'Rate', 'Total', 'Status', ''].map(h => (
                    <th key={h} style={{ textAlign: 'left' as const, padding: '12px 14px', fontSize: 11, fontWeight: 700, color: '#4A7FBB', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {quotes.map(q => (
                  <tr key={q.id} style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' as const, color: 'white' }}>{formatDateTime(q.created_at)}</td>
                    <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' as const }}>{q.caller_phone ?? '—'}</td>
                    <td style={{ padding: '12px 14px', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }} title={q.pickup_address ?? ''}>{q.pickup_address ?? '—'}</td>
                    <td style={{ padding: '12px 14px', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }} title={q.dropoff_address ?? ''}>{q.dropoff_address ?? '—'}</td>
                    <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' as const }}>{q.distance_km != null ? `${q.distance_km}km` : '—'}</td>
                    <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' as const }}>{truckLabel(q.truck_type)}</td>
                    <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' as const, textTransform: 'capitalize' as const }}>{q.rate_type ?? '—'}</td>
                    <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' as const, fontWeight: 700, color: q.is_poa ? '#F59E0B' : 'white' }}>
                      {q.is_poa ? 'POA' : q.total_price != null ? `$${q.total_price}` : '—'}
                    </td>
                    <td style={{ padding: '12px 14px' }}>{statusBadge(q.status)}</td>
                    <td style={{ padding: '12px 14px', position: 'relative' as const }}>
                      <button
                        onClick={() => setOpenMenu(openMenu === q.id ? null : q.id)}
                        style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#7BAED4', padding: '5px 10px', fontSize: 12, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}
                      >Actions ▾</button>
                      {openMenu === q.id && (
                        <div style={{ position: 'absolute' as const, top: '100%', right: 14, marginTop: 4, background: '#071829', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: 6, zIndex: 5, minWidth: 170, boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
                          <MenuItem onClick={() => setStatus(q.id, 'accepted')}>Mark Accepted</MenuItem>
                          <MenuItem onClick={() => setStatus(q.id, 'declined')}>Mark Declined</MenuItem>
                          <MenuItem onClick={() => setStatus(q.id, 'given')}>Reset to Given</MenuItem>
                          {q.call_id && (
                            <MenuItem onClick={() => { setOpenMenu(null); window.location.href = adminClientId ? `/admin/clients/${adminClientId}/portal/calls` : '/calls' }}>View Call</MenuItem>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function MenuItem({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'block', width: '100%', textAlign: 'left' as const,
        background: 'transparent', border: 'none', color: '#C8D8EA',
        padding: '8px 12px', fontSize: 13, cursor: 'pointer',
        borderRadius: 6, fontFamily: 'Outfit, sans-serif',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      {children}
    </button>
  )
}
