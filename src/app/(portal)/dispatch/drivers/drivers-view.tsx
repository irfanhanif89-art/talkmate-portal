'use client'

import { useEffect, useState } from 'react'

interface Vehicle { id: string; name: string }
interface Driver {
  id: string; name: string; phone: string
  vehicle_id: string | null; license_class: string | null; active: boolean
  vehicles?: { id: string; name: string } | null
}
interface Shift { id?: string; day_of_week: number; start_time: string; end_time: string; active: boolean }

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function DriversView({
  industry, plan, dispatchEnabled,
}: {
  industry: string
  plan: string
  dispatchEnabled: boolean
}) {
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [editing, setEditing] = useState<Driver | null>(null)
  const [creating, setCreating] = useState(false)
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => { reload() }, [])

  async function reload() {
    setLoading(true)
    try {
      const [d, v] = await Promise.all([
        fetch('/api/portal/drivers').then(r => r.ok ? r.json() : { drivers: [] }),
        fetch('/api/portal/vehicles').then(r => r.ok ? r.json() : { vehicles: [] }),
      ])
      setDrivers(d.drivers ?? [])
      setVehicles(v.vehicles ?? [])
    } finally { setLoading(false) }
  }

  function showToast(m: string) { setToast(m); setTimeout(() => setToast(null), 3000) }

  async function deleteDriver(id: string) {
    if (!confirm('Remove driver?')) return
    const res = await fetch(`/api/portal/drivers/${id}`, { method: 'DELETE' })
    if (res.ok) { setDrivers(list => list.filter(x => x.id !== id)); showToast('Removed') }
  }

  if (industry !== 'towing' || (plan === 'starter') || !dispatchEnabled) {
    return (
      <div style={{ padding: 24, borderRadius: 12, background: '#0A1E38', border: '1px solid rgba(255,255,255,0.07)', color: '#7BAED4', fontSize: 14 }}>
        Driver management is available for towing businesses on the Growth plan. <a href="/dispatch" style={{ color: '#4A9FE8' }}>Open dispatch board →</a>
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22, gap: 12, flexWrap: 'wrap' as const }}>
        <div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'white', margin: 0 }}>Drivers</h1>
          <p style={{ fontSize: 13, color: '#7BAED4', margin: '4px 0 0 0' }}>
            Add drivers, assign vehicles, and set their weekly shift schedule.
          </p>
        </div>
        <button onClick={() => { setEditing(null); setCreating(true) }} style={primaryBtn}>+ Add driver</button>
      </div>

      <div style={{ background: '#0A1E38', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#071829' }}>
              {['Name', 'Phone', 'Vehicle', 'License', 'Active', 'Actions'].map(h => (
                <th key={h} style={th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} style={emptyCell}>Loading…</td></tr>}
            {!loading && drivers.length === 0 && (
              <tr><td colSpan={6} style={emptyCell}>No drivers yet. Add your first driver to start dispatching.</td></tr>
            )}
            {drivers.map((d, i) => (
              <tr key={d.id} style={rowStyle(i)}>
                <td style={td}><span style={{ fontWeight: 600, color: 'white' }}>{d.name}</span></td>
                <td style={td}><span style={{ color: '#7BAED4', fontSize: 12 }}>{d.phone}</span></td>
                <td style={td}><span style={{ color: 'white' }}>{d.vehicles?.name ?? '—'}</span></td>
                <td style={td}><span style={{ color: '#7BAED4' }}>{d.license_class ?? '—'}</span></td>
                <td style={td}>
                  <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 99, background: d.active ? 'rgba(34,197,94,0.15)' : 'rgba(107,114,128,0.15)', color: d.active ? '#22C55E' : '#9CA3AF', fontWeight: 700 }}>
                    {d.active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td style={td}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => setEditing(d)} style={iconBtn('#4A9FE8')}>✎</button>
                    <button onClick={() => deleteDriver(d.id)} style={iconBtn('#EF4444')}>✕</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(creating || editing) && (
        <DriverModal
          initial={editing}
          vehicles={vehicles}
          onClose={() => { setCreating(false); setEditing(null) }}
          onSaved={() => { setCreating(false); setEditing(null); reload(); showToast(editing ? 'Saved' : 'Driver added') }}
        />
      )}
      {toast && <div style={toastStyle}>{toast}</div>}
    </div>
  )
}

function DriverModal({
  initial, vehicles, onClose, onSaved,
}: {
  initial: Driver | null
  vehicles: Vehicle[]
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [phone, setPhone] = useState(initial?.phone ?? '')
  const [vehicleId, setVehicleId] = useState(initial?.vehicle_id ?? '')
  const [licenseClass, setLicenseClass] = useState(initial?.license_class ?? '')
  const [active, setActive] = useState(initial?.active ?? true)
  const [shifts, setShifts] = useState<Shift[]>(
    Array.from({ length: 7 }, (_, i) => ({ day_of_week: i, start_time: '08:00', end_time: '17:00', active: false })),
  )
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!initial) return
    fetch(`/api/portal/drivers/${initial.id}/shifts`)
      .then(r => r.ok ? r.json() : { shifts: [] })
      .then(d => {
        const next = Array.from({ length: 7 }, (_, i) => ({ day_of_week: i, start_time: '08:00', end_time: '17:00', active: false } as Shift))
        for (const s of (d.shifts ?? [])) {
          const idx = s.day_of_week
          if (idx >= 0 && idx <= 6) next[idx] = { day_of_week: idx, start_time: (s.start_time as string).slice(0, 5), end_time: (s.end_time as string).slice(0, 5), active: !!s.active }
        }
        setShifts(next)
      })
      .catch(() => {})
  }, [initial?.id])

  async function save() {
    setBusy(true); setErr(null)
    try {
      const url = initial ? `/api/portal/drivers/${initial.id}` : '/api/portal/drivers'
      const method = initial ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, phone,
          vehicle_id: vehicleId || null,
          license_class: licenseClass || null,
          active,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed')

      const driverId = initial ? initial.id : (data.driver?.id as string | undefined)
      if (driverId) {
        const activeShifts = shifts.filter(s => s.active)
        await fetch(`/api/portal/drivers/${driverId}/shifts`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ shifts: activeShifts }),
        })
      }
      onSaved()
    } catch (e) {
      setErr((e as Error).message); setBusy(false)
    }
  }

  return (
    <Modal onClose={onClose}>
      <h2 style={modalH2}>{initial ? 'Edit driver' : 'Add driver'}</h2>
      <Field label="Full name"><input value={name} onChange={e => setName(e.target.value)} style={inputStyle} /></Field>
      <Field label="Phone"><input value={phone} onChange={e => setPhone(e.target.value)} style={inputStyle} /></Field>
      <Field label="Assign vehicle">
        <select value={vehicleId} onChange={e => setVehicleId(e.target.value)} style={inputStyle}>
          <option value="" style={{ background: '#0A1E38' }}>No vehicle yet</option>
          {vehicles.map(v => <option key={v.id} value={v.id} style={{ background: '#0A1E38' }}>{v.name}</option>)}
        </select>
      </Field>
      <Field label="License class (optional)"><input value={licenseClass} onChange={e => setLicenseClass(e.target.value)} placeholder="e.g. MR, HR, HC" style={inputStyle} /></Field>
      <label style={chkLabel}>
        <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} />
        <span>Active</span>
      </label>

      <div style={{ marginTop: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#7BAED4', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 8 }}>Shift schedule</div>
        <p style={{ fontSize: 11, color: '#7BAED4', margin: 0, marginBottom: 10 }}>
          Driver only receives jobs during these hours. Outside these times they appear as Off Shift.
        </p>
        {shifts.map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 8, borderRadius: 7, background: s.active ? 'rgba(232,98,42,0.08)' : '#071829', marginBottom: 4, border: '1px solid rgba(255,255,255,0.04)' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 70, cursor: 'pointer' }}>
              <input type="checkbox" checked={s.active} onChange={e => setShifts(ss => ss.map((x, j) => j === i ? { ...x, active: e.target.checked } : x))} />
              <span style={{ fontSize: 12, fontWeight: 700, color: 'white' }}>{DAYS[i]}</span>
            </label>
            <input type="time" value={s.start_time} disabled={!s.active}
              onChange={e => setShifts(ss => ss.map((x, j) => j === i ? { ...x, start_time: e.target.value } : x))}
              style={{ ...inputStyle, maxWidth: 110, padding: '5px 8px' }} />
            <span style={{ color: '#7BAED4', fontSize: 11 }}>to</span>
            <input type="time" value={s.end_time} disabled={!s.active}
              onChange={e => setShifts(ss => ss.map((x, j) => j === i ? { ...x, end_time: e.target.value } : x))}
              style={{ ...inputStyle, maxWidth: 110, padding: '5px 8px' }} />
          </div>
        ))}
      </div>

      {err && <ErrBox>{err}</ErrBox>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
        <button onClick={onClose} style={ghostBtn}>Cancel</button>
        <button onClick={save} disabled={busy} style={primaryBtn}>{busy ? 'Saving…' : 'Save driver'}</button>
      </div>
    </Modal>
  )
}

