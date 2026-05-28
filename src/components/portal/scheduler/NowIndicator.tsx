'use client'

import { useEffect, useState } from 'react'
import { renderInTz } from '@/lib/scheduler-time'
import { SCHED_COLORS } from './types'

// =====================================================================
// NowIndicator — red horizontal line at "now" on the time axis.
//
// Renders ONLY if "now" in the client's tz falls inside the visible
// day range AND inside the visible hour range. Spans across all
// day columns (the parent positions it via CSS grid).
//
// Updates every 60s via setInterval.
// =====================================================================

interface Props {
  days: Date[]
  timezone: string
  startHour: number
  endHour: number
  hourHeight: number
  timeColumnWidth: number
}

function ymd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export default function NowIndicator({
  days,
  timezone,
  startHour,
  endHour,
  hourHeight,
  timeColumnWidth,
}: Props) {
  const [now, setNow] = useState<Date>(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  const rendered = renderInTz(now, timezone)
  if (!rendered) return null

  // Find which day column "now" lives in (if any).
  const nowKey = `${rendered.year}-${String(rendered.month).padStart(2, '0')}-${String(rendered.day).padStart(2, '0')}`
  const dayIndex = days.findIndex((d) => ymd(d) === nowKey)
  if (dayIndex === -1) return null

  const minutesFromGridStart =
    rendered.hour * 60 + rendered.minute - startHour * 60
  const gridMinutes = (endHour - startHour) * 60
  if (minutesFromGridStart < 0 || minutesFromGridStart > gridMinutes) return null

  const top = (minutesFromGridStart / 60) * hourHeight
  const totalCols = days.length
  const leftPct = (dayIndex / totalCols) * 100
  const widthPct = (1 / totalCols) * 100

  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        top,
        left: `calc(${timeColumnWidth}px + ${leftPct}% - ${(timeColumnWidth * leftPct) / 100}px)`,
        // The left offset is awkward because the grid's first column is
        // a fixed-width time rail. We approximate by treating the day
        // columns as occupying the remaining width.
        width: `calc(${widthPct}% - ${(timeColumnWidth * widthPct) / 100}px)`,
        pointerEvents: 'none',
        zIndex: 5,
      }}
    >
      {/* Dot at the left edge of the day column */}
      <div
        style={{
          position: 'absolute',
          left: -5,
          top: -4,
          width: 10,
          height: 10,
          borderRadius: 99,
          background: SCHED_COLORS.STATUS_CANCELLED,
          boxShadow: `0 0 8px ${SCHED_COLORS.STATUS_CANCELLED}AA`,
        }}
      />
      {/* Horizontal line across the day column */}
      <div
        style={{
          height: 2,
          background: SCHED_COLORS.STATUS_CANCELLED,
          opacity: 0.85,
        }}
      />
    </div>
  )
}
