'use client'

// /admin/audit-log — Session 11.
//
// Lists admin_audit_log entries with filters by business name, action,
// and date range. Default view: last 50 entries, newest first.
//
// The page is admin-gated client-side (we re-check role on mount and
// kick non-admins to /dashboard) but the data read goes through
// /api/admin/audit-log so the service-role query is gated server-side.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface AuditRow {
  id: string
  admin_email: string
  action: string
  business_id: string | null
  business_name: string | null
  before_value: Record<string, unknown> | null
  after_value: Record<string, unknown> | null
  ip_address: string | null
  created_at: string
}

const ACTION_OPTIONS = [
  '', 'client_created', 'client_updated', 'plan_changed',
  'account_status_changed', 'trial_started', 'trial_converted',
  'trial_ended', 'trial_extended', 'trial_reactivated',
  'dispatch_toggled', 'dispatch_config_updated',
  'team_member_added', 'team_member_updated', 'team_member_removed',
  'data_retention_purge', 'data_retention_dry_run',
]

export default function AuditLogPage() {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()
  const [rows, setRows] = useState<AuditRow[]>([])
  const [loading, setLoading] = useState(true)
  const [authChecked, setAuthChecked] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)

  // Filters
  const [businessQuery, setBusinessQuery] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  // Admin gate. Server gates the data API too — this is just to spare
  // non-admins a useless page render.
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
      const isAdmin = profile?.role === 'admin'
      // Set ADMIN_EMAIL/INTERNAL_ALERT_EMAIL in Vercel environment variables.
      // This is client-side so we only check 'hello@' literal here; the
      // /api/admin/audit-log route enforces the full allowlist server-side.
      const isSuperAdmin = user.email === 'hello@talkmate.com.au'
      if (!isAdmin && !isSuperAdmin) { router.push('/dashboard'); return }
      setAuthChecked(true)
    })()
  }, [supabase, router])

  const load = useCallback(async () => {
    setLoading(true)
    const qs = new URLSearchParams()
    if (businessQuery.trim()) qs.set('business', businessQuery.trim())
    if (actionFilter) qs.set('action', actionFilter)
    if (fromDate) qs.set('from', fromDate)
    if (toDate) qs.set('to', toDate)
    qs.set('limit', '50')
    const res = await fetch(`/api/admin/audit-log?${qs.toString()}`)
    const data = await res.json()
    setRows(data.rows ?? [])
    setLoading(false)
  }, [businessQuery, actionFilter, fromDate, toDate])

  useEffect(() => { if (authChecked) load() }, [authChecked, load])

  if (!authChecked) return null

  return (
    <div style={{ padding: 28, maxWidth: 1180, margin: '0 auto' }}>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: 'white', margin: 0, marginBottom: 6 }}>Admin audit log</h1>
        <p style={{ color: '#7BAED4', fontSize: 14, margin: 0 }}>
          Every action a TalkMate admin takes on a client account is recorded here.
        </p>
      </header>

      {/* Filters */}
      <div style={{ background: '#0A1E38', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: 16, marginBottom: 20, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, alignItems: 'end' }}>
        <Field label="Business name">
          <input value={businessQuery} onChange={e => setBusinessQuery(e.target.value)}
            placeholder="Filter by name…" style={inp} />
        </Field>
        <Field label="Action">
          <select value={actionFilter} onChange={e => setActionFilter(e.target.value)} style={inp}>
            {ACTION_OPTIONS.map(a => <option key={a} value={a}>{a || 'All actions'}</option>)}
          </select>
        </Field>
        <Field label="From">
          <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} style={inp} />
        </Field>
        <Field label="To">
          <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} style={inp} />
        </Field>
        <button onClick={load} style={{ padding: '10px 16px', background: '#E8622A', color: 'white', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
          Apply filters
        </button>
      </div>

      {/* Table */}
      <div style={{ background: '#0A1E38', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, overflow: 'hidden' }}>
        {loading ? (
          <p style={{ color: '#7BAED4', fontSize: 13, padding: 20 }}>Loading…</p>
        ) : rows.length === 0 ? (
          <p style={{ color: '#4A7FBB', fontSize: 13, padding: 20, fontStyle: 'italic' }}>No matching entries.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#071829', textAlign: 'left', color: '#4A7FBB', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  <th style={th}>When</th>
                  <th style={th}>Admin</th>
                  <th style={th}>Action</th>
                  <th style={th}>Business</th>
                  <th style={th}>Details</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <RowItem key={r.id} row={r} expanded={expanded === r.id} onToggle={() => setExpanded(expanded === r.id ? null : r.id)} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function RowItem({ row, expanded, onToggle }: { row: AuditRow; expanded: boolean; onToggle: () => void }) {
  return (
    <>
      <tr style={{ borderTop: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer' }} onClick={onToggle}>
        <td style={td}>{fmtDate(row.created_at)}</td>
        <td style={td}>{row.admin_email}</td>
        <td style={td}><code style={{ fontSize: 11, padding: '2px 6px', background: 'rgba(74,159,232,0.1)', color: '#4A9FE8', borderRadius: 4 }}>{row.action}</code></td>
        <td style={td}>{row.business_name ?? '—'}</td>
        <td style={{ ...td, color: '#4A9FE8' }}>{expanded ? '▼ Hide' : '▶ Show'}</td>
      </tr>
      {expanded && (
        <tr style={{ background: '#061322' }}>
          <td colSpan={5} style={{ padding: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <DiffBlock label="Before" value={row.before_value} />
              <DiffBlock label="After" value={row.after_value} />
            </div>
            {row.ip_address && (
              <p style={{ fontSize: 11, color: '#4A7FBB', margin: '10px 0 0 0' }}>IP: {row.ip_address}</p>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

function DiffBlock({ label, value }: { label: string; value: Record<string, unknown> | null }) {
  if (!value || Object.keys(value).length === 0) {
    return (
      <div>
        <div style={{ fontSize: 11, color: '#4A7FBB', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{label}</div>
        <p style={{ fontSize: 12, color: '#4A7FBB', fontStyle: 'italic', margin: 0 }}>—</p>
      </div>
    )
  }
  return (
    <div>
      <div style={{ fontSize: 11, color: '#4A7FBB', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{label}</div>
      <pre style={{ fontSize: 11, background: '#0A1E38', padding: 10, borderRadius: 6, color: '#C8D8EA', margin: 0, overflow: 'auto', maxHeight: 280 }}>
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, color: '#4A7FBB', fontWeight: 600, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</label>
      {children}
    </div>
  )
}

const inp: React.CSSProperties = {
  width: '100%', padding: '8px 10px', background: '#071829',
  border: '1px solid rgba(255,255,255,0.08)', color: 'white',
  borderRadius: 7, fontSize: 13, outline: 'none', boxSizing: 'border-box',
  fontFamily: 'Outfit, sans-serif',
}
const th: React.CSSProperties = { padding: '10px 12px', fontWeight: 700 }
const td: React.CSSProperties = { padding: '10px 12px', color: '#C8D8EA', verticalAlign: 'top' }

function fmtDate(s: string): string {
  try {
    return new Date(s).toLocaleString('en-AU', { dateStyle: 'short', timeStyle: 'short' })
  } catch {
    return s
  }
}
