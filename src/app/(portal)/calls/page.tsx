'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useBusinessType } from '@/context/business-type-context'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Phone, Clock, Download, Flag, ChevronLeft, ChevronRight } from 'lucide-react'

interface Call {
  id: string; caller_number: string; outcome: string; transferred: boolean
  duration_seconds: number; transcript: string; recording_url: string
  flagged: boolean; created_at: string
}

const PAGE_SIZE = 20

export default function CallsPage() {
  const { config, businessId } = useBusinessType()
  const supabase = createClient()
  const [calls, setCalls] = useState<Call[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Call | null>(null)
  const [filters, setFilters] = useState({ outcome: '', transferred: '', search: '' })

  const fetchCalls = useCallback(async () => {
    setLoading(true)
    let query = supabase.from('calls').select('*', { count: 'exact' })
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)
    if (filters.outcome) query = query.eq('outcome', filters.outcome)
    if (filters.transferred === 'true') query = query.eq('transferred', true)
    if (filters.search) query = query.ilike('caller_number', `%${filters.search}%`)
    const { data, count } = await query
    setCalls(data ?? [])
    setTotal(count ?? 0)
    setLoading(false)
  }, [businessId, page, filters])

  useEffect(() => { fetchCalls() }, [fetchCalls])

  function exportCSV() {
    const headers = ['Time', 'Caller', 'Duration', 'Outcome', 'Transferred']
    const rows = calls.map(c => [
      new Date(c.created_at).toLocaleString('en-AU'),
      c.caller_number, formatDuration(c.duration_seconds), c.outcome, c.transferred ? 'Yes' : 'No'
    ])
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
    a.download = `calls-${new Date().toISOString().split('T')[0]}.csv`; a.click()
  }

  async function flagCall(id: string, flagged: boolean) {
    await supabase.from('calls').update({ flagged: !flagged }).eq('id', id)
    setCalls(prev => prev.map(c => c.id === id ? { ...c, flagged: !flagged } : c))
    if (selected?.id === id) setSelected(s => s ? { ...s, flagged: !flagged } : null)
  }

  function formatDuration(s: number) {
    if (!s) return '—'
    return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`
  }

  function outcomeBadge(outcome: string) {
    if (!outcome || outcome === 'Missed') return 'destructive' as const
    if (outcome.includes('Transfer')) return 'secondary' as const
    return 'default' as const
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Call Log</h1>
          <p className="text-sm mt-1" style={{ color: '#4A7FBB' }}>{total} total calls</p>
        </div>
        <Button onClick={exportCSV} variant="outline" size="sm" className="gap-2" style={{ borderColor: 'rgba(255,255,255,0.1)', color: '#4A9FE8' }}>
          <Download size={14} /> Export CSV
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-6 flex-wrap">
        <Input placeholder="Search caller…" value={filters.search}
          onChange={e => { setFilters(f => ({ ...f, search: e.target.value })); setPage(0) }}
          style={{ background: '#0A1E38', border: '1px solid rgba(255,255,255,0.1)', color: 'white', width: 200 }} />
        <Select onValueChange={v => { setFilters(f => ({ ...f, outcome: v === 'all' ? '' : v })); setPage(0) }}>
          <SelectTrigger style={{ background: '#0A1E38', border: '1px solid rgba(255,255,255,0.1)', color: 'white', width: 180 }}>
            <SelectValue placeholder="All outcomes" />
          </SelectTrigger>
          <SelectContent style={{ background: '#0A1E38', border: '1px solid rgba(255,255,255,0.1)' }}>
            <SelectItem value="all">All outcomes</SelectItem>
            {config.callOutcomeTypes.map(o => <SelectItem key={o} value={o} style={{ color: 'white' }}>{o}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select onValueChange={v => { setFilters(f => ({ ...f, transferred: v === 'all' ? '' : v })); setPage(0) }}>
          <SelectTrigger style={{ background: '#0A1E38', border: '1px solid rgba(255,255,255,0.1)', color: 'white', width: 160 }}>
            <SelectValue placeholder="All calls" />
          </SelectTrigger>
          <SelectContent style={{ background: '#0A1E38', border: '1px solid rgba(255,255,255,0.1)' }}>
            <SelectItem value="all">All calls</SelectItem>
            <SelectItem value="true" style={{ color: 'white' }}>Transferred only</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        <table className="w-full text-sm">
          <thead style={{ background: '#071829' }}>
            <tr>
              {['Time', 'Caller', 'Duration', 'Outcome', 'Transferred', ''].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: '#4A7FBB' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="text-center py-12" style={{ color: '#4A7FBB' }}>Loading…</td></tr>
            ) : calls.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-12" style={{ color: '#4A7FBB' }}>No calls found</td></tr>
            ) : calls.map((call, i) => (
              <tr key={call.id} onClick={() => setSelected(call)}
                className="cursor-pointer transition-colors border-t"
                style={{ background: i % 2 === 0 ? '#0A1E38' : '#071829', borderColor: 'rgba(255,255,255,0.04)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(232,98,42,0.06)')}
                onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? '#0A1E38' : '#071829')}>
                <td className="px-4 py-3" style={{ color: '#7BAED4' }}>
                  {new Date(call.created_at).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </td>
                <td className="px-4 py-3 font-medium text-white">
                  <div className="flex items-center gap-2">
                    <Phone size={13} style={{ color: '#4A7FBB' }} />
                    {call.caller_number || 'Unknown'}
                    {call.flagged && <Flag size={12} style={{ color: '#f59e0b' }} />}
                  </div>
                </td>
                <td className="px-4 py-3" style={{ color: '#7BAED4' }}>
                  <div className="flex items-center gap-1"><Clock size={13} />{formatDuration(call.duration_seconds)}</div>
                </td>
                <td className="px-4 py-3">
                  <Badge variant={outcomeBadge(call.outcome)}>{call.outcome || '—'}</Badge>
                </td>
                <td className="px-4 py-3">
                  {call.transferred ? <span style={{ color: '#f59e0b' }}>↗ Yes</span> : <span style={{ color: '#4A7FBB' }}>No</span>}
                </td>
                <td className="px-4 py-3">
                  <button onClick={e => { e.stopPropagation(); flagCall(call.id, call.flagged) }}
                    style={{ color: call.flagged ? '#f59e0b' : '#4A7FBB' }}>
                    <Flag size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm" style={{ color: '#4A7FBB' }}>Page {page + 1} of {totalPages}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage(p => p - 1)} disabled={page === 0}
              style={{ borderColor: 'rgba(255,255,255,0.1)', color: '#4A9FE8' }}><ChevronLeft size={14} /></Button>
            <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page >= totalPages - 1}
              style={{ borderColor: 'rgba(255,255,255,0.1)', color: '#4A9FE8' }}><ChevronRight size={14} /></Button>
          </div>
        </div>
      )}

      {/* Side drawer */}
      <Sheet open={!!selected} onOpenChange={o => !o && setSelected(null)}>
        <SheetContent style={{ background: '#0A1E38', borderColor: 'rgba(255,255,255,0.1)', color: 'white', width: '500px' }}>
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle className="text-white">Call Detail</SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  {[
                    ['Caller', selected.caller_number || 'Unknown'],
                    ['Duration', formatDuration(selected.duration_seconds)],
                    ['Outcome', selected.outcome || '—'],
                    ['Transferred', selected.transferred ? 'Yes' : 'No'],
                    ['Time', new Date(selected.created_at).toLocaleString('en-AU')],
                  ].map(([l, v]) => (
                    <div key={l} className="p-3 rounded-lg" style={{ background: '#071829' }}>
                      <p className="text-xs mb-1" style={{ color: '#4A7FBB' }}>{l}</p>
                      <p className="font-semibold text-white text-sm">{v}</p>
                    </div>
                  ))}
                </div>
                {selected.recording_url && (
                  <div>
                    <p className="text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: '#4A7FBB' }}>Recording</p>
                    <audio controls src={selected.recording_url} className="w-full" style={{ accentColor: '#E8622A' }} />
                  </div>
                )}
                {selected.transcript && (
                  <div>
                    <p className="text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: '#4A7FBB' }}>Transcript</p>
                    <div className="p-3 rounded-lg text-sm leading-relaxed max-h-64 overflow-y-auto" style={{ background: '#071829', color: '#7BAED4' }}>
                      {selected.transcript}
                    </div>
                  </div>
                )}
                <Button onClick={() => flagCall(selected.id, selected.flagged)} variant="outline" className="w-full gap-2"
                  style={{ borderColor: selected.flagged ? '#f59e0b' : 'rgba(255,255,255,0.1)', color: selected.flagged ? '#f59e0b' : '#4A7FBB' }}>
                  <Flag size={14} />{selected.flagged ? 'Remove Flag' : 'Flag for Review'}
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
