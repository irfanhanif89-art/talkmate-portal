'use client'

import { useCallback, useEffect, useState } from 'react'
import { STATUS_LABEL, JOB_TYPE_LABEL, type DispatchJobStatus } from '@/lib/dispatch-types'

interface JobRow {
  id: string
  job_number: string | null
  job_type: string
  status: DispatchJobStatus
  pickup_address: string
  dropoff_address: string | null
  customer_name: string | null
  driver_id: string | null
  payment_type: string | null
  final_amount: number | string | null
  quoted_amount: number | string | null
  created_at: string
  completed_at: string | null
}

const ALL_STATUSES: DispatchJobStatus[] = [
  'created','driver_notified','accepted','declined','en_route','on_scene',
  'loaded','in_transit','at_dropoff','completed','invoiced','paid','cancelled',
]

export function JobsTab() {
  const [filters, setFilters] = useState({
    status: '', job_type: '', search: '',
  })
  const [jobs, setJobs] = useState<JobRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)

  const refetch = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (filters.status) params.set('status', filters.status)
    if (filters.job_type) params.set('job_type', filters.job_type)
    if (filters.search) params.set('search', filters.search)
    const res = await fetch(`/api/dispatch/jobs?${params}`)
    const data = await res.json()
    if (data.ok) {
      setJobs(data.jobs as JobRow[])
      setTotal(data.total)
    }
    setLoading(false)
  }, [filters])

  useEffect(() => { refetch() }, [refetch])

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <select
          value={filters.status}
          onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}
          style={selectStyle}
        >
          <option value="">All statuses</option>
          {ALL_STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
        <select
          value={filters.job_type}
          onChange={e => setFilters(f => ({ ...f, job_type: e.target.value }))}
          style={selectStyle}
        >
          <option value="">All types</option>
          {Object.entries(JOB_TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <input
          placeholder="Search job, customer, rego, address…"
          value={filters.search}
          onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
          style={{ ...selectStyle, flex: 1, minWidth: 200 }}
        />
      </div>

      <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 10 }}>
        {loading ? 'Loading…' : `${total} job${total === 1 ? '' : 's'}`}
      </div>

      <div style={{ overflowX: 'auto', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.05)', color: '#94a3b8', textAlign: 'left' }}>
              <th style={th}>Job</th>
              <th style={th}>Date</th>
              <th style={th}>Type</th>
              <th style={th}>Pickup</th>
              <th style={th}>Customer</th>
              <th style={th}>Status</th>
              <th style={{ ...th, textAlign: 'right' }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map(j => (
              <tr key={j.id} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                <td style={td}>{j.job_number}</td>
                <td style={td}>{new Date(j.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}</td>
                <td style={td}>{JOB_TYPE_LABEL[j.job_type as keyof typeof JOB_TYPE_LABEL] ?? j.job_type}</td>
                <td style={{ ...td, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.pickup_address}</td>
                <td style={td}>{j.customer_name ?? '—'}</td>
                <td style={td}>
                  <span style={{ background: 'rgba(255,255,255,0.08)', padding: '2px 8px', borderRadius: 4, fontSize: 11, textTransform: 'uppercase' }}>
                    {STATUS_LABEL[j.status]}
                  </span>
                </td>
                <td style={{ ...td, textAlign: 'right' }}>
                  {j.final_amount != null
                    ? `$${Number(j.final_amount).toFixed(0)}`
                    : j.quoted_amount != null
                      ? `~$${Number(j.quoted_amount).toFixed(0)}`
                      : '—'}
                </td>
              </tr>
            ))}
            {jobs.length === 0 && !loading && (
              <tr>
                <td colSpan={7} style={{ ...td, textAlign: 'center', color: '#64748b', padding: '32px 12px' }}>
                  No jobs match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const selectStyle: React.CSSProperties = {
  padding: '10px 12px',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.1)',
  color: '#F2F6FB',
  borderRadius: 8,
  fontSize: 13,
  fontFamily: 'inherit',
}

const th: React.CSSProperties = { padding: '10px 12px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }
const td: React.CSSProperties = { padding: '10px 12px' }
