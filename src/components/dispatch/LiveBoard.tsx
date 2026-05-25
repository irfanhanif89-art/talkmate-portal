'use client'

import { useCallback, useEffect, useState } from 'react'
import { DispatcherMap, type DispatcherMapDriver, type DispatcherMapLocation } from './DispatcherMap'
import { createClient } from '@/lib/supabase/client'
import { STATUS_LABEL, JOB_TYPE_LABEL, type DispatchJobStatus } from '@/lib/dispatch-types'

interface ActiveJob {
  id: string
  job_number: string | null
  job_type: string
  status: DispatchJobStatus
  pickup_address: string
  dropoff_address: string | null
  customer_name: string | null
  customer_phone: string | null
  vehicle_make: string | null
  vehicle_model: string | null
  vehicle_colour: string | null
  vehicle_rego: string | null
  driver_id: string | null
  driver_name: string | null
  driver_eta_mins: number | null
  response_deadline: string | null
  created_at: string
}

interface Driver {
  id: string
  name: string
  truck_type: string | null
  truck_rego: string | null
  is_online: boolean
  is_available: boolean
  is_active: boolean
}

const STATUS_COLOUR: Record<DispatchJobStatus, string> = {
  created: '#6b7280',
  driver_notified: '#f59e0b',
  accepted: '#3b82f6',
  declined: '#ef4444',
  en_route: '#E8622A',
  on_scene: '#E8622A',
  loaded: '#7c3aed',
  in_transit: '#7c3aed',
  at_dropoff: '#0891b2',
  completed: '#22C55E',
  invoiced: '#22C55E',
  paid: '#22C55E',
  cancelled: '#ef4444',
}

export function LiveBoard({ clientId }: { clientId: string }) {
  const [stats, setStats] = useState({
    active_jobs_count: 0, drivers_online_count: 0, jobs_today_count: 0,
    avg_response_time_mins: null as number | null,
  })
  const [jobs, setJobs] = useState<ActiveJob[]>([])
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [locations, setLocations] = useState<DispatcherMapLocation[]>([])

  const refetch = useCallback(async () => {
    const [dashRes, locRes] = await Promise.all([
      fetch('/api/dispatch/dashboard').then(r => r.json()),
      fetchLocations(clientId),
    ])
    if (dashRes.ok) {
      setStats(dashRes.stats)
      setJobs(dashRes.active_jobs ?? [])
      setDrivers(dashRes.drivers ?? [])
    }
    setLocations(locRes)
  }, [clientId])

  useEffect(() => {
    refetch()
    const t = setInterval(refetch, 15_000)
    return () => clearInterval(t)
  }, [refetch])

  const mapDrivers: DispatcherMapDriver[] = drivers.map(d => ({
    id: d.id,
    name: d.name,
    truck_type: d.truck_type,
    truck_rego: d.truck_rego,
    is_online: d.is_online,
    is_available: d.is_available,
    active_job_id: jobs.find(j => j.driver_id === d.id && !['completed','cancelled','declined'].includes(j.status))?.id ?? null,
    active_job_status: jobs.find(j => j.driver_id === d.id)?.status ?? null,
  }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <DispatcherMap clientId={clientId} drivers={mapDrivers} initialLocations={locations} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
        <Stat label="Active jobs" value={String(stats.active_jobs_count)} />
        <Stat label="Drivers online" value={String(stats.drivers_online_count)} accent="#22C55E" />
        <Stat label="Jobs today" value={String(stats.jobs_today_count)} />
        <Stat label="Avg response (mins)" value={stats.avg_response_time_mins != null ? String(stats.avg_response_time_mins) : '—'} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.6fr) minmax(0, 1fr)', gap: 16 }}>
        <section>
          <h2 style={sectionHeading}>Active jobs</h2>
          {jobs.length === 0 && <Empty>No active jobs right now.</Empty>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {jobs.map(j => <JobCard key={j.id} job={j} onRefetch={refetch} />)}
          </div>
        </section>
        <section>
          <h2 style={sectionHeading}>Drivers</h2>
          {drivers.length === 0 && <Empty>No drivers yet. Invite one from the Drivers tab.</Empty>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {drivers.map(d => <DriverTile key={d.id} driver={d} onRefetch={refetch} />)}
          </div>
        </section>
      </div>
    </div>
  )
}

async function fetchLocations(clientId: string): Promise<DispatcherMapLocation[]> {
  const supabase = createClient()
  const { data } = await supabase
    .from('driver_locations')
    .select('driver_id, lat, lng, heading, updated_at')
    .eq('client_id', clientId)
  return (data ?? []) as DispatcherMapLocation[]
}

function JobCard({ job, onRefetch }: { job: ActiveJob; onRefetch: () => void }) {
  const [busy, setBusy] = useState(false)
  async function cancel() {
    if (!confirm('Cancel this job?')) return
    setBusy(true)
    await fetch(`/api/dispatch/jobs/${job.id}/cancel`, { method: 'PATCH' })
    setBusy(false)
    onRefetch()
  }

  const colour = STATUS_COLOUR[job.status]
  return (
    <div style={{
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 10,
      padding: 14,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{
          background: colour, color: '#fff', padding: '3px 8px',
          borderRadius: 4, fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
        }}>{STATUS_LABEL[job.status]}</span>
        <span style={{ fontSize: 12, color: '#94a3b8' }}>{job.job_number}</span>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: '#64748b' }}>
          {timeAgo(job.created_at)}
        </span>
      </div>
      <div style={{ fontSize: 15, fontWeight: 600 }}>{JOB_TYPE_LABEL[job.job_type as keyof typeof JOB_TYPE_LABEL] ?? job.job_type}</div>
      <div style={{ fontSize: 13, color: '#cbd5e1', marginTop: 4 }}>{job.pickup_address}</div>
      {job.dropoff_address && (
        <div style={{ fontSize: 13, color: '#94a3b8' }}>→ {job.dropoff_address}</div>
      )}
      {(job.customer_name || job.customer_phone) && (
        <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 6 }}>
          {job.customer_name ?? ''}
          {job.customer_phone && <> · <a href={`tel:${job.customer_phone}`} style={{ color: '#7BAED4' }}>{job.customer_phone}</a></>}
        </div>
      )}
      <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
        Driver: {job.driver_name ?? <span style={{ color: '#f59e0b' }}>Unassigned</span>}
        {job.driver_eta_mins != null && <> · ETA {job.driver_eta_mins}m</>}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button onClick={cancel} disabled={busy} style={dangerLink}>Cancel</button>
      </div>
    </div>
  )
}

