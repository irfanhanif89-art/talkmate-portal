'use client'

import { useEffect, useState } from 'react'

interface Totals {
  clients_using_dispatcher: number
  drivers_online: number
  active_jobs_right_now: number
  jobs_today: number
}
interface BusinessRow {
  id: string
  name: string
  drivers_online: number
  drivers_total: number
  active_jobs: number
  jobs_today: number
  avg_response_mins: number | null
}
interface StuckJob {
  id: string
  client_id: string
  business_name: string | null
  job_number: string | null
  job_type: string
  pickup_address: string
  notified_at: string
}

export function AdminDispatchView() {
  const [totals, setTotals] = useState<Totals | null>(null)
  const [businesses, setBusinesses] = useState<BusinessRow[]>([])
  const [stuck, setStuck] = useState<StuckJob[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const res = await fetch('/api/admin/dispatch/overview')
      const data = await res.json()
      if (cancelled) return
      if (!res.ok || !data.ok) { setError(data.error ?? 'Failed to load'); return }
      setTotals(data.totals); setBusinesses(data.businesses); setStuck(data.stuck_jobs)
    }
    load()
    const t = setInterval(load, 30_000)
    return () => { cancelled = true; clearInterval(t) }
  }, [])

  if (error) return <div style={{ padding: 24, color: '#fca5a5' }}>{error}</div>
  if (!totals) return <div style={{ padding: 24, color: '#94a3b8' }}>Loading…</div>

  return (
    <div style={{ padding: 24, color: '#F2F6FB', fontFamily: 'Outfit, sans-serif', maxWidth: 1200, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Dispatch — admin overview</h1>
      <p style={{ fontSize: 13, color: '#94a3b8', margin: '4px 0 20px' }}>
        Read-only cross-business view. For per-client management, open the client and use their /dispatch.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 24 }}>
        <Stat label="Clients on dispatcher" value={totals.clients_using_dispatcher} />
        <Stat label="Drivers online" value={totals.drivers_online} accent="#22C55E" />
        <Stat label="Active jobs right now" value={totals.active_jobs_right_now} />
        <Stat label="Jobs today (all clients)" value={totals.jobs_today} />
      </div>

      {stuck.length > 0 && (
        <section style={{ marginBottom: 24 }}>
          <h2 style={sectionH}>At-risk jobs ({stuck.length})</h2>
          <p style={{ fontSize: 12, color: '#fca5a5', marginTop: 0, marginBottom: 10 }}>
            Stuck in driver_notified for 30+ minutes. The reassign cron should have caught these — investigate.
          </p>
          <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, overflow: 'hidden' }}>
            {stuck.map(j => (
              <div key={j.id} style={{ padding: 12, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>
                  {j.business_name ?? 'Unknown'} — {j.job_number} — {j.job_type}
                </div>
                <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 2 }}>{j.pickup_address}</div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                  Notified {new Date(j.notified_at).toLocaleString('en-AU')}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 style={sectionH}>Clients using dispatcher</h2>
        <div style={{ overflowX: 'auto', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.05)', color: '#94a3b8', textAlign: 'left' }}>
                <th style={th}>Business</th>
                <th style={{ ...th, textAlign: 'right' }}>Drivers online</th>
                <th style={{ ...th, textAlign: 'right' }}>Drivers total</th>
                <th style={{ ...th, textAlign: 'right' }}>Active jobs</th>
                <th style={{ ...th, textAlign: 'right' }}>Jobs today</th>
                <th style={{ ...th, textAlign: 'right' }}>Avg response (m)</th>
              </tr>
            </thead>
            <tbody>
              {businesses.map(b => (
                <tr key={b.id} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={td}>{b.name}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{b.drivers_online}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{b.drivers_total}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{b.active_jobs}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{b.jobs_today}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{b.avg_response_mins ?? '—'}</td>
                </tr>
              ))}
              {businesses.length === 0 && (
                <tr><td colSpan={6} style={{ ...td, textAlign: 'center', color: '#64748b', padding: '32px 12px' }}>
                  No businesses have the dispatcher enabled yet.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 10,
      padding: 14,
    }}>
      <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4, color: accent ?? '#F2F6FB' }}>{value}</div>
    </div>
  )
}

const sectionH: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 10px' }
const th: React.CSSProperties = { padding: '10px 12px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }
const td: React.CSSProperties = { padding: '10px 12px' }
