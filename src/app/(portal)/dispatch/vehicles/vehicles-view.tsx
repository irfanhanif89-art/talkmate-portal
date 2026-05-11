'use client'

import { useEffect, useState } from 'react'

interface Vehicle {
  id: string; name: string; type: string; registration: string | null
  capabilities: string[]; capacity_notes: string | null; active: boolean
}

const VEHICLE_TYPES = [
  { value: 'flatbed', label: 'Flatbed' },
  { value: 'wheel_lift', label: 'Wheel Lift' },
  { value: 'heavy_duty', label: 'Heavy Duty' },
  { value: 'motorcycle_carrier', label: 'Motorcycle Carrier' },
  { value: 'other', label: 'Other' },
]

const CAPABILITY_OPTIONS = [
  { value: 'car_tow', label: 'Standard car tow' },
  { value: '4wd_tow', label: '4WD / SUV tow' },
  { value: 'motorcycle', label: 'Motorcycle tow' },
  { value: 'van', label: 'Van / light commercial' },
  { value: 'heavy_vehicle', label: 'Heavy vehicle' },
  { value: 'container', label: '20-foot container' },
  { value: 'machinery', label: 'Machinery / plant' },
]

export default function VehiclesView({
  industry, plan, dispatchEnabled,
}: { industry: string; plan: string; dispatchEnabled: boolean }) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Vehicle | null>(null)
  const [creating, setCreating] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => { reload() }, [])
  async function reload() {
    setLoading(true)
    try {
      const res = await fetch('/api/portal/vehicles')
      const data = await res.json()
      if (res.ok) setVehicles(data.vehicles ?? [])
    } finally { setLoading(false) }
  }
  function showToast(m: string) { setToast(m); setTimeout(() => setToast(null), 3000) }

  async function deleteVehicle(id: string) {
    if (!confirm('Remove vehicle?')) return
    const res = await fetch(`/api/portal/vehicles/${id}`, { method: 'DELETE' })
    if (res.ok) { setVehicles(v => v.filter(x => x.id !== id)); showToast('Removed') }
  }

  if (industry !== 'towing' || plan === 'starter' || !dispatchEnabled) {
    return (
      <div style={{ padding: 24, borderRadius: 12, background: '#0A1E38', border: '1px solid rgba(255,255,255,0.07)', color: '#7BAED4', fontSize: 14 }}>
        Vehicle registry is part of the towing-dispatch feature. <a href="/dispatch" style={{ color: '#4A9FE8' }}>Open dispatch →</a>
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22, gap: 12, flexWrap: 'wrap' as const }}>
        <div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'white', margin: 0 }}>Vehicles</h1>
          <p style={{ fontSize: 13, color: '#7BAED4', margin: '4px 0 0 0' }}>
            Your trucks and what each can handle. The dispatcher matches incoming jobs against these capabilities.
          </p>
        </div>
        <button onClick={() => { setEditing(null); setCreating(true) }} style={primaryBtn}>+ Add vehicle</button>
      </div>

      {loading && <p style={{ color: '#7BAED4' }}>Loading…</p>}
      {!loading && vehicles.length === 0 && (
        <div style={{ padding: 32, textAlign: 'center' as const, fontSize: 13, color: '#7BAED4', background: '#0A1E38', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14 }}>
          No vehicles yet. Add your first truck so the dispatcher knows what jobs you can handle.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
        {vehicles.map(v => (
          <div key={v.id} style={{ background: '#0A1E38', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'white' }}>{v.name}</div>
                <div style={{ fontSize: 11, color: '#7BAED4', marginTop: 2 }}>{v.type.replace(/_/g, ' ')}{v.registration ? ` · ${v.registration}` : ''}</div>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <button onClick={() => setEditing(v)} style={iconBtn('#4A9FE8')}>✎</button>
                <button onClick={() => deleteVehicle(v.id)} style={iconBtn('#EF4444')}>✕</button>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' as const, marginTop: 10 }}>
              {v.capabilities.length === 0 ? (
                <span style={{ fontSize: 11, color: '#7BAED4', fontStyle: 'italic' as const }}>No capabilities set</span>
              ) : v.capabilities.map(c => (
                <span key={c} style={{ fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 5, background: 'rgba(74,159,232,0.15)', color: '#4A9FE8' }}>
                  {(CAPABILITY_OPTIONS.find(o => o.value === c)?.label ?? c).replace(/_/g, ' ')}
                </span>
              ))}
            </div>
            {v.capacity_notes && (
              <div style={{ marginTop: 8, fontSize: 11, color: '#7BAED4' }}>{v.capacity_notes}</div>
            )}
            {!v.active && (
              <div style={{ marginTop: 10, fontSize: 10, fontWeight: 700, color: '#9CA3AF', letterSpacing: '0.05em' }}>INACTIVE</div>
            )}
          </div>
        ))}
      </div>

      {(creating || editing) && (
        <VehicleModal
          initial={editing}
          onClose={() => { setCreating(false); setEditing(null) }}
          onSaved={() => { setCreating(false); setEditing(null); reload(); showToast(editing ? 'Saved' : 'Vehicle added') }}
        />
      )}
      {toast && <div style={toastStyle}>{toast}</div>}
    </div>
  )
}

