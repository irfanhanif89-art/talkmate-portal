'use client'

import { useEffect, useMemo, useState } from 'react'

interface Booking {
  id: string
  caller_name: string | null
  caller_phone: string
  booking_type: string | null
  service_requested: string | null
  preferred_date: string | null
  preferred_time: string | null
  notes: string | null
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'no_show'
  confirmation_sms_sent: boolean
  created_at: string
}

type Tab = 'pending' | 'confirmed' | 'all'

const STATUS_STYLE: Record<Booking['status'], { bg: string; color: string }> = {
  pending: { bg: 'rgba(245,158,11,0.15)', color: '#F59E0B' },
  confirmed: { bg: 'rgba(34,197,94,0.15)', color: '#22C55E' },
  cancelled: { bg: 'rgba(107,114,128,0.15)', color: '#9CA3AF' },
  completed: { bg: 'rgba(74,159,232,0.15)', color: '#4A9FE8' },
  no_show: { bg: 'rgba(239,68,68,0.15)', color: '#EF4444' },
}

export default function BookingsView({ businessName }: { businessName: string }) {
  const [list, setList] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('pending')
  const [confirming, setConfirming] = useState<Booking | null>(null)
  const [viewingNotes, setViewingNotes] = useState<Booking | null>(null)
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
        ? { ...x, status: 'confirmed', confirmation_sms_sent: true }
        : x))
      showToast(data.webhook === 'fired' ? 'Booking confirmed. SMS sent.' : 'Booking confirmed.')
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
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'white', margin: 0 }}>Bookings</h1>
        <p style={{ fontSize: 13, color: '#7BAED4', margin: '4px 0 0 0' }}>
          Booking requests from callers. Confirm them to send the caller an automatic SMS.
        </p>
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
              {['Received', 'Caller', 'Service', 'Preferred', 'Status', 'Actions'].map(h => (
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
              const preferred = [b.preferred_date, b.preferred_time].filter(Boolean).join(' · ')
              return (
                <tr key={b.id} style={rowStyle(i)}>
                  <td style={td()}>
                    <span style={{ color: '#7BAED4', fontSize: 12 }}>
                      {new Date(b.created_at).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </td>
                  <td style={td()}>
                    <div style={{ fontWeight: 600, color: 'white' }}>{b.caller_name ?? 'Unknown'}</div>
                    <div style={{ fontSize: 11, color: '#7BAED4', marginTop: 2 }}>{b.caller_phone}</div>
                  </td>
                  <td style={td()}>
                    <div style={{ color: 'white' }}>{b.service_requested ?? '—'}</div>
                    {b.booking_type && <div style={{ fontSize: 11, color: '#7BAED4', marginTop: 2 }}>{b.booking_type.replace(/_/g, ' ')}</div>}
                  </td>
                  <td style={td()}><span style={{ color: '#7BAED4', fontSize: 12 }}>{preferred || '—'}</span></td>
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
                      {b.notes && (
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

      {toast && <div style={toastStyle}>{toast}</div>}
    </div>
  )
}

function ConfirmModal({ booking, businessName, busy, onCancel, onConfirm }: {
  booking: Booking; businessName: string; busy: boolean; onCancel: () => void; onConfirm: () => void
}) {
  const name = booking.caller_name ?? 'there'
  const when = [booking.preferred_date, booking.preferred_time].filter(Boolean).join(' at ') || 'the time discussed'
  return (
    <ModalShell onClose={onCancel}>
      <h2 style={{ fontSize: 18, fontWeight: 800, color: 'white', margin: 0, marginBottom: 12 }}>Send confirmation SMS</h2>
      <p style={{ fontSize: 13, color: '#7BAED4', marginBottom: 14 }}>
        Send a confirmation SMS to <strong style={{ color: 'white' }}>{booking.caller_phone}</strong>?
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
  return (
    <ModalShell onClose={onClose}>
      <h2 style={{ fontSize: 18, fontWeight: 800, color: 'white', margin: 0, marginBottom: 12 }}>Booking notes</h2>
      <div style={{ padding: 14, borderRadius: 9, background: '#071829', border: '1px solid rgba(255,255,255,0.06)', fontSize: 13, color: 'white', whiteSpace: 'pre-wrap' as const, lineHeight: 1.5 }}>
        {booking.notes}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
        <button onClick={onClose} style={ghostBtn()}>Close</button>
      </div>
    </ModalShell>
  )
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
