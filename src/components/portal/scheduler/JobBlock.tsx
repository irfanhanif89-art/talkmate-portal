'use client'

import { useRef, useState } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { blockColors, SCHED_COLORS, type SchedulerBooking } from './types'

// =====================================================================
// JobBlock — the colored block on the grid.
//
// Layout responsibilities:
//   - Top/height are computed by the parent grid (the grid knows the
//     hour range, increment, and column width).
//   - Status drives border / bg color (with optional color_hex override).
//   - Compact mode (week/month view) shows just customer + time.
//     Full mode (day view) shows customer, service, driver, price.
//
// Click handling: parent passes onClick. JobBlock itself just exposes
// the click area + keyboard focus per the brief §ACCESSIBILITY.
// =====================================================================

interface Props {
  booking: SchedulerBooking
  /** Absolute top in px within the parent grid column. */
  top: number
  /** Height in px (= duration * pxPerMin). */
  height: number
  /** 0..1 — horizontal position when overlapping blocks share a column. */
  left?: number
  /** 0..1 — width when overlapping. Default 1.0. */
  width?: number
  /** Compact = just customer + time. Full = service, driver, price. */
  compact?: boolean
  /** Driver name to display in full mode. Resolved by the parent. */
  driverName?: string | null
  /** When true the parent highlights this block (selected). */
  selected?: boolean
  /** Session B — enable drag. Off by default so MonthGrid stays static. */
  draggable?: boolean
  /** Session B — enable edge-resize handle. Off by default. */
  resizable?: boolean
  /** px-per-minute from the parent grid, used to convert resize deltas. */
  pxPerMin?: number
  /** Increment in minutes for resize snap. */
  incrementMins?: number
  /** Called when the user finishes resizing — parent calls /reschedule. */
  onResize?: (booking: SchedulerBooking, newDurationMins: number) => void
  onClick: (b: SchedulerBooking) => void
}

function fmtTime(iso: string | null, timezone?: string): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleTimeString('en-AU', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      ...(timezone ? { timeZone: timezone } : {}),
    })
  } catch {
    return '—'
  }
}

function fmtPrice(n: number | null): string {
  if (n === null || n === undefined || Number.isNaN(n)) return ''
  return `$${Math.round(n)}`
}

