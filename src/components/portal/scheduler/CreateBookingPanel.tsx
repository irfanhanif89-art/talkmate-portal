'use client'

import { useEffect, useState } from 'react'
import AddressAutocomplete from '@/components/portal/address-autocomplete'
import { wallClockToIso } from '@/lib/scheduler-time'
import {
  SCHED_COLORS,
  type SchedulerDriver,
  type SchedulerSettingsLite,
} from './types'

// =====================================================================
// CreateBookingPanel — right-rail slide-in for click-empty quick-create.
//
// Field parity with the mobile AddBookingModal (brief §3):
//   - Customer: name, phone
//   - Job: description, pickup (Places), delivery (Places)
//   - Delivery contact: name, phone
//   - Schedule: date (pre-filled), time (pre-filled), duration chips
//   - Driver: dropdown
//   - Money: price, payment_method chips
//   - Notes
//
// Address columns get the formatted address from Places autocomplete.
// Lat/lng capture is a Session B+ follow-up (the columns exist but
// aren't populated by this form yet — see TODO below).
//
// Save → POST /api/portal/bookings. The existing route already accepts
// scheduled_start + scheduled_end + driver_id + payment_method, so this
// component is a UI shim on top of the existing API.
// =====================================================================

const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120, 180, 240]
const PAYMENT_OPTIONS = [
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'invoice', label: 'Invoice' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'account', label: 'Account' },
] as const

interface Props {
  /** Default starting datetime for the new booking, derived from the empty-slot click. */
  initial: { dateKey: string; hour: number; minute: number; driverId?: string | null } | null
  drivers: SchedulerDriver[]
  settings: SchedulerSettingsLite | null
  baseUrl: string
  onClose: () => void
  onSaved: () => void
  onError: (msg: string) => void
}

function pad(n: number) {
  return String(n).padStart(2, '0')
}

