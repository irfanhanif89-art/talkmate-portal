'use client'

import { useState, useEffect } from 'react'
import { JOB_TYPE_LABEL, type JobType, type PaymentType } from '@/lib/dispatch-types'

interface Driver { id: string; name: string; truck_type: string | null; is_online: boolean }

export function NewJobModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [form, setForm] = useState({
    job_type: 'tow' as JobType,
    pickup_address: '',
    pickup_notes: '',
    dropoff_address: '',
    customer_name: '',
    customer_phone: '',
    customer_email: '',
    vehicle_make: '',
    vehicle_model: '',
    vehicle_year: '',
    vehicle_colour: '',
    vehicle_rego: '',
    vehicle_condition: '',
    special_instructions: '',
    truck_type_required: '',
    payment_type: '' as PaymentType | '',
    insurance_claim_number: '',
    motor_club_job_number: '',
    quoted_amount: '',
    distance_km: '',
    driver_id: 'auto',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/dispatch/drivers').then(r => r.json()).then(d => {
      if (d.ok) setDrivers((d.drivers ?? []).filter((dr: Driver & { is_active: boolean }) => dr.is_online))
    })
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.pickup_address) { setError('Pickup address is required'); return }
    setSubmitting(true); setError(null)
    const driverField = form.driver_id === 'auto'
      ? { auto_dispatch: true }
      : form.driver_id === 'none'
        ? {}
        : { driver_id: form.driver_id }
    const res = await fetch('/api/dispatch/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, ...driverField }),
    })
    const data = await res.json()
    setSubmitting(false)
    if (!res.ok || !data.ok) { setError(data.error ?? 'Could not create job'); return }
    onCreated()
  }

  return (
    <ModalShell title="New Job" onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Field label="Job type">
          <select value={form.job_type} onChange={e => setForm({ ...form, job_type: e.target.value as JobType })} style={inp}>
            {Object.entries(JOB_TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>

        <Field label="Pickup address (required)">
          <input value={form.pickup_address} onChange={e => setForm({ ...form, pickup_address: e.target.value })} style={inp} required />
        </Field>
        <Field label="Pickup notes (e.g. in right lane, hazards on)">
          <input value={form.pickup_notes} onChange={e => setForm({ ...form, pickup_notes: e.target.value })} style={inp} />
        </Field>
        <Field label="Dropoff address">
          <input value={form.dropoff_address} onChange={e => setForm({ ...form, dropoff_address: e.target.value })} style={inp} />
        </Field>

        <div style={twoCol}>
          <Field label="Customer name"><input value={form.customer_name} onChange={e => setForm({ ...form, customer_name: e.target.value })} style={inp} /></Field>
          <Field label="Customer phone"><input value={form.customer_phone} onChange={e => setForm({ ...form, customer_phone: e.target.value })} style={inp} inputMode="tel" /></Field>
        </div>

        <div style={twoCol}>
          <Field label="Vehicle make"><input value={form.vehicle_make} onChange={e => setForm({ ...form, vehicle_make: e.target.value })} style={inp} /></Field>
          <Field label="Vehicle model"><input value={form.vehicle_model} onChange={e => setForm({ ...form, vehicle_model: e.target.value })} style={inp} /></Field>
          <Field label="Colour"><input value={form.vehicle_colour} onChange={e => setForm({ ...form, vehicle_colour: e.target.value })} style={inp} /></Field>
          <Field label="Rego"><input value={form.vehicle_rego} onChange={e => setForm({ ...form, vehicle_rego: e.target.value })} style={inp} /></Field>
        </div>

        <Field label="Special instructions">
          <textarea value={form.special_instructions} onChange={e => setForm({ ...form, special_instructions: e.target.value })} rows={2} style={{ ...inp, resize: 'vertical' }} />
        </Field>

        <div style={twoCol}>
          <Field label="Payment type">
            <select value={form.payment_type} onChange={e => setForm({ ...form, payment_type: e.target.value as PaymentType })} style={inp}>
              <option value="">—</option>
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="account">Account</option>
              <option value="insurance">Insurance</option>
              <option value="motor_club">Motor Club</option>
              <option value="other">Other</option>
            </select>
          </Field>
          <Field label="Quoted amount">
            <input value={form.quoted_amount} onChange={e => setForm({ ...form, quoted_amount: e.target.value })} style={inp} inputMode="decimal" />
          </Field>
        </div>

        {form.payment_type === 'insurance' && (
          <Field label="Insurance claim number">
            <input value={form.insurance_claim_number} onChange={e => setForm({ ...form, insurance_claim_number: e.target.value })} style={inp} />
          </Field>
        )}
        {form.payment_type === 'motor_club' && (
          <Field label="Motor club job number">
            <input value={form.motor_club_job_number} onChange={e => setForm({ ...form, motor_club_job_number: e.target.value })} style={inp} />
          </Field>
        )}

        <Field label="Assign driver">
          <select value={form.driver_id} onChange={e => setForm({ ...form, driver_id: e.target.value })} style={inp}>
            <option value="auto">Auto-dispatch to first available driver</option>
            <option value="none">Don't dispatch yet — leave unassigned</option>
            {drivers.map(d => <option key={d.id} value={d.id}>{d.name}{d.truck_type ? ` · ${d.truck_type}` : ''}</option>)}
          </select>
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
            {submitting ? 'Creating…' : 'Create job'}
          </button>
        </div>
      </form>
    </ModalShell>
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

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(6,19,34,0.78)',
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      padding: 20, zIndex: 60, overflowY: 'auto',
    }}>
      <div style={{
        width: '100%', maxWidth: 560,
        background: '#0A1E38',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 14, padding: 22,
        color: '#F2F6FB',
        marginTop: 40,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{title}</h2>
          <button onClick={onClose} style={{
            background: 'transparent', border: 'none', color: '#94a3b8',
            fontSize: 22, cursor: 'pointer', fontFamily: 'inherit', padding: 4,
          }}>×</button>
        </div>
        {children}
      </div>
    </div>
  )
}

const inp: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 8,
  fontSize: 14,
  color: '#F2F6FB',
  fontFamily: 'inherit',
  outline: 'none',
}

const twoCol: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }

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
