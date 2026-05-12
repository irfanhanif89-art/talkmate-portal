'use client'

import { useEffect, useMemo, useState } from 'react'
import AddressAutocomplete from '@/components/portal/address-autocomplete'

interface Vehicle { id: string; name: string; type: string; capabilities: string[] }
interface Driver {
  id: string; name: string; phone: string; vehicle_id: string | null
  vehicles: Vehicle | null
  availability: { status: string; note: string | null } | null
}
interface Job {
  id: string; job_number: string; job_type: string; timing: string
  caller_name: string | null; caller_phone: string
  pickup_address: string | null; vehicle_description: string | null
  status: string
  assigned_driver_id: string | null
  scheduled_at: string | null
  created_at: string
}
interface DispatchConfig {
  job_types?: string[]
  default_wait_minutes?: number
  auto_wait_calculation?: boolean
  max_concurrent_jobs?: number
  after_hours_dispatch?: boolean
  overbooking_action?: string
}

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  available: { bg: 'rgba(34,197,94,0.18)', color: '#22C55E', label: 'Available' },
  on_job: { bg: 'rgba(232,98,42,0.18)', color: '#E8622A', label: 'On Job' },
  off_shift: { bg: 'rgba(107,114,128,0.18)', color: '#9CA3AF', label: 'Off Shift' },
  unavailable: { bg: 'rgba(239,68,68,0.18)', color: '#EF4444', label: 'Unavailable' },
}

const JOB_STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  pending: { bg: 'rgba(245,158,11,0.18)', color: '#F59E0B' },
  assigned: { bg: 'rgba(74,159,232,0.18)', color: '#4A9FE8' },
  in_progress: { bg: 'rgba(232,98,42,0.18)', color: '#E8622A' },
  complete: { bg: 'rgba(34,197,94,0.18)', color: '#22C55E' },
  cancelled: { bg: 'rgba(107,114,128,0.18)', color: '#9CA3AF' },
  declined: { bg: 'rgba(239,68,68,0.18)', color: '#EF4444' },
}

