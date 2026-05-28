'use client'

import { useMemo } from 'react'
import { renderInTz, addDays, startOfMonth, startOfWeek } from '@/lib/scheduler-time'
import {
  SCHED_COLORS,
  blockColors,
  type SchedulerBooking,
  type SchedulerSettingsLite,
  type AllDayEvent,
} from './types'

// =====================================================================
// MonthGrid — standard month grid. Each day cell shows count + first
// 2-3 customer names as text rows. Click a day → jump to Day view.
//
// Brief §VIEWS REQUIRED → Month view. Less detail, more planning.
// =====================================================================

interface Props {
  anchor: Date
  bookings: SchedulerBooking[]
  settings: SchedulerSettingsLite | null
  allDayEvents: AllDayEvent[]
  /** Called when a day cell is clicked — UI jumps to Day view at that date. */
  onDayClick: (d: Date) => void
}

const DAY_NAMES_MON_FIRST = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const DAY_NAMES_SUN_FIRST = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function ymd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export default function MonthGrid({
  anchor,
  bookings,
  settings,
  allDayEvents,
  onDayClick,
}: Props) {
  const weekStartsOn = settings?.week_starts_on ?? 1
  const timezone = settings?.timezone ?? 'Australia/Melbourne'

  // Build a 6-row × 7-col grid covering the visible month + leading/trailing days.
  const days = useMemo(() => {
    const monthStart = startOfMonth(anchor)
    const gridStart = startOfWeek(monthStart, weekStartsOn)
    return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))
  }, [anchor, weekStartsOn])

  // Bucket bookings by day key (in tz).
  const bookingsByDay = useMemo(() => {
    const buckets = new Map<string, SchedulerBooking[]>()
    for (const b of bookings) {
      if (!b.scheduled_start) continue
      const r = renderInTz(new Date(b.scheduled_start), timezone)
      if (!r) continue
      const key = `${r.year}-${String(r.month).padStart(2, '0')}-${String(r.day).padStart(2, '0')}`
      const arr = buckets.get(key) ?? []
      arr.push(b)
      buckets.set(key, arr)
    }
    return buckets
  }, [bookings, timezone])

  const eventsByDay = useMemo(() => {
    const m = new Map<string, AllDayEvent[]>()
    for (const ev of allDayEvents) {
      const arr = m.get(ev.date) ?? []
      arr.push(ev)
      m.set(ev.date, arr)
    }
    return m
  }, [allDayEvents])

  const today = ymd(new Date())
  const currentMonth = anchor.getMonth()
  const dayNames = weekStartsOn === 0 ? DAY_NAMES_SUN_FIRST : DAY_NAMES_MON_FIRST

  return (
    <div
      style={{
        background: SCHED_COLORS.CARD_BG,
        border: `1px solid ${SCHED_COLORS.GRID_LINE_STRONG}`,
        borderRadius: 12,
        overflow: 'hidden',
        fontFamily: 'Outfit, sans-serif',
      }}
    >
      {/* Day-of-week header */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          background: SCHED_COLORS.NAV_BG,
          borderBottom: `1px solid ${SCHED_COLORS.GRID_LINE_STRONG}`,
        }}
      >
        {dayNames.map((label) => (
          <div
            key={label}
            style={{
              padding: '10px 12px',
              fontSize: 11,
              fontWeight: 600,
              color: '#F2F6FB',
              textTransform: 'uppercase',
              letterSpacing: 0.6,
              textAlign: 'center',
              borderLeft: `1px solid ${SCHED_COLORS.GRID_LINE}`,
            }}
          >
            {label}
          </div>
        ))}
      </div>

      {/* 6 × 7 grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gridAutoRows: 'minmax(96px, auto)',
        }}
      >
        {days.map((d) => {
          const key = ymd(d)
          const isToday = key === today
          const inMonth = d.getMonth() === currentMonth
          const cellBookings = bookingsByDay.get(key) ?? []
          const cellEvents = eventsByDay.get(key) ?? []
          const visible = cellBookings.slice(0, 3)
          const overflow = Math.max(0, cellBookings.length - visible.length)

          return (
            <div
              key={key}
              role="button"
              tabIndex={0}
              onClick={() => onDayClick(d)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onDayClick(d)
                }
              }}
              style={{
                borderLeft: `1px solid ${SCHED_COLORS.GRID_LINE}`,
                borderTop: `1px solid ${SCHED_COLORS.GRID_LINE}`,
                padding: 8,
                cursor: 'pointer',
                background: isToday
                  ? 'rgba(232,98,42,0.05)'
                  : inMonth
                    ? 'transparent'
                    : 'rgba(0,0,0,0.20)',
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <span
                  style={{
                    fontWeight: 700,
                    fontSize: 13,
                    color: isToday
                      ? SCHED_COLORS.ORANGE
                      : inMonth
                        ? '#F2F6FB'
                        : SCHED_COLORS.TEXT_DIM,
                  }}
                >
                  {d.getDate()}
                </span>
                {cellBookings.length > 0 && (
                  <span
                    style={{
                      fontSize: 10,
                      color: SCHED_COLORS.TEXT_DIM,
                      padding: '1px 6px',
                      background: 'rgba(255,255,255,0.06)',
                      borderRadius: 99,
                    }}
                  >
                    {cellBookings.length}
                  </span>
                )}
              </div>
              {cellEvents.slice(0, 1).map((ev, i) => (
                <div
                  key={`ev-${i}`}
                  title={ev.label}
                  style={{
                    fontSize: 9,
                    color: '#FFD9C7',
                    background: 'rgba(232,98,42,0.18)',
                    border: '1px solid rgba(232,98,42,0.45)',
                    borderRadius: 4,
                    padding: '1px 4px',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {ev.label}
                </div>
              ))}
              {visible.map((b) => {
                const colors = blockColors(b.status, b.color_hex)
                return (
                  <div
                    key={b.id}
                    title={`${b.caller_name ?? 'Unknown'} — ${b.description ?? ''}`}
                    style={{
                      fontSize: 10,
                      color: colors.text,
                      background: colors.bg,
                      borderLeft: `2px solid ${colors.border}`,
                      borderRadius: 2,
                      padding: '1px 4px',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      textDecoration: colors.textDecoration ?? 'none',
                      opacity: colors.dim ? 0.6 : 1,
                    }}
                  >
                    {b.caller_name ?? 'Unknown'}
                  </div>
                )
              })}
              {overflow > 0 && (
                <div
                  style={{
                    fontSize: 9,
                    color: SCHED_COLORS.TEXT_DIM,
                    paddingLeft: 4,
                  }}
                >
                  +{overflow} more
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