// atoms
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
      <div onClick={e => e.stopPropagation()} style={{ background: '#0A1E38', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 24, maxWidth: 560, width: '100%', maxHeight: '90vh', overflowY: 'auto' as const, boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
        {children}
      </div>
    </div>
  )
}
function ErrBox({ children }: { children: React.ReactNode }) {
  return <div style={{ marginTop: 10, padding: '10px 14px', borderRadius: 9, background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.35)', color: '#FCA5A5', fontSize: 13 }}>{children}</div>
}
const th: React.CSSProperties = { textAlign: 'left' as const, padding: '11px 16px', fontSize: 11, fontWeight: 700, color: '#4A7FBB', textTransform: 'uppercase' as const, letterSpacing: '0.06em' }
const td: React.CSSProperties = { padding: '12px 16px', fontSize: 13 }
const rowStyle = (i: number): React.CSSProperties => ({ borderTop: '1px solid rgba(255,255,255,0.04)', background: i % 2 === 0 ? '#0A1E38' : '#071829' })
const emptyCell: React.CSSProperties = { padding: 32, textAlign: 'center' as const, fontSize: 13, color: '#7BAED4' }
const inputStyle: React.CSSProperties = { width: '100%', padding: '9px 11px', borderRadius: 8, background: '#071829', border: '1px solid rgba(255,255,255,0.10)', color: 'white', fontSize: 13, fontFamily: 'Outfit, sans-serif', outline: 'none' }
const modalH2: React.CSSProperties = { fontSize: 18, fontWeight: 800, color: 'white', margin: 0, marginBottom: 14 }
const primaryBtn: React.CSSProperties = { padding: '9px 16px', borderRadius: 9, fontSize: 13, fontWeight: 700, background: '#E8622A', border: 'none', color: 'white', cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }
const ghostBtn: React.CSSProperties = { padding: '9px 16px', borderRadius: 9, fontSize: 13, fontWeight: 600, background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: '#7BAED4', cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }
const chkLabel: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'white', cursor: 'pointer', padding: 8, background: '#071829', borderRadius: 7 }
function iconBtn(color: string): React.CSSProperties {
  return { width: 28, height: 28, borderRadius: 7, background: `${color}1A`, border: `1px solid ${color}55`, color, cursor: 'pointer', fontSize: 13, fontWeight: 700, display: 'inline-flex' as const, alignItems: 'center' as const, justifyContent: 'center' as const, fontFamily: 'Outfit, sans-serif' }
}
const toastStyle: React.CSSProperties = { position: 'fixed', bottom: 24, right: 24, zIndex: 100, padding: '12px 18px', background: '#0A1E38', border: '1px solid rgba(34,197,94,0.4)', borderRadius: 10, color: '#22C55E', fontSize: 13, fontWeight: 600, boxShadow: '0 4px 20px rgba(0,0,0,0.4)' }
