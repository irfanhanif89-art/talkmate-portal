'use client'

import { SCHED_COLORS, type AllDayEvent } from './types'

// =====================================================================
// AllDayRow — thin lane above the time grid for public holidays,
// closures, and driver unavailability. Brief §7.
// =====================================================================

interface Props {
  days: Date[]
  events: AllDayEvent[]
  timeColumnWidth: number
}

function ymd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function chipStyle(type: AllDayEvent['type']) {
  switch (type) {
    case 'holiday':
      return {
        bg: 'rgba(232,98,42,0.18)',
        border: 'rgba(232,98,42,0.55)',
        color: '#FFD9C7',
        prefix: '🏖',
      }
    case 'closure':
      return {
        bg: 'rgba(156,163,175,0.18)',
        border: 'rgba(156,163,175,0.55)',
        color: '#D6DCE4',
        prefix: '🔒',
      }
    case 'driver_off':
      return {
        bg: 'rgba(168,85,247,0.18)',
        border: 'rgba(168,85,247,0.55)',
        color: '#E4D2FF',
        prefix: '👤',
      }
  }
}

export default function AllDayRow({ days, events, timeColumnWidth }: Props) {
  const eventsByDay = new Map<string, AllDayEvent[]>()
  for (const ev of events) {
    const arr = eventsByDay.get(ev.date) ?? []
    arr.push(ev)
    eventsByDay.set(ev.date, arr)
  }
  const hasAny = events.length > 0
  if (!hasAny) return null

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `${timeColumnWidth}px repeat(${days.length}, 1fr)`,
        background: 'rgba(232,98,42,0.04)',
        borderBottom: `1px solid ${SCHED_COLORS.GRID_LINE_STRONG}`,
        minHeight: 28,
      }}
    >
      <div
        style={{
          fontSize: 9,
          color: SCHED_COLORS.TEXT_DIM,
          textAlign: 'center',
          paddingTop: 8,
          fontWeight: 600,
          letterSpacing: 0.5,
          borderRight: `1px solid ${SCHED_COLORS.GRID_LINE_STRONG}`,
        }}
      >
        ALL DAY
      </div>
      {days.map((d) => {
        const dayEvents = eventsByDay.get(ymd(d)) ?? []
        return (
          <div
            key={d.toISOString()}
            style={{
              borderLeft: `1px solid ${SCHED_COLORS.GRID_LINE}`,
              padding: '4px 4px',
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
              minHeight: 28,
            }}
          >
            {dayEvents.map((ev, idx) => {
              const s = chipStyle(ev.type)
              return (
                <div
                  key={`${ev.date}-${idx}`}
                  title={ev.label}
                  style={{
                    background: s.bg,
                    border: `1px solid ${s.border}`,
                    borderRadius: 4,
                    padding: '2px 6px',
                    fontSize: 10,
                    color: s.color,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  <span style={{ marginRight: 4 }}>{s.prefix}</span>
                  {ev.label}
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