export default function DispatchBoard({
  plan, industry, dispatchEnabled, isPaidTier, isDispatchIndustry,
}: {
  plan: string
  industry: string
  dispatchEnabled: boolean
  isPaidTier: boolean
  isDispatchIndustry: boolean
}) {
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [config, setConfig] = useState<DispatchConfig>({})
  const [waitOverride, setWaitOverride] = useState<number | null>(null)
  const [jobFilter, setJobFilter] = useState<'today' | 'all' | 'scheduled'>('today')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [showAssign, setShowAssign] = useState<Job | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    if (isPaidTier && isDispatchIndustry) reload()
    else setLoading(false)
  }, [isPaidTier, isDispatchIndustry])

  async function reload() {
    setLoading(true)
    try {
      const [d, j, c] = await Promise.all([
        fetch('/api/portal/drivers').then(r => r.ok ? r.json() : { drivers: [] }),
        fetch('/api/portal/dispatch/jobs').then(r => r.ok ? r.json() : { jobs: [] }),
        fetch('/api/portal/dispatch/config').then(r => r.ok ? r.json() : { dispatch_config: {} }),
      ])
      setDrivers(d.drivers ?? [])
      setJobs(j.jobs ?? [])
      setConfig(c.dispatch_config ?? {})
      setWaitOverride(null)
    } finally { setLoading(false) }
  }

  function showToast(m: string) { setToast(m); setTimeout(() => setToast(null), 3500) }

  async function setDriverStatus(d: Driver, status: 'available' | 'on_job' | 'unavailable') {
    setBusy(`status:${d.id}`)
    try {
      const res = await fetch(`/api/portal/drivers/${d.id}/status`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (res.ok) {
        setDrivers(list => list.map(x => x.id === d.id ? { ...x, availability: { status, note: null } } : x))
        showToast(`${d.name}: ${STATUS_STYLE[status].label}`)
      }
    } finally { setBusy(null) }
  }

  async function completeJob(j: Job) {
    setBusy(`complete:${j.id}`)
    try {
      const res = await fetch(`/api/portal/dispatch/jobs/${j.id}/complete`, { method: 'POST' })
      if (res.ok) { setJobs(list => list.filter(x => x.id !== j.id)); showToast('Job complete'); reload() }
    } finally { setBusy(null) }
  }

  async function cancelJob(j: Job) {
    if (!confirm(`Cancel ${j.job_number}?`)) return
    setBusy(`cancel:${j.id}`)
    try {
      const res = await fetch(`/api/portal/dispatch/jobs/${j.id}/cancel`, { method: 'POST' })
      if (res.ok) { setJobs(list => list.filter(x => x.id !== j.id)); showToast('Job cancelled'); reload() }
    } finally { setBusy(null) }
  }

  async function saveWaitOverride() {
    if (waitOverride === null) return
    setBusy('wait')
    try {
      const res = await fetch('/api/portal/dispatch/config', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dispatch_config: { default_wait_minutes: waitOverride } }),
      })
      if (res.ok) { setConfig(c => ({ ...c, default_wait_minutes: waitOverride })); showToast('Wait time updated'); setWaitOverride(null) }
    } finally { setBusy(null) }
  }

  async function toggleAutoCalc(v: boolean) {
    const res = await fetch('/api/portal/dispatch/config', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dispatch_config: { auto_wait_calculation: v } }),
    })
    if (res.ok) setConfig(c => ({ ...c, auto_wait_calculation: v }))
  }

  const filteredJobs = useMemo(() => {
    const live = jobs.filter(j => j.status !== 'complete' && j.status !== 'cancelled')
    if (jobFilter === 'scheduled') return live.filter(j => j.timing === 'scheduled')
    if (jobFilter === 'today') {
      const t0 = new Date(); t0.setHours(0, 0, 0, 0)
      return live.filter(j => new Date(j.created_at).getTime() >= t0.getTime())
    }
    return live
  }, [jobs, jobFilter])

  const availableNow = drivers.filter(d => d.availability?.status === 'available').length
  const onJob = drivers.filter(d => d.availability?.status === 'on_job').length
  const activeCount = jobs.filter(j => j.status === 'pending' || j.status === 'assigned' || j.status === 'in_progress').length
  const todayCount = useMemo(() => {
    const t0 = new Date(); t0.setHours(0, 0, 0, 0)
    return jobs.filter(j => new Date(j.created_at).getTime() >= t0.getTime()).length
  }, [jobs])
  const minutesPerJob = Math.max(1, config.default_wait_minutes ?? 45)
  const autoWait = drivers.length > 0
    ? Math.round((activeCount / Math.max(1, drivers.length)) * minutesPerJob)
    : minutesPerJob
  const displayedWait = config.auto_wait_calculation !== false ? autoWait : minutesPerJob

  // ---- Plan/industry gate ----
  if (!isDispatchIndustry) {
    return (
      <Notice>
        Dispatch is currently a towing-industry feature. If your business runs dispatch operations, ask Irfan to enable it for your account.
      </Notice>
    )
  }
  if (!isPaidTier) {
    return (
      <UpgradeNotice plan={plan} />
    )
  }
  if (!dispatchEnabled) {
    return (
      <Notice>
        Dispatch is being set up for your account. Once enabled by the TalkMate team, this page will show your live driver board.
      </Notice>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18, gap: 12, flexWrap: 'wrap' as const }}>
        <div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'white', margin: 0 }}>Dispatch</h1>
          <p style={{ fontSize: 13, color: '#7BAED4', margin: '4px 0 0 0' }}>
            Live driver board, job queue, and capacity at a glance.
          </p>
        </div>
        <button onClick={() => setShowCreate(true)} style={primaryBtn}>+ Add job</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }} className="dispatch-grid">
        {/* Drivers column */}
        <div style={colBox}>
          <ColHeader>Drivers right now</ColHeader>
          {loading && <Empty>Loading…</Empty>}
          {!loading && drivers.length === 0 && (
            <Empty>No drivers yet. <a href="/dispatch/drivers" style={linkStyle}>Add a driver →</a></Empty>
          )}
          {drivers.map(d => {
            const status = d.availability?.status ?? 'off_shift'
            const s = STATUS_STYLE[status] ?? STATUS_STYLE.off_shift
            return (
              <div key={d.id} style={driverCard}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div>
                    <div style={{ fontWeight: 700, color: 'white', fontSize: 13 }}>{d.name}</div>
                    <div style={{ fontSize: 11, color: '#7BAED4', marginTop: 2 }}>
                      {d.vehicles?.name ?? 'No vehicle assigned'}
                    </div>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.05em', padding: '3px 9px', borderRadius: 99, background: s.bg, color: s.color, textTransform: 'uppercase' as const }}>
                    {s.label}
                  </span>
                </div>
                {d.vehicles?.capabilities && d.vehicles.capabilities.length > 0 && (
                  <div style={{ display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap' as const }}>
                    {d.vehicles.capabilities.slice(0, 5).map(cap => (
                      <span key={cap} style={capChip}>{cap.replace(/_/g, ' ')}</span>
                    ))}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 4, marginTop: 10 }}>
                  <button disabled={busy === `status:${d.id}`} onClick={() => setDriverStatus(d, 'available')} style={tinyBtn('#22C55E', status === 'available')}>Available</button>
                  <button disabled={busy === `status:${d.id}`} onClick={() => setDriverStatus(d, 'on_job')} style={tinyBtn('#E8622A', status === 'on_job')}>On Job</button>
                  <button disabled={busy === `status:${d.id}`} onClick={() => setDriverStatus(d, 'unavailable')} style={tinyBtn('#EF4444', status === 'unavailable')}>Off</button>
                </div>
              </div>
            )
          })}
        </div>

        {/* Jobs column */}
        <div style={colBox}>
          <ColHeader>
            Active jobs
            <span style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
              {(['today', 'all', 'scheduled'] as const).map(t => (
                <button key={t} onClick={() => setJobFilter(t)} style={miniTab(jobFilter === t)}>
                  {t === 'scheduled' ? 'Scheduled' : t === 'today' ? 'Today' : 'All'}
                </button>
              ))}
            </span>
          </ColHeader>
          {loading && <Empty>Loading…</Empty>}
          {!loading && filteredJobs.length === 0 && (
            <Empty>No active jobs in this view.</Empty>
          )}
          {filteredJobs.map(j => {
            const s = JOB_STATUS_STYLE[j.status] ?? JOB_STATUS_STYLE.pending
            const driver = drivers.find(d => d.id === j.assigned_driver_id)
            return (
              <div key={j.id} style={jobCard}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
                  <div>
                    <div style={{ fontWeight: 700, color: 'white', fontSize: 13 }}>
                      {j.job_number}
                      <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 600, color: '#7BAED4' }}>
                        {j.job_type.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: '#7BAED4', marginTop: 2 }}>
                      {j.caller_name ?? 'Unknown'} · {j.caller_phone}
                    </div>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.04em', padding: '3px 8px', borderRadius: 99, background: s.bg, color: s.color, textTransform: 'uppercase' as const }}>
                    {j.timing === 'now' ? 'NOW' : j.scheduled_at ? new Date(j.scheduled_at).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : j.status}
                  </span>
                </div>
                {j.pickup_address && (
                  <div style={{ fontSize: 12, color: 'white', marginBottom: 4 }}>📍 {j.pickup_address}</div>
                )}
                {j.vehicle_description && (
                  <div style={{ fontSize: 11, color: '#7BAED4', marginBottom: 6 }}>{j.vehicle_description}</div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, gap: 6 }}>
                  <span style={{ fontSize: 11, color: driver ? '#22C55E' : '#F59E0B', fontWeight: 600 }}>
                    {driver ? `→ ${driver.name}` : 'Unassigned'}
                  </span>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button onClick={() => setShowAssign(j)} style={miniBtn('#4A9FE8')}>Assign</button>
                    <button onClick={() => completeJob(j)} disabled={busy === `complete:${j.id}`} style={miniBtn('#22C55E')}>Complete</button>
                    <button onClick={() => cancelJob(j)} disabled={busy === `cancel:${j.id}`} style={miniBtn('#EF4444', true)}>Cancel</button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Capacity column */}
        <div style={colBox}>
          <ColHeader>Current capacity</ColHeader>
          <div style={statBox}>
            <Stat label="Available now" value={`${availableNow} / ${drivers.length}`} accent="#22C55E" />
            <Stat label="On job" value={String(onJob)} accent="#E8622A" />
            <Stat label="Active jobs" value={String(activeCount)} accent="#4A9FE8" />
            <Stat label="Today" value={String(todayCount)} accent="#8B5CF6" />
          </div>

          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#7BAED4', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 8 }}>Wait time</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: 32, fontWeight: 800, color: 'white', letterSpacing: '-0.5px' }}>{displayedWait}</span>
              <span style={{ fontSize: 12, color: '#7BAED4' }}>minutes</span>
            </div>
            <label style={chkLabel}>
              <input type="checkbox" checked={config.auto_wait_calculation !== false} onChange={e => toggleAutoCalc(e.target.checked)} />
              <span>Auto-calculate from active jobs</span>
            </label>
            {config.auto_wait_calculation === false && (
              <div style={{ marginTop: 8, display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                  type="number" min={0}
                  value={waitOverride ?? config.default_wait_minutes ?? 45}
                  onChange={e => setWaitOverride(Number(e.target.value))}
                  style={{ ...inputStyle, maxWidth: 100 }}
                />
                <button onClick={saveWaitOverride} disabled={waitOverride === null || busy === 'wait'} style={miniBtn('#E8622A')}>
                  Save
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {showCreate && <CreateJobModal onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); reload(); showToast('Job logged') }} jobTypes={config.job_types} />}
      {showAssign && <AssignJobModal job={showAssign} drivers={drivers} onClose={() => setShowAssign(null)} onSaved={() => { setShowAssign(null); reload(); showToast('Job assigned') }} />}
      {toast && <div style={toastStyle}>{toast}</div>}

      <style>{`@media (max-width: 1100px) { .dispatch-grid { grid-template-columns: 1fr !important; } }`}</style>
    </div>
  )
}

// ─── Modals ───────────────────────────────────────────────────────

function CreateJobModal({
  onClose, onSaved, jobTypes,
}: { onClose: () => void; onSaved: () => void; jobTypes?: string[] }) {
  const types = jobTypes ?? ['car_tow', '4wd_tow', 'container', 'machinery', 'motorcycle', 'van']
  const [jobType, setJobType] = useState(types[0])
  const [callerName, setCallerName] = useState('')
  const [callerPhone, setCallerPhone] = useState('')
  const [pickup, setPickup] = useState('')
  const [dropoff, setDropoff] = useState('')
  const [vehicleDescription, setVehicleDescription] = useState('')
  const [notes, setNotes] = useState('')
  const [timing, setTiming] = useState<'now' | 'scheduled'>('now')
  const [scheduledAt, setScheduledAt] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function save() {
    setBusy(true); setErr(null)
    try {
      const res = await fetch('/api/portal/dispatch/jobs', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_type: jobType,
          caller_name: callerName,
          caller_phone: callerPhone,
          pickup_address: pickup,
          dropoff_address: dropoff || null,
          vehicle_description: vehicleDescription,
          notes,
          timing,
          scheduled_at: timing === 'scheduled' ? scheduledAt : null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed')
      onSaved()
    } catch (e) {
      setErr((e as Error).message); setBusy(false)
    }
  }

  return (
    <Modal onClose={onClose}>
      <h2 style={modalH2}>New job</h2>
      <Field label="Job type">
        <select value={jobType} onChange={e => setJobType(e.target.value)} style={inputStyle}>
          {types.map(t => <option key={t} value={t} style={{ background: '#0A1E38' }}>{t.replace(/_/g, ' ')}</option>)}
        </select>
      </Field>
      <Field label="Timing">
        <select value={timing} onChange={e => setTiming(e.target.value as 'now' | 'scheduled')} style={inputStyle}>
          <option value="now" style={{ background: '#0A1E38' }}>Now</option>
          <option value="scheduled" style={{ background: '#0A1E38' }}>Scheduled</option>
        </select>
      </Field>
      {timing === 'scheduled' && (
        <Field label="Scheduled at"><input type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} style={inputStyle} /></Field>
      )}
      <Field label="Caller name"><input value={callerName} onChange={e => setCallerName(e.target.value)} style={inputStyle} /></Field>
      <Field label="Caller phone"><input value={callerPhone} onChange={e => setCallerPhone(e.target.value)} style={inputStyle} /></Field>
      <Field label="Pickup address">
        <AddressAutocomplete value={pickup} onChange={setPickup} placeholder="Start typing pickup address…" style={inputStyle} />
      </Field>
      <Field label="Dropoff address (optional)">
        <AddressAutocomplete value={dropoff} onChange={setDropoff} placeholder="Start typing dropoff address…" style={inputStyle} />
      </Field>
      <Field label="Vehicle (make / model / colour)"><input value={vehicleDescription} onChange={e => setVehicleDescription(e.target.value)} style={inputStyle} /></Field>
      <Field label="Notes"><textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} style={{ ...inputStyle, resize: 'vertical' as const }} /></Field>
      {err && <ErrBox>{err}</ErrBox>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
        <button onClick={onClose} style={ghostBtn}>Cancel</button>
        <button onClick={save} disabled={busy} style={primaryBtn}>{busy ? 'Saving…' : 'Create job'}</button>
      </div>
    </Modal>
  )
}

function AssignJobModal({
  job, drivers, onClose, onSaved,
}: { job: Job; drivers: Driver[]; onClose: () => void; onSaved: () => void }) {
  const [driverId, setDriverId] = useState(job.assigned_driver_id ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function save() {
    if (!driverId) { setErr('Pick a driver'); return }
    setBusy(true); setErr(null)
    try {
      const res = await fetch(`/api/portal/dispatch/jobs/${job.id}/assign`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driver_id: driverId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed')
      onSaved()
    } catch (e) {
      setErr((e as Error).message); setBusy(false)
    }
  }

  return (
    <Modal onClose={onClose}>
      <h2 style={modalH2}>Assign {job.job_number}</h2>
      <p style={{ fontSize: 13, color: '#7BAED4', marginBottom: 12 }}>{job.job_type.replace(/_/g, ' ')} · {job.caller_phone}</p>
      <Field label="Driver">
        <select value={driverId} onChange={e => setDriverId(e.target.value)} style={inputStyle}>
          <option value="" style={{ background: '#0A1E38' }}>Pick a driver…</option>
          {drivers.map(d => (
            <option key={d.id} value={d.id} style={{ background: '#0A1E38' }}>
              {d.name} {d.vehicles ? `(${d.vehicles.name})` : ''}
            </option>
          ))}
        </select>
      </Field>
      {err && <ErrBox>{err}</ErrBox>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
        <button onClick={onClose} style={ghostBtn}>Cancel</button>
        <button onClick={save} disabled={busy} style={primaryBtn}>{busy ? 'Assigning…' : 'Assign'}</button>
      </div>
    </Modal>
  )
}

// ─── atoms ─────────────────────────────────────────────────────────

function ColHeader({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: 11, fontWeight: 700, color: '#7BAED4', textTransform: 'uppercase' as const, letterSpacing: '0.08em' }}>
      {children}
    </div>
  )
}
function Stat({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div style={{ padding: 10, background: '#071829', borderRadius: 8, border: '1px solid rgba(255,255,255,0.04)' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#7BAED4', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: accent, letterSpacing: '-0.3px' }}>{value}</div>
    </div>
  )
}
function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: '20px 16px', fontSize: 12, color: '#7BAED4', fontStyle: 'italic' as const }}>{children}</div>
}
function Notice({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: 24, borderRadius: 12, background: '#0A1E38', border: '1px solid rgba(255,255,255,0.06)', color: '#7BAED4', fontSize: 14, lineHeight: 1.6 }}>{children}</div>
}
function UpgradeNotice({ plan }: { plan: string }) {
  return (
    <div style={{ padding: 32, borderRadius: 14, background: 'linear-gradient(135deg, rgba(232,98,42,0.10), rgba(74,159,232,0.05))', border: '1px solid rgba(232,98,42,0.30)', textAlign: 'center' as const }}>
      <h2 style={{ fontSize: 22, fontWeight: 800, color: 'white', margin: 0, marginBottom: 8 }}>Dispatch is a Growth+ feature</h2>
      <p style={{ fontSize: 14, color: '#7BAED4', maxWidth: 540, margin: '0 auto 20px', lineHeight: 1.6 }}>
        You're on the {plan} plan. Upgrade to Growth or Pro to activate the live driver board, automated job routing, and Vapi dispatcher functions for your towing operation.
      </p>
      <a href="/billing" style={{ display: 'inline-block', padding: '12px 24px', borderRadius: 10, background: '#E8622A', color: 'white', textDecoration: 'none', fontWeight: 800, fontFamily: 'Outfit, sans-serif' }}>
        See plans →
      </a>
    </div>
  )
}
function ErrBox({ children }: { children: React.ReactNode }) {
  return <div style={{ marginTop: 10, padding: '10px 14px', borderRadius: 9, background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.35)', color: '#FCA5A5', fontSize: 13 }}>{children}</div>
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', marginBottom: 10 }}>
      <span style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#7BAED4', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 5 }}>{label}</span>
      {children}
    </label>
  )
}
function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20, fontFamily: 'Outfit, sans-serif' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#0A1E38', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 24, maxWidth: 480, width: '100%', maxHeight: '90vh', overflowY: 'auto' as const, boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
        {children}
      </div>
    </div>
  )
}