export default function JobBlock({
  booking,
  top,
  height,
  left = 0,
  width = 1,
  compact = false,
  driverName,
  selected = false,
  draggable = false,
  resizable = false,
  pxPerMin,
  incrementMins,
  onResize,
  onClick,
}: Props) {
  const colors = blockColors(booking.status, booking.color_hex)
  const customer = booking.caller_name ?? 'Unknown'
  const service = booking.description ?? ''
  const safeHeight = Math.max(height, 22)

  // Drag support. Disabled when draggable=false (MonthGrid cells, or
  // when the block status doesn't allow rescheduling).
  const isDragDisabled =
    !draggable ||
    booking.status === 'completed' ||
    booking.status === 'cancelled' ||
    booking.status === 'declined' ||
    booking.status === 'no_show'
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: booking.id,
    disabled: isDragDisabled,
  })
  const dragStyle: React.CSSProperties = transform
    ? { transform: CSS.Translate.toString(transform) }
    : {}

  // Resize state — tracks the current resize-in-progress height so we
  // can preview the new size before committing. Committed by onResize
  // which calls back to the parent (which fires /reschedule).
  const [resizingDelta, setResizingDelta] = useState<number | null>(null)
  const resizeStartY = useRef<number | null>(null)
  const resizeStartHeight = useRef<number>(0)
  const showResizeHandle =
    resizable &&
    !isDragDisabled &&
    !!pxPerMin &&
    !!incrementMins &&
    !!onResize

  const ariaLabel = [
    `Booking for ${customer}`,
    booking.scheduled_start ? `at ${fmtTime(booking.scheduled_start)}` : '',
    booking.duration_minutes ? `duration ${booking.duration_minutes} minutes` : '',
    `driver ${driverName ?? 'unassigned'}`,
    `status ${booking.status}`,
    'Press Enter to view details.',
  ]
    .filter(Boolean)
    .join(', ')

  return (
    <div
      ref={setNodeRef}
      // dnd-kit spreads role/tabIndex/aria-* — apply first so our
      // explicit role="button"/tabIndex below take precedence.
      {...(draggable ? attributes : {})}
      {...(draggable ? listeners : {})}
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      data-status={booking.status}
      data-booking-id={booking.id}
      data-dragging={isDragging ? 'true' : undefined}
      onClick={(e) => {
        if (isDragging) return
        e.stopPropagation()
        onClick(booking)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick(booking)
        }
      }}
      style={{
        position: 'absolute',
        top: `${top}px`,
        left: `calc(${left * 100}% + 2px)`,
        width: `calc(${width * 100}% - 4px)`,
        height: `${resizingDelta !== null ? Math.max(22, safeHeight + resizingDelta) : safeHeight}px`,
        background: colors.bg,
        // Drag transform applied on top of the layout position.
        ...dragStyle,
        // Float the block above siblings while being dragged.
        zIndex: isDragging ? 50 : 1,
        // No transition during drag (causes lag); restore after.
        ...(isDragging ? {} : { transition: 'transform 0.12s ease' }),
        cursor: isDragDisabled ? 'pointer' : (isDragging ? 'grabbing' : 'grab'),
        // Use long-hand sides to avoid React's "mixing shorthand and
        // non-shorthand" warning when borderLeftWidth needs the chunky
        // 4px accent override.
        borderTopWidth: '1.5px',
        borderRightWidth: '1.5px',
        borderBottomWidth: '1.5px',
        borderLeftWidth: '4px',
        borderStyle: colors.borderStyle,
        borderColor: colors.border,
        borderRadius: 6,
        padding: compact ? '3px 6px' : '5px 8px',
        overflow: 'hidden',
        color: colors.text,
        fontSize: compact ? 11 : 12,
        lineHeight: 1.25,
        opacity: colors.dim ? 0.6 : 1,
        outline: selected
          ? `2px solid ${SCHED_COLORS.ORANGE}`
          : 'none',
        outlineOffset: '-1px',
        // (transition already set above based on isDragging)
        boxShadow: selected
          ? '0 6px 16px rgba(232,98,42,0.28)'
          : '0 2px 4px rgba(0,0,0,0.25)',
        textDecoration: colors.textDecoration ?? 'none',
        userSelect: 'none',
      }}
    >
      {colors.pulse && (
        <span
          aria-hidden
          style={{
            position: 'absolute',
            top: 6,
            right: 6,
            width: 6,
            height: 6,
            borderRadius: 99,
            background: colors.border,
            boxShadow: `0 0 0 0 ${colors.border}66`,
            animation: 'scheduler-pulse 1.6s ease-in-out infinite',
          }}
        />
      )}
      <div style={{ fontWeight: 700, color: '#FFF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {customer}
      </div>
      {!compact && service && (
        <div
          style={{
            color: colors.text,
            opacity: 0.85,
            fontSize: 11,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {service}
        </div>
      )}
      {!compact && (driverName || booking.estimated_value) && safeHeight > 50 && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 6,
            color: colors.text,
            opacity: 0.75,
            fontSize: 10,
            marginTop: 2,
          }}
        >
          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {driverName ?? 'Unassigned'}
          </span>
          {booking.estimated_value !== null && (
            <span style={{ fontWeight: 600 }}>{fmtPrice(booking.estimated_value)}</span>
          )}
        </div>
      )}
      {compact && (
        <div style={{ color: colors.text, opacity: 0.85, fontSize: 10, whiteSpace: 'nowrap' }}>
          {fmtTime(booking.scheduled_start)}
        </div>
      )}
      {showResizeHandle && (
        // Bottom-edge resize handle. Uses native pointer events
        // (not @dnd-kit) because the resize gesture lives entirely
        // within the block — no drop targets, just a height update +
        // a duration recalculation on release.
        <div
          aria-label="Resize duration"
          onPointerDown={(e) => {
            e.stopPropagation()
            ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
            resizeStartY.current = e.clientY
            resizeStartHeight.current = safeHeight
            setResizingDelta(0)
          }}
          onPointerMove={(e) => {
            if (resizeStartY.current === null) return
            setResizingDelta(e.clientY - resizeStartY.current)
          }}
          onPointerUp={(e) => {
            if (resizeStartY.current === null) return
            const delta = e.clientY - resizeStartY.current
            resizeStartY.current = null
            setResizingDelta(null)
            const currentDuration = booking.duration_minutes ?? 60
            const deltaMin = delta / (pxPerMin ?? 1)
            const incr = incrementMins ?? 30
            const newDuration = Math.max(
              incr,
              Math.round((currentDuration + deltaMin) / incr) * incr,
            )
            if (newDuration !== currentDuration) {
              onResize?.(booking, newDuration)
            }
          }}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: 8,
            cursor: 'ns-resize',
            background: 'linear-gradient(180deg, transparent, rgba(255,255,255,0.10))',
          }}
        />
      )}
      {/* Keyframes for the started-status pulse. Scoped via the
          class-less name (browsers dedupe same-name @keyframes). */}
      <style>{`
        @keyframes scheduler-pulse {
          0%   { box-shadow: 0 0 0 0 ${colors.border}66; }
          70%  { box-shadow: 0 0 0 6px ${colors.border}00; }
          100% { box-shadow: 0 0 0 0 ${colors.border}00; }
        }
      `}</style>
    </div>
  )
}
