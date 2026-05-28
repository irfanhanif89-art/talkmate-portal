'use client'

import { useEffect, useState } from 'react'
import {
  SCHED_COLORS,
  blockColors,
  priceHiddenFromDriver,
  type SchedulerBooking,
  type SchedulerDriver,
} from './types'

// =====================================================================
// JobSidePanel — right-rail slide-in panel when a block is clicked.
//
// Brief §1: "The grid stays visible (no modal). Side panel takes the
// right 380px of the viewport (full height)."
//
// Mobile (<768px) the panel becomes a bottom sheet — handled by the
// responsive layout, not this component.
//
// Actions:
//   - Mark Started / Mark Complete (status transitions; trigger
//     auto-stamps actual_start/actual_end)
//   - Reassign driver (opens dropdown, calls /reassign)
//   - Edit / Cancel (Session B — Edit just sets a flag for now)
//
// Brief §DRIVER PRICE VISIBILITY rendered as a chip next to the price.
// =====================================================================

interface Props {
  booking: SchedulerBooking
  drivers: SchedulerDriver[]
  baseUrl: string // e.g. /api/portal/bookings or admin equivalent
  onClose: () => void
  onUpdated: (b: SchedulerBooking) => void
  onCancel?: (b: SchedulerBooking) => void
}

function fmtDateTime(iso: string | null, timezone?: string): string {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    return d.toLocaleString('en-AU', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      ...(timezone ? { timeZone: timezone } : {}),
    })
  } catch {
    return '—'
  }
}

function fmtDuration(mins: number | null): string {
  if (!mins) return '—'
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

const STATUSES_TO_LABEL: Record<SchedulerBooking['status'], string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  started: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'No show',
  declined: 'Declined',
}