export default function CreateBookingPanel({
  initial,
  drivers,
  settings,
  baseUrl,
  onClose,
  onSaved,
  onError,
}: Props) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [description, setDescription] = useState('')
  const [pickup, setPickup] = useState('')
  const [delivery, setDelivery] = useState('')
  const [deliveryName, setDeliveryName] = useState('')
  const [deliveryPhone, setDeliveryPhone] = useState('')
  const [date, setDate] = useState(initial?.dateKey ?? '')
  const [time, setTime] = useState(
    initial ? `${pad(initial.hour)}:${pad(initial.minute)}` : '09:00',
  )
  const [durationMins, setDurationMins] = useState(60)
  const [driverId, setDriverId] = useState<string | null>(initial?.driverId ?? null)
  const [price, setPrice] = useState('')
  const [paymentMethod, setPaymentMethod] =
    useState<typeof PAYMENT_OPTIONS[number]['value'] | null>(null)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  // Esc to close.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // If the parent re-opens with a different empty slot, sync the date/time.
  useEffect(() => {
    if (initial) {
      setDate(initial.dateKey)
      setTime(`${pad(initial.hour)}:${pad(initial.minute)}`)
      setDriverId(initial.driverId ?? null)
    }
  }, [initial])

  const required = name.trim() && phone.trim() && description.trim() && date && time
  const canSave = !!required && !saving

  async function save() {
    if (!canSave) return
    setSaving(true)
    const timezone = settings?.timezone ?? 'Australia/Melbourne'
    const scheduledStart = wallClockToIso(date, time, timezone)
    if (!scheduledStart) {
      onError('Invalid date or time')
      setSaving(false)
      return
    }
    const scheduledEnd = new Date(new Date(scheduledStart).getTime() + durationMins * 60_000).toISOString()
    const body: Record<string, unknown> = {
      caller_name: name.trim(),
      caller_phone: phone.trim(),
      description: description.trim(),
      pickup_address: pickup.trim() || null,
      dropoff_address: delivery.trim() || null,
      dropoff_contact_name: deliveryName.trim() || null,
      dropoff_contact_phone: deliveryPhone.trim() || null,
      scheduled_start: scheduledStart,
      scheduled_end: scheduledEnd,
      duration_minutes: durationMins,
      driver_id: driverId,
      booking_source: 'manual',
      estimated_value: price ? Number(price) : null,
      payment_method: paymentMethod,
      notes: notes.trim() || null,
    }
    const res = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.ok) {
      onSaved()
    } else {
      const { error } = await res.json().catch(() => ({ error: 'Save failed' }))
      onError(error ?? 'Save failed')
    }
    setSaving(false)
  }

  if (!initial) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Create booking"
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: 'min(420px, 100vw)',
        background: SCHED_COLORS.NAV_BG,
        borderLeft: `1px solid ${SCHED_COLORS.GRID_LINE_STRONG}`,
        boxShadow: '-12px 0 32px rgba(0,0,0,0.45)',
        zIndex: 200,
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'Outfit, sans-serif',
        color: '#F2F6FB',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '14px 18px',
          borderBottom: `1px solid ${SCHED_COLORS.GRID_LINE_STRONG}`,
          background: SCHED_COLORS.CARD_BG,
        }}
      >
        <div>
          <div style={{ fontSize: 11, color: SCHED_COLORS.TEXT_DIM, letterSpacing: 0.5 }}>NEW BOOKING</div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{date} · {time}</div>
        </div>
        <button onClick={onClose} aria-label="Close" style={closeBtn}>✕</button>
      </div>

      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: 18,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        <Section label="Customer">
          <Field label="Name *">
            <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Phone *">
            <input value={phone} onChange={(e) => setPhone(e.target.value)} style={inputStyle} placeholder="04xx xxx xxx" />
          </Field>
        </Section>

        <Section label="Job">
          <Field label="Description *">
            <input value={description} onChange={(e) => setDescription(e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Pickup address">
            <AddressAutocomplete value={pickup} onChange={setPickup} placeholder="Street, suburb" style={inputStyle} />
          </Field>
          <Field label="Delivery address">
            <AddressAutocomplete value={delivery} onChange={setDelivery} placeholder="Street, suburb" style={inputStyle} />
          </Field>
        </Section>

        <Section label="Delivery contact (optional)">
          <Field label="Name">
            <input value={deliveryName} onChange={(e) => setDeliveryName(e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Phone">
            <input value={deliveryPhone} onChange={(e) => setDeliveryPhone(e.target.value)} style={inputStyle} />
          </Field>
        </Section>

        <Section label="Schedule">
          <Field label="Date *">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Time *">
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Duration">
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {DURATION_OPTIONS.map((n) => (
                <button
                  key={n}
                  onClick={() => setDurationMins(n)}
                  style={chipStyle(durationMins === n)}
                >
                  {n < 60 ? `${n}m` : n === 60 ? '1h' : `${n / 60}h`}
                </button>
              ))}
            </div>
          </Field>
        </Section>

        <Section label="Driver (optional)">
          <select
            value={driverId ?? ''}
            onChange={(e) => setDriverId(e.target.value || null)}
            style={inputStyle}
          >
            <option value="">Unassigned</option>
            {drivers.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
          <div style={{ fontSize: 10, color: SCHED_COLORS.TEXT_DIM, marginTop: 4 }}>
            {driverId ? 'Status will be set to Confirmed' : 'Status will be set to Pending'}
          </div>
        </Section>

        <Section label="Money">
          <Field label="Price (AUD)">
            <input
              type="number"
              inputMode="numeric"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              style={inputStyle}
              placeholder="0"
            />
          </Field>
          <Field label="Payment method">
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {PAYMENT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setPaymentMethod(paymentMethod === opt.value ? null : opt.value)}
                  style={chipStyle(paymentMethod === opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {paymentMethod && (
              <div style={{ fontSize: 10, color: SCHED_COLORS.TEXT_DIM, marginTop: 4 }}>
                {paymentMethod === 'cash' || paymentMethod === 'card'
                  ? 'Driver will see the price'
                  : 'Price will be hidden from driver'}
              </div>
            )}
          </Field>
        </Section>

        <Section label="Notes">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }}
            rows={3}
          />
        </Section>
      </div>

      <div
        style={{
          padding: 14,
          borderTop: `1px solid ${SCHED_COLORS.GRID_LINE_STRONG}`,
          display: 'flex',
          gap: 8,
          justifyContent: 'flex-end',
          background: SCHED_COLORS.CARD_BG,
        }}
      >
        <button onClick={onClose} style={ghostBtn} disabled={saving}>Cancel</button>
        <button
          onClick={save}
          style={{ ...primaryBtn, opacity: canSave ? 1 : 0.5, cursor: canSave ? 'pointer' : 'not-allowed' }}
          disabled={!canSave}
        >
          {saving ? 'Saving…' : 'Create booking'}
        </button>
      </div>
    </div>
  )
}

// ----- presentational primitives -----

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div
        style={{
          fontSize: 10,
          color: SCHED_COLORS.TEXT_DIM,
          letterSpacing: 0.5,
          textTransform: 'uppercase',
          marginBottom: 6,
          fontWeight: 700,
        }}
      >
        {label}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{children}</div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 11, color: SCHED_COLORS.TEXT_DIM }}>{label}</span>
      {children}
    </label>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  background: SCHED_COLORS.CARD_BG,
  border: `1px solid ${SCHED_COLORS.GRID_LINE_STRONG}`,
  borderRadius: 6,
  color: '#F2F6FB',
  fontSize: 13,
  fontFamily: 'inherit',
  outline: 'none',
}

const closeBtn: React.CSSProperties = {
  background: 'transparent',
  border: `1px solid ${SCHED_COLORS.GRID_LINE_STRONG}`,
  color: '#F2F6FB',
  borderRadius: 8,
  width: 32,
  height: 32,
  cursor: 'pointer',
  fontSize: 16,
}

const primaryBtn: React.CSSProperties = {
  background: SCHED_COLORS.ORANGE,
  border: 'none',
  color: '#fff',
  padding: '9px 18px',
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 700,
}

const ghostBtn: React.CSSProperties = {
  background: 'transparent',
  border: `1px solid ${SCHED_COLORS.GRID_LINE_STRONG}`,
  color: '#F2F6FB',
  padding: '9px 14px',
  borderRadius: 8,
  fontSize: 13,
  cursor: 'pointer',
}

function chipStyle(active: boolean): React.CSSProperties {
  return {
    padding: '5px 10px',
    fontSize: 11,
    fontWeight: 600,
    border: active
      ? `1px solid ${SCHED_COLORS.ORANGE}`
      : `1px solid ${SCHED_COLORS.GRID_LINE_STRONG}`,
    background: active ? 'rgba(232,98,42,0.16)' : 'transparent',
    color: active ? SCHED_COLORS.ORANGE : '#F2F6FB',
    borderRadius: 14,
    cursor: 'pointer',
  }
}