function DriverTile({ driver, onRefetch }: { driver: Driver; onRefetch: () => void }) {
  const [busy, setBusy] = useState(false)
  async function toggle() {
    setBusy(true)
    await fetch(`/api/dispatch/drivers/${driver.id}/availability`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_online: !driver.is_online }),
    })
    setBusy(false)
    onRefetch()
  }

  return (
    <div style={{
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 10,
      padding: 12,
      display: 'flex',
      alignItems: 'center',
      gap: 12,
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: '50%',
        background: driver.is_online ? '#22C55E' : '#475569',
        color: '#fff', fontSize: 13, fontWeight: 700,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {driver.name.split(/\s+/).map(s => s[0]).slice(0, 2).join('').toUpperCase()}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{driver.name}</div>
        <div style={{ fontSize: 11, color: '#94a3b8' }}>
          {driver.truck_type ?? 'unset'}
          {driver.truck_rego ? ' · ' + driver.truck_rego : ''}
          {' · '}
          <span style={{ color: driver.is_online ? '#22C55E' : '#64748b' }}>
            {driver.is_online ? 'Online' : 'Offline'}
          </span>
        </div>
      </div>
      <button onClick={toggle} disabled={busy} style={{
        background: 'transparent',
        color: '#7BAED4',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 6,
        padding: '4px 10px',
        fontSize: 11,
        cursor: 'pointer',
        fontFamily: 'inherit',
      }}>
        {driver.is_online ? 'Set offline' : 'Set online'}
      </button>
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
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

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      padding: '14px 16px',
      background: 'rgba(255,255,255,0.03)',
      border: '1px dashed rgba(255,255,255,0.12)',
      borderRadius: 10,
      fontSize: 13,
      color: '#94a3b8',
    }}>{children}</div>
  )
}

const sectionHeading: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: '#94a3b8',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  margin: '0 0 10px',
}

const dangerLink: React.CSSProperties = {
  background: 'transparent',
  color: '#fca5a5',
  border: '1px solid rgba(252,165,165,0.4)',
  borderRadius: 6,
  padding: '4px 10px',
  fontSize: 11,
  cursor: 'pointer',
  fontFamily: 'inherit',
}

function timeAgo(iso: string): string {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (secs < 60) return `${secs}s ago`
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}
