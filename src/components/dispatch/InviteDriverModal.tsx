'use client'

import { useState } from 'react'

const TRUCK_TYPES = [
  { value: '', label: 'No preference' },
  { value: 'flatbed', label: 'Flatbed' },
  { value: 'hook_chain', label: 'Hook & Chain' },
  { value: 'wheel_lift', label: 'Wheel Lift' },
  { value: 'heavy_recovery', label: 'Heavy Recovery' },
  { value: 'other', label: 'Other' },
]

export function InviteDriverModal({ onClose, onInvited }: { onClose: () => void; onInvited: () => void }) {
  const [form, setForm] = useState({
    name: '', email: '', phone: '', truck_type: '', truck_rego: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null); setSubmitting(true)
    const res = await fetch('/api/dispatch/drivers/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const data = await res.json()
    setSubmitting(false)
    if (!res.ok || !data.ok) { setError(data.error ?? 'Could not send invite'); return }
    onInvited()
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(6,19,34,0.78)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20, zIndex: 60,
    }}>
      <div style={{
        width: '100%', maxWidth: 460,
        background: '#0A1E38',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 14, padding: 22,
        color: '#F2F6FB',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Invite Driver</h2>
          <button onClick={onClose} style={{
            background: 'transparent', border: 'none', color: '#94a3b8',
            fontSize: 22, cursor: 'pointer', padding: 4,
          }}>×</button>
        </div>

        <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 0 }}>
          The driver will get an SMS and email with a setup link. The link expires in 7 days.
        </p>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Field label="Name">
            <input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={inp} />
          </Field>
          <Field label="Email">
            <input required type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} style={inp} />
          </Field>
          <Field label="Phone">
            <input required value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} style={inp} inputMode="tel" />
          </Field>
          <Field label="Truck type">
            <select value={form.truck_type} onChange={e => setForm({ ...form, truck_type: e.target.value })} style={inp}>
              {TRUCK_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </Field>
          <Field label="Truck rego (optional)">
            <input value={form.truck_rego} onChange={e => setForm({ ...form, truck_rego: e.target.value })} style={inp} />
          </Field>

          {error && (
            <div style={{
              background: 'rgba(239,68,68,0.15)', color: '#fecaca',
              border: '1px solid rgba(239,68,68,0.4)',
              padding: '8px 12px', borderRadius: 8, fontSize: 13,
            }}>{error}</div>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
            <button type="button" onClick={onClose} style={{ ...ghostBtn, flex: 1 }}>Cancel</button>
            <button type="submit" disabled={submitting} style={{ ...primaryBtn, flex: 1 }}>
              {submitting ? 'Sending…' : 'Send invite'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>{label}</span>
      <div style={{ marginTop: 4 }}>{children}</div>
    </label>
  )
}

const inp: React.CSSProperties = {
  width: '100%', padding: '10px 12px',
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 8, fontSize: 14, color: '#F2F6FB',
  fontFamily: 'inherit', outline: 'none',
}
const primaryBtn: React.CSSProperties = {
  padding: '12px 18px', background: '#E8622A', color: '#fff',
  border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700,
  cursor: 'pointer', fontFamily: 'inherit',
}
const ghostBtn: React.CSSProperties = {
  padding: '12px 18px', background: 'transparent', color: '#94a3b8',
  border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10,
  fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
}