// ─── styles ────────────────────────────────────────────────────────

const colBox: React.CSSProperties = {
  background: '#0A1E38', border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 14, overflow: 'hidden', minHeight: 360,
}
const driverCard: React.CSSProperties = { padding: 14, borderBottom: '1px solid rgba(255,255,255,0.04)' }
const jobCard: React.CSSProperties = { padding: 14, borderBottom: '1px solid rgba(255,255,255,0.04)' }
const statBox: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: 16 }
const capChip: React.CSSProperties = { fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 5, background: 'rgba(74,159,232,0.12)', color: '#4A9FE8', textTransform: 'capitalize' as const }
const inputStyle: React.CSSProperties = { width: '100%', padding: '9px 11px', borderRadius: 8, background: '#071829', border: '1px solid rgba(255,255,255,0.10)', color: 'white', fontSize: 13, fontFamily: 'Outfit, sans-serif', outline: 'none' }
const linkStyle: React.CSSProperties = { color: '#4A9FE8', textDecoration: 'none', fontWeight: 600 }
const modalH2: React.CSSProperties = { fontSize: 18, fontWeight: 800, color: 'white', margin: 0, marginBottom: 14 }
const primaryBtn: React.CSSProperties = { padding: '9px 16px', borderRadius: 9, fontSize: 13, fontWeight: 700, background: '#E8622A', border: 'none', color: 'white', cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }
const ghostBtn: React.CSSProperties = { padding: '9px 16px', borderRadius: 9, fontSize: 13, fontWeight: 600, background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: '#7BAED4', cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }
const chkLabel: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'white', marginTop: 8, cursor: 'pointer' }
const toastStyle: React.CSSProperties = { position: 'fixed', bottom: 24, right: 24, zIndex: 100, padding: '12px 18px', background: '#0A1E38', border: '1px solid rgba(34,197,94,0.4)', borderRadius: 10, color: '#22C55E', fontSize: 13, fontWeight: 600, boxShadow: '0 4px 20px rgba(0,0,0,0.4)' }

function tinyBtn(color: string, active: boolean): React.CSSProperties {
  return { flex: 1, padding: '4px 6px', borderRadius: 5, fontSize: 10, fontWeight: 700, background: active ? color : `${color}22`, border: `1px solid ${color}55`, color: active ? 'white' : color, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }
}
function miniBtn(color: string, subtle = false): React.CSSProperties {
  return { padding: '4px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700, background: subtle ? 'transparent' : color, border: `1px solid ${color}`, color: subtle ? color : 'white', cursor: 'pointer', fontFamily: 'Outfit, sans-serif', whiteSpace: 'nowrap' as const }
}
function miniTab(active: boolean): React.CSSProperties {
  return { padding: '3px 8px', borderRadius: 5, fontSize: 10, fontWeight: 700, background: active ? '#E8622A' : 'transparent', border: `1px solid ${active ? '#E8622A' : 'rgba(255,255,255,0.08)'}`, color: active ? 'white' : '#7BAED4', cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }
}