function VehicleModal({
  initial, onClose, onSaved,
}: { initial: Vehicle | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(initial?.name ?? '')
  const [type, setType] = useState(initial?.type ?? 'flatbed')
  const [registration, setRegistration] = useState(initial?.registration ?? '')
  const [caps, setCaps] = useState<string[]>(initial?.capabilities ?? [])
  const [capacityNotes, setCapacityNotes] = useState(initial?.capacity_notes ?? '')
  const [active, setActive] = useState(initial?.active ?? true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  function toggleCap(c: string) {
    setCaps(list => list.includes(c) ? list.filter(x => x !== c) : [...list, c])
  }

  async function save() {
    setBusy(true); setErr(null)
    try {
      const url = initial ? `/api/portal/vehicles/${initial.id}` : '/api/portal/vehicles'
      const method = initial ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, type, registration: registration || null,
          capabilities: caps,
          capacity_notes: capacityNotes || null,
          active,
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
    <div onClick={onClose} style={modalShellStyle}>
      <div onClick={e => e.stopPropagation()} style={modalContentStyle}>
        <h2 style={modalH2}>{initial ? 'Edit vehicle' : 'Add vehicle'}</h2>
        <Field label="Vehicle name"><input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Truck 1 — Flatbed" style={inputStyle} /></Field>
        <Field label="Type">
          <select value={type} onChange={e => setType(e.target.value)} style={inputStyle}>
            {VEHICLE_TYPES.map(t => <option key={t.value} value={t.value} style={{ background: '#0A1E38' }}>{t.label}</option>)}
          </select>
        </Field>
        <Field label="Registration (optional)"><input value={registration} onChange={e => setRegistration(e.target.value)} style={inputStyle} /></Field>
        <Field label="Capabilities">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {CAPABILITY_OPTIONS.map(c => {
              const checked = caps.includes(c.value)
              return (
                <label key={c.value} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '7px 10px', borderRadius: 7, background: checked ? 'rgba(232,98,42,0.10)' : '#071829', border: `1px solid ${checked ? 'rgba(232,98,42,0.40)' : 'rgba(255,255,255,0.05)'}`, cursor: 'pointer', fontSize: 12, color: 'white' }}>
                  <input type="checkbox" checked={checked} onChange={() => toggleCap(c.value)} />
                  <span>{c.label}</span>
                </label>
              )
            })}
          </div>
        </Field>
        <Field label="Capacity notes (optional)"><input value={capacityNotes} onChange={e => setCapacityNotes(e.target.value)} placeholder="e.g. Max 3.5 tonne" style={inputStyle} /></Field>
        <label style={chkLabel}>
          <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} />
          <span>Active</span>
        </label>
        {err && <div style={errBoxStyle}>{err}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
          <button onClick={onClose} style={ghostBtn}>Cancel</button>
          <button onClick={save} disabled={busy} style={primaryBtn}>{busy ? 'Saving…' : 'Save vehicle'}</button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', marginBottom: 10 }}>
      <span style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#7BAED4', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 5 }}>{label}</span>
      {children}
    </label>
  )
}

const inputStyle: React.CSSProperties = { width: '100%', padding: '9px 11px', borderRadius: 8, background: '#071829', border: '1px solid rgba(255,255,255,0.10)', color: 'white', fontSize: 13, fontFamily: 'Outfit, sans-serif', outline: 'none' }
const modalShellStyle: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20, fontFamily: 'Outfit, sans-serif' }
const modalContentStyle: React.CSSProperties = { background: '#0A1E38', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 24, maxWidth: 560, width: '100%', maxHeight: '90vh', overflowY: 'auto' as const, boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }
const modalH2: React.CSSProperties = { fontSize: 18, fontWeight: 800, color: 'white', margin: 0, marginBottom: 14 }
const primaryBtn: React.CSSProperties = { padding: '9px 16px', borderRadius: 9, fontSize: 13, fontWeight: 700, background: '#E8622A', border: 'none', color: 'white', cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }
const ghostBtn: React.CSSProperties = { padding: '9px 16px', borderRadius: 9, fontSize: 13, fontWeight: 600, background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: '#7BAED4', cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }
const chkLabel: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'white', cursor: 'pointer', padding: 8, background: '#071829', borderRadius: 7 }
const errBoxStyle: React.CSSProperties = { marginTop: 10, padding: '10px 14px', borderRadius: 9, background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.35)', color: '#FCA5A5', fontSize: 13 }
function iconBtn(color: string): React.CSSProperties {
  return { width: 28, height: 28, borderRadius: 7, background: `${color}1A`, border: `1px solid ${color}55`, color, cursor: 'pointer', fontSize: 13, fontWeight: 700, display: 'inline-flex' as const, alignItems: 'center' as const, justifyContent: 'center' as const, fontFamily: 'Outfit, sans-serif' }
}
const toastStyle: React.CSSProperties = { position: 'fixed', bottom: 24, right: 24, zIndex: 100, padding: '12px 18px', background: '#0A1E38', border: '1px solid rgba(34,197,94,0.4)', borderRadius: 10, color: '#22C55E', fontSize: 13, fontWeight: 600, boxShadow: '0 4px 20px rgba(0,0,0,0.4)' }