export default function JobSidePanel({
  booking: initial,
  drivers,
  baseUrl,
  onClose,
  onUpdated,
  onCancel,
}: Props) {
  const [booking, setBooking] = useState<SchedulerBooking>(initial)
  const [busy, setBusy] = useState<string | null>(null)
  const [showReassign, setShowReassign] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setBooking(initial)
  }, [initial])

  // Esc to close.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const driver = booking.driver_id
    ? (drivers.find((d) => d.id === booking.driver_id) ?? null)
    : null
  const colors = blockColors(booking.status, booking.color_hex)
  const priceHidden = priceHiddenFromDriver(booking)

  async function patchStatus(next: SchedulerBooking['status']) {
    setBusy(next)
    setError(null)
    const res = await fetch(`${baseUrl}/${booking.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    })
    if (res.ok) {
      const { booking: updated } = await res.json()
      setBooking(updated as SchedulerBooking)
      onUpdated(updated as SchedulerBooking)
    } else {
      const { error: msg } = await res.json().catch(() => ({ error: 'failed' }))
      setError(msg ?? 'Update failed')
    }
    setBusy(null)
  }

  async function patchDriver(nextDriverId: string | null) {
    setBusy('driver')
    setError(null)
    const res = await fetch(`${baseUrl}/${booking.id}/reassign`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ driver_id: nextDriverId }),
    })
    if (res.ok) {
      const { booking: updated } = await res.json()
      setBooking(updated as SchedulerBooking)
      onUpdated(updated as SchedulerBooking)
      setShowReassign(false)
    } else {
      const data = await res.json().catch(() => ({ error: 'failed' }))
      if (res.status === 409) {
        const ok = window.confirm(
          'This driver has a conflicting booking. Assign anyway?',
        )
        if (ok) {
          const res2 = await fetch(`${baseUrl}/${booking.id}/reassign`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ driver_id: nextDriverId, force: true }),
          })
          if (res2.ok) {
            const { booking: updated } = await res2.json()
            setBooking(updated as SchedulerBooking)
            onUpdated(updated as SchedulerBooking)
            setShowReassign(false)
          }
        }
      } else {
        setError(data.error ?? 'Reassign failed')
      }
    }
    setBusy(null)
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Booking details for ${booking.caller_name ?? 'unknown customer'}`}
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: 'min(380px, 100vw)',
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
      {/* Header */}
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
          <div style={{ fontSize: 11, color: SCHED_COLORS.TEXT_DIM, letterSpacing: 0.5 }}>
            JOB
          </div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>
            #{booking.id.slice(0, 8).toUpperCase()}
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Close panel"
          style={{
            background: 'transparent',
            border: `1px solid ${SCHED_COLORS.GRID_LINE_STRONG}`,
            color: '#F2F6FB',
            borderRadius: 8,
            width: 32,
            height: 32,
            cursor: 'pointer',
            fontSize: 16,
          }}
        >
          ✕
        </button>
      </div>

      {/* Body */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: 18,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        {/* Customer */}
        <Section label="Customer">
          <Row label="Name" value={booking.caller_name ?? '—'} />
          <Row
            label="Phone"
            value={
              booking.caller_phone ? (
                <a
                  href={`tel:${booking.caller_phone}`}
                  style={{ color: SCHED_COLORS.ORANGE, textDecoration: 'none' }}
                >
                  📞 {booking.caller_phone}
                </a>
              ) : (
                '—'
              )
            }
          />
        </Section>

        {/* Service */}
        <Section label="Service">
          <Row label="Description" value={booking.description ?? '—'} />
          {booking.pickup_address && (
            <Row label="Pickup" value={booking.pickup_address} />
          )}
          {booking.dropoff_address && (
            <Row label="Delivery" value={booking.dropoff_address} />
          )}
        </Section>

        {/* Schedule */}
        <Section label="Schedule">
          <Row label="When" value={fmtDateTime(booking.scheduled_start)} />
          <Row label="Duration" value={fmtDuration(booking.duration_minutes)} />
          {booking.actual_start && (
            <Row label="Started" value={fmtDateTime(booking.actual_start)} />
          )}
          {booking.actual_end && (
            <Row label="Completed" value={fmtDateTime(booking.actual_end)} />
          )}
        </Section>

        {/* Money */}
        <Section label="Money">
          <Row
            label="Price"
            value={
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span>
                  {booking.estimated_value !== null
                    ? `$${Math.round(booking.estimated_value)}`
                    : '—'}
                </span>
                {booking.estimated_value !== null && (
                  <span
                    style={{
                      fontSize: 9,
                      padding: '2px 6px',
                      borderRadius: 99,
                      background: priceHidden
                        ? 'rgba(156,163,175,0.18)'
                        : 'rgba(34,197,94,0.18)',
                      color: priceHidden ? '#C8D2DC' : '#A7F0BD',
                      letterSpacing: 0.3,
                    }}
                  >
                    {priceHidden ? 'Hidden from driver' : 'Driver sees price'}
                  </span>
                )}
              </div>
            }
          />
          {booking.payment_method && (
            <Row
              label="Payment"
              value={
                booking.payment_method.charAt(0).toUpperCase() +
                booking.payment_method.slice(1)
              }
            />
          )}
        </Section>

        {/* Driver */}
        <Section label="Driver">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <div style={{ fontSize: 13 }}>{driver?.name ?? 'Unassigned'}</div>
            <button
              onClick={() => setShowReassign((s) => !s)}
              disabled={busy === 'driver'}
              style={ghostBtnSmall}
            >
              {showReassign ? 'Cancel' : 'Reassign'}
            </button>
          </div>
          {showReassign && (
            <div
              style={{
                marginTop: 8,
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}
            >
              <button
                onClick={() => patchDriver(null)}
                style={driverPickStyle(booking.driver_id === null)}
              >
                Unassign
              </button>
              {drivers.map((d) => (
                <button
                  key={d.id}
                  onClick={() => patchDriver(d.id)}
                  style={driverPickStyle(booking.driver_id === d.id)}
                >
                  {d.name}
                </button>
              ))}
            </div>
          )}
        </Section>

        {/* Status */}
        <Section label="Status">
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 10px',
              borderRadius: 99,
              background: colors.bg,
              border: `1px solid ${colors.border}`,
              color: colors.text,
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: 99,
                background: colors.border,
              }}
            />
            {STATUSES_TO_LABEL[booking.status]}
          </div>
          <div style={{ marginTop: 12, display: 'flex', gap: 6, flexWrap: 'wrap' as const }}>
            {(booking.status === 'pending' || booking.status === 'confirmed') && (
              <button
                onClick={() => patchStatus('started')}
                disabled={busy !== null}
                style={primaryBtn}
              >
                {busy === 'started' ? 'Saving…' : 'Mark Started'}
              </button>
            )}
            {booking.status === 'started' && (
              <button
                onClick={() => patchStatus('completed')}
                disabled={busy !== null}
                style={primaryBtn}
              >
                {busy === 'completed' ? 'Saving…' : 'Mark Complete'}
              </button>
            )}
          </div>
        </Section>

        {/* Notes */}
        {booking.notes && (
          <Section label="Notes">
            <div
              style={{
                fontSize: 13,
                whiteSpace: 'pre-wrap',
                color: '#D6DCE4',
              }}
            >
              {booking.notes}
            </div>
          </Section>
        )}

        {error && (
          <div
            style={{
              padding: 10,
              background: 'rgba(239,68,68,0.12)',
              border: '1px solid rgba(239,68,68,0.5)',
              borderRadius: 8,
              color: '#FBB2B2',
              fontSize: 12,
            }}
          >
            {error}
          </div>
        )}
      </div>

      {/* Footer */}
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
        {onCancel &&
          booking.status !== 'cancelled' &&
          booking.status !== 'completed' && (
            <button
              onClick={() => onCancel(booking)}
              disabled={busy !== null}
              style={dangerBtn}
            >
              Cancel job
            </button>
          )}
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {children}
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: 12,
        fontSize: 13,
      }}
    >
      <span style={{ color: SCHED_COLORS.TEXT_DIM, flexShrink: 0 }}>{label}</span>
      <span style={{ textAlign: 'right' }}>{value}</span>
    </div>
  )
}

const ghostBtnSmall = {
  background: 'transparent',
  border: `1px solid ${SCHED_COLORS.GRID_LINE_STRONG}`,
  color: '#F2F6FB',
  padding: '4px 10px',
  borderRadius: 6,
  fontSize: 11,
  cursor: 'pointer',
} as const

const primaryBtn = {
  background: SCHED_COLORS.ORANGE,
  border: 'none',
  color: '#fff',
  padding: '7px 14px',
  borderRadius: 8,
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
} as const

const dangerBtn = {
  background: 'transparent',
  border: '1px solid rgba(239,68,68,0.6)',
  color: '#FBB2B2',
  padding: '7px 14px',
  borderRadius: 8,
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
} as const

function driverPickStyle(active: boolean) {
  return {
    textAlign: 'left' as const,
    padding: '7px 10px',
    borderRadius: 6,
    border: active
      ? `1px solid ${SCHED_COLORS.ORANGE}`
      : `1px solid ${SCHED_COLORS.GRID_LINE_STRONG}`,
    background: active ? 'rgba(232,98,42,0.10)' : 'transparent',
    color: '#F2F6FB',
    fontSize: 12,
    cursor: 'pointer',
  }
}
