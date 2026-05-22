'use client'

import { useEffect, useMemo, useState } from 'react'

interface Booking {
  id: string
  caller_name: string | null
  caller_phone: string | null
  scheduled_start: string | null
  scheduled_end: string | null
  truck_type: string | null
  description: string | null
  pickup_address: string | null
  dropoff_address: string | null
  pickup_contact_name: string | null
  pickup_contact_phone: string | null
  confirmation_ref: string | null
  dispatcher_notified_at: string | null
  sms_confirmation_sent: boolean | null
  status: 'pending' | 'confirmed' | 'declined' | 'cancelled' | 'completed' | 'no_show'
  created_at: string
  call_id: string | null
}

type Tab = 'pending' | 'confirmed' | 'all'

const STATUS_STYLE: Record<Booking['status'], { bg: string; color: string }> = {
  pending: { bg: 'rgba(245,158,11,0.15)', color: '#F59E0B' },
  confirmed: { bg: 'rgba(34,197,94,0.15)', color: '#22C55E' },
  declined: { bg: 'rgba(239,68,68,0.15)', color: '#EF4444' },
  cancelled: { bg: 'rgba(107,114,128,0.15)', color: '#9CA3AF' },
  completed: { bg: 'rgba(74,159,232,0.15)', color: '#4A9FE8' },
  no_show: { bg: 'rgba(239,68,68,0.15)', color: '#EF4444' },
}

const TRUCK_OPTIONS: { value: string; label: string }[] = [
  { value: 'loaded_tilt_tray', label: 'Loaded tilt tray' },
  { value: 'empty_tilt_tray', label: 'Empty tilt tray' },
  { value: 'sideloader_40ft', label: 'Sideloader (40ft)' },
]

// Mirrors fmtTruck in src/lib/sms.ts. Inlined because sms.ts pulls server-only
// deps (Twilio, Supabase admin) and this is a client component.
function formatTruckLabel(t: string | null | undefined): string | null {
  if (!t) return null
  if (t === 'loaded_tilt_tray') return 'Loaded tilt tray'
  if (t === 'empty_tilt_tray') return 'Empty tilt tray'
  if (t === 'sideloader_40ft') return 'Sideloader'
  return t
}

