'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { DriverShell } from '@/components/driver/DriverShell'
import type { DriverRow } from '@/lib/driver-auth'

const BRAND = {
  orange: '#E8622A',
  navy: '#061322',
  grey: '#6b7280',
  green: '#22C55E',
}

const TRUCK_TYPES = [
  { value: 'flatbed', label: 'Flatbed' },
  { value: 'hook_chain', label: 'Hook & Chain' },
  { value: 'wheel_lift', label: 'Wheel Lift' },
  { value: 'heavy_recovery', label: 'Heavy Recovery' },
  { value: 'other', label: 'Other' },
]

export function DriverProfileClient({
  driver: initialDriver,
  businessName,
}: {
  driver: DriverRow
  businessName: string
}) {
  const router = useRouter()
  const supabase = createClient()
  const [driver, setDriver] = useState(initialDriver)
  const [form, setForm] = useState({
    name: driver.name,
    phone: driver.phone,
    truck_type: driver.truck_type ?? '',
    truck_rego: driver.truck_rego ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [resetSending, setResetSending] = useState(false)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setMessage(null)
    const res = await fetch('/api/driver/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const data = await res.json()
    if (res.ok && data.ok) {
      setDriver(data.driver)
      setMessage({ ok: true, text: 'Profile updated.' })
    } else {
      setMessage({ ok: false, text: data.error ?? 'Update failed' })
    }
    setSaving(false)
  }

  async function sendPasswordReset() {
    if (!driver.email) return
    setResetSending(true); setMessage(null)
    const { error } = await supabase.auth.resetPasswordForEmail(driver.email)
    if (error) {
      setMessage({ ok: false, text: error.message })
    } else {
      setMessage({ ok: true, text: 'Password reset email sent.' })
    }
    setResetSending(false)
  }

  return (
    <DriverShell
      driver={driver}
      businessName={businessName}
      onStatusChanged={(isOnline) => setDriver({ ...driver, is_online: isOnline })}
    >
      <h1 style={{ fontSize: 22, fontWeight: 700, color: BRAND.navy, marginTop: 4, marginBottom: 16 }}>
        Profile
      </h1>

      <form onSubmit={save} style={cardStyle}>
        <Field label="Name">
          <input
            value={form.name}
            onChange={e => setForm({ ...form, name: e.target.value })}
            style={inpStyle}
            required
          />
        </Field>

        <Field label="Phone">
          <input
            value={form.phone}
            onChange={e => setForm({ ...form, phone: e.target.value })}
            style={inpStyle}
            inputMode="tel"
            required
          />
        </Field>

        <Field label="Truck type">
          <select
            value={form.truck_type}
            onChange={e => setForm({ ...form, truck_type: e.target.value })}
            style={inpStyle}
          >
            <option value="">Select…</option>
            {TRUCK_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </Field>

        <Field label="Truck rego">
          <input
            value={form.truck_rego}
            onChange={e => setForm({ ...form, truck_rego: e.target.value })}
            style={inpStyle}
          />
        </Field>

        <Field label="Email (read-only)">
          <input value={driver.email ?? ''} disabled style={{ ...inpStyle, background: '#f3f4f6', color: BRAND.grey }} />
        </Field>

        <Field label="Business (read-only)">
          <input value={businessName} disabled style={{ ...inpStyle, background: '#f3f4f6', color: BRAND.grey }} />
        </Field>

        {message && (
          <div style={{
            background: message.ok ? '#dcfce7' : '#fee2e2',
            color: message.ok ? '#166534' : '#991b1b',
            border: `1px solid ${message.ok ? '#bbf7d0' : '#fecaca'}`,
            padding: '10px 14px',
            borderRadius: 8,
            fontSize: 14,
            marginTop: 4,
            marginBottom: 8,
          }}>{message.text}</div>
        )}

        <button
          type="submit"
          disabled={saving}
          style={{
            width: '100%',
            padding: '14px 16px',
            background: BRAND.orange,
            color: '#fff',
            border: 'none',
            borderRadius: 10,
            fontSize: 16,
            fontWeight: 700,
            cursor: saving ? 'wait' : 'pointer',
            fontFamily: 'inherit',
            opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </form>

      <h2 style={{ fontSize: 16, fontWeight: 700, color: BRAND.navy, marginTop: 24, marginBottom: 12 }}>
        Account
      </h2>
      <div style={cardStyle}>
        <button
          onClick={sendPasswordReset}
          disabled={resetSending || !driver.email}
          style={{
            width: '100%',
            padding: '13px 16px',
            background: '#fff',
            color: BRAND.navy,
            border: '1px solid #d1d5db',
            borderRadius: 10,
            fontSize: 15,
            fontWeight: 600,
            cursor: resetSending ? 'wait' : 'pointer',
            fontFamily: 'inherit',
            opacity: resetSending ? 0.7 : 1,
          }}
        >
          {resetSending ? 'Sending…' : 'Send password reset email'}
        </button>
      </div>
    </DriverShell>
  )
}

const cardStyle: React.CSSProperties = {
  background: '#fff',
  borderRadius: 12,
  border: '1px solid #e5e7eb',
  padding: 16,
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
}

const inpStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: 8,
  border: '1px solid #d1d5db',
  fontSize: 15,
  fontFamily: 'inherit',
  outline: 'none',
  background: '#fff',
  color: '#061322',
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 600, color: BRAND.grey, marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  )
}