function formatScheduled(booking: Booking): string {
  if (!booking.scheduled_start) return 'Time TBC'
  return new Date(booking.scheduled_start).toLocaleString('en-AU', {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function BookingsView({ businessName }: { businessName: string }) {
  const [list, setList] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('pending')
  const [confirming, setConfirming] = useState<Booking | null>(null)
  const [viewingNotes, setViewingNotes] = useState<Booking | null>(null)
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => { reload() }, [])

  async function reload() {
    setLoading(true)
    try {
      const res = await fetch('/api/portal/bookings')
      const data = await res.json()
      if (res.ok) setList(data.bookings ?? [])
    } finally { setLoading(false) }
  }

  const filtered = useMemo(() => {
    if (tab === 'all') return list
    return list.filter(b => b.status === tab)
  }, [list, tab])

  function showToast(m: string) { setToast(m); setTimeout(() => setToast(null), 3500) }

  async function confirmBooking(b: Booking) {
    setBusy(`confirm:${b.id}`)
    try {
      const res = await fetch(`/api/portal/bookings/${b.id}/confirm`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed')
      setList(l => l.map(x => x.id === b.id
        ? { ...x, status: 'confirmed', sms_confirmation_sent: true }
        : x))
      showToast(data.sms === 'sent' ? 'Booking confirmed. SMS sent.' : 'Booking confirmed.')
      setConfirming(null)
    } catch (e) {
      showToast((e as Error).message)
    } finally { setBusy(null) }
  }

  async function cancelBooking(b: Booking) {
    if (!confirm('Cancel this booking?')) return
    setBusy(`cancel:${b.id}`)
    try {
      const res = await fetch(`/api/portal/bookings/${b.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled' }),
      })
      if (res.ok) {
        setList(l => l.map(x => x.id === b.id ? { ...x, status: 'cancelled' } : x))
        showToast('Cancelled')
      }
    } finally { setBusy(null) }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 22 }}>
        <div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'white', margin: 0 }}>Bookings</h1>
          <p style={{ fontSize: 13, color: '#7BAED4', margin: '4px 0 0 0' }}>
            Booking requests from callers. Confirm them to send the caller an automatic SMS.
          </p>
        </div>
        <button onClick={() => setCreating(true)} style={primaryBtn()}>+ New Booking</button>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {(['pending', 'confirmed', 'all'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)} style={tabBtn(tab === t)}>
            {t === 'pending' ? 'Pending' : t === 'confirmed' ? 'Confirmed' : 'All'}
            {' '}
            <span style={{ opacity: 0.7, fontSize: 11 }}>
              {t === 'all' ? list.length : list.filter(b => b.status === t).length}
            </span>
          </button>
        ))}
      </div>

      <div style={tableWrap}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#071829' }}>
              {['Received', 'Caller', 'Service', 'Scheduled', 'Status', 'Actions'].map(h => (
                <th key={h} style={th()}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} style={emptyCell()}>Loading…</td></tr>}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={6} style={emptyCell()}>
                {tab === 'pending' ? 'No pending bookings.' : 'No bookings here.'}
                {' '}Booking requests from callers appear here. Confirm them to send an automatic SMS.
              </td></tr>
            )}
            {filtered.map((b, i) => {
              const s = STATUS_STYLE[b.status]
              const truckLabel = formatTruckLabel(b.truck_type) ?? '—'
              const hasNotesAction = !!b.description
              return (
                <tr key={b.id} style={rowStyle(i)}>
                  <td style={td()}>
                    <span style={{ color: '#7BAED4', fontSize: 12 }}>
                      {new Date(b.created_at).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </td>
                  <td style={td()}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <div style={{ fontWeight: 600, color: 'white' }}>{b.caller_name ?? 'Unknown'}</div>
                      {b.confirmation_ref && (
                        <span style={{
                          display: 'inline-block', padding: '2px 6px', borderRadius: 4,
                          fontFamily: 'monospace', fontSize: 10, fontWeight: 700,
                          background: 'rgba(74,159,232,0.12)', color: '#4A9FE8',
                          border: '1px solid rgba(74,159,232,0.25)',
                        }}>
                          REF: {b.confirmation_ref}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: '#7BAED4', marginTop: 2 }}>{b.caller_phone ?? '—'}</div>
                  </td>
                  <td style={td()}>
                    <div style={{ color: 'white' }}>{truckLabel}</div>
                    {(b.pickup_address || b.dropoff_address) && (
                      <div style={{ fontSize: 11, color: '#7BAED4', marginTop: 2 }}>
                        {b.pickup_address}
                        {b.pickup_address && b.dropoff_address && ' → '}
                        {b.dropoff_address}
                      </div>
                    )}
                  </td>
                  <td style={td()}>
                    <span style={{ color: '#7BAED4', fontSize: 12 }}>{formatScheduled(b)}</span>
                  </td>
                  <td style={td()}>
                    <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', padding: '3px 9px', borderRadius: 99, background: s.bg, color: s.color, textTransform: 'uppercase' as const }}>
                      {b.status.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td style={td()}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {b.status === 'pending' && (
                        <>
                          <button onClick={() => setConfirming(b)} disabled={!!busy} style={btn('#22C55E')}>Confirm</button>
                          <button onClick={() => cancelBooking(b)} disabled={!!busy} style={btn('#EF4444', true)}>Cancel</button>
                        </>
                      )}
                      {hasNotesAction && (
                        <button onClick={() => setViewingNotes(b)} style={btn('#4A9FE8', true)}>Notes</button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {confirming && (
        <ConfirmModal
          booking={confirming}
          businessName={businessName}
          busy={busy === `confirm:${confirming.id}`}
          onCancel={() => setConfirming(null)}
          onConfirm={() => confirmBooking(confirming)}
        />
      )}

      {viewingNotes && (
        <NotesModal booking={viewingNotes} onClose={() => setViewingNotes(null)} />
      )}

      {creating && (
        <NewBookingModal
          onClose={() => setCreating(false)}
          onCreated={() => { setCreating(false); reload(); showToast('Booking created.') }}
          onError={(m) => showToast(m)}
        />
      )}

      {toast && <div style={toastStyle}>{toast}</div>}
    </div>
  )
}

function ConfirmModal({ booking, businessName, busy, onCancel, onConfirm }: {
  booking: Booking; businessName: string; busy: boolean; onCancel: () => void; onConfirm: () => void
}) {
  const name = booking.caller_name ?? 'there'
  const when = booking.scheduled_start
    ? new Date(booking.scheduled_start).toLocaleString('en-AU', {
        weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
      })
    : 'the time discussed'
  return (
    <ModalShell onClose={onCancel}>
      <h2 style={{ fontSize: 18, fontWeight: 800, color: 'white', margin: 0, marginBottom: 12 }}>Send confirmation SMS</h2>
      <p style={{ fontSize: 13, color: '#7BAED4', marginBottom: 14 }}>
        Send a confirmation SMS to <strong style={{ color: 'white' }}>{booking.caller_phone ?? 'the caller'}</strong>?
      </p>
      <div style={{ padding: 14, borderRadius: 9, background: '#071829', border: '1px solid rgba(255,255,255,0.06)', fontSize: 13, color: 'white', marginBottom: 14, lineHeight: 1.5 }}>
        Hi {name}, your booking with {businessName} has been confirmed for {when}. See you then!
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
        <button onClick={onCancel} style={ghostBtn()}>Cancel</button>
        <button onClick={onConfirm} disabled={busy} style={btn('#22C55E')}>{busy ? 'Sending…' : 'Send SMS and confirm'}</button>
      </div>
    </ModalShell>
  )
}

function NotesModal({ booking, onClose }: { booking: Booking; onClose: () => void }) {
  const text = booking.description ?? ''
  return (
    <ModalShell onClose={onClose}>
      <h2 style={{ fontSize: 18, fontWeight: 800, color: 'white', margin: 0, marginBottom: 12 }}>Booking notes</h2>
      <div style={{ padding: 14, borderRadius: 9, background: '#071829', border: '1px solid rgba(255,255,255,0.06)', fontSize: 13, color: 'white', whiteSpace: 'pre-wrap' as const, lineHeight: 1.5 }}>
        {text}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
        <button onClick={onClose} style={ghostBtn()}>Close</button>
      </div>
    </ModalShell>
  )
}

function NewBookingModal({ onClose, onCreated, onError }: {
  onClose: () => void; onCreated: () => void; onError: (m: string) => void
}) {
  const [callerName, setCallerName] = useState('')
  const [callerPhone, setCallerPhone] = useState('')
  const [truckType, setTruckType] = useState('')
  const [pickupAddress, setPickupAddress] = useState('')
  const [dropoffAddress, setDropoffAddress] = useState('')
  const [scheduledStart, setScheduledStart] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!callerName.trim() || !callerPhone.trim() || !truckType || !scheduledStart) {
      onError('Caller name, phone, truck type, and scheduled time are required.')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/portal/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caller_name: callerName.trim(),
          caller_phone: callerPhone.trim(),
          truck_type: truckType,
          pickup_address: pickupAddress.trim() || null,
          dropoff_address: dropoffAddress.trim() || null,
          scheduled_start: scheduledStart,
          description: description.trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to create booking')
      onCreated()
    } catch (e) {
      onError((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <ModalShell onClose={onClose}>
      <h2 style={{ fontSize: 18, fontWeight: 800, color: 'white', margin: 0, marginBottom: 12 }}>New booking</h2>
      <p style={{ fontSize: 13, color: '#7BAED4', marginBottom: 14 }}>
        Manually create a booking. The caller will receive an SMS confirmation if enabled.
      </p>
      <form onSubmit={submit}>
        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 10 }}>
          <Field label="Caller name *">
            <input value={callerName} onChange={e => setCallerName(e.target.value)} required style={inputStyle} />
          </Field>
          <Field label="Caller phone *">
            <input value={callerPhone} onChange={e => setCallerPhone(e.target.value)} required type="tel" placeholder="04..." style={inputStyle} />
          </Field>
          <Field label="Truck type *">
            <select value={truckType} onChange={e => setTruckType(e.target.value)} required style={inputStyle}>
              <option value="">Select…</option>
              {TRUCK_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Pickup address">
            <input value={pickupAddress} onChange={e => setPickupAddress(e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Dropoff address">
            <input value={dropoffAddress} onChange={e => setDropoffAddress(e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Scheduled date & time *">
            <input value={scheduledStart} onChange={e => setScheduledStart(e.target.value)} required type="datetime-local" style={inputStyle} />
          </Field>
          <Field label="Notes / description">
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical' as const, fontFamily: 'Outfit, sans-serif' }} />
          </Field>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
          <button type="button" onClick={onClose} style={ghostBtn()}>Cancel</button>
          <button type="submit" disabled={submitting} style={btn('#E8622A')}>{submitting ? 'Creating…' : 'Create booking'}</button>
        </div>
      </form>
    </ModalShell>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column' as const, gap: 5 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: '#7BAED4', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>{label}</span>
      {children}
    </label>
  )
}

const inputStyle: React.CSSProperties = {
  padding: '9px 11px', borderRadius: 8, fontSize: 13,
  background: '#071829', border: '1px solid rgba(255,255,255,0.06)',
  color: 'white', fontFamily: 'Outfit, sans-serif', outline: 'none',
  width: '100%', boxSizing: 'border-box' as const,
}

// ---- atoms ----
function ModalShell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20,
      fontFamily: 'Outfit, sans-serif',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#0A1E38', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16,
        padding: 26, maxWidth: 520, width: '100%', maxHeight: '90vh', overflowY: 'auto' as const,
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
      }}>{children}</div>
    </div>
  )
}
function tabBtn(active: boolean): React.CSSProperties {
  return {
    padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700,
    background: active ? '#E8622A' : 'rgba(255,255,255,0.04)',
    border: `1px solid ${active ? '#E8622A' : 'rgba(255,255,255,0.08)'}`,
    color: active ? 'white' : '#7BAED4', cursor: 'pointer',
    fontFamily: 'Outfit, sans-serif',
  }
}
function btn(color: string, subtle = false): React.CSSProperties {
  return {
    padding: '6px 12px', borderRadius: 7, fontSize: 11, fontWeight: 700,
    background: subtle ? 'transparent' : color, border: `1px solid ${color}`,
    color: subtle ? color : 'white', cursor: 'pointer',
    fontFamily: 'Outfit, sans-serif', whiteSpace: 'nowrap' as const,
  }
}
function primaryBtn(): React.CSSProperties {
  return {
    padding: '9px 14px', borderRadius: 9, fontSize: 13, fontWeight: 700,
    background: '#E8622A', border: '1px solid #E8622A',
    color: 'white', cursor: 'pointer', fontFamily: 'Outfit, sans-serif',
    whiteSpace: 'nowrap' as const,
  }
}
function ghostBtn(): React.CSSProperties {
  return {
    padding: '9px 16px', borderRadius: 9, fontSize: 13, fontWeight: 600,
    background: 'transparent', border: '1px solid rgba(255,255,255,0.15)',
    color: '#7BAED4', cursor: 'pointer', fontFamily: 'Outfit, sans-serif',
  }
}
const tableWrap: React.CSSProperties = {
  background: '#0A1E38', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, overflow: 'auto',
}
const th = (): React.CSSProperties => ({
  textAlign: 'left' as const, padding: '11px 16px',
  fontSize: 11, fontWeight: 700, color: '#4A7FBB',
  textTransform: 'uppercase' as const, letterSpacing: '0.06em',
})
const td = (): React.CSSProperties => ({ padding: '12px 16px', fontSize: 13 })
const rowStyle = (i: number): React.CSSProperties => ({
  borderTop: '1px solid rgba(255,255,255,0.04)',
  background: i % 2 === 0 ? '#0A1E38' : '#071829',
})
const emptyCell = (): React.CSSProperties => ({
  padding: 32, textAlign: 'center' as const, fontSize: 13, color: '#7BAED4',
})
const toastStyle: React.CSSProperties = {
  position: 'fixed', bottom: 24, right: 24, zIndex: 100,
  padding: '12px 18px', background: '#0A1E38',
  border: '1px solid rgba(34,197,94,0.4)', borderRadius: 10,
  color: '#22C55E', fontSize: 13, fontWeight: 600,
  boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
}
