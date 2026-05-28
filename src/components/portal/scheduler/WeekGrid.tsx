'use client'

import { useMemo } from 'react'
import {
  DndContext,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { renderInTz, addDays, startOfWeek } from '@/lib/scheduler-time'
import JobBlock from './JobBlock'
import NowIndicator from './NowIndicator'
import AllDayRow from './AllDayRow'
import {
  SCHED_COLORS,
  type SchedulerBooking,
  type SchedulerDriver,
  type SchedulerSettingsLite,
  type AllDayEvent,
} from './types'
import { layoutOverlapping, minutesToPx } from './layout'
import { useSchedulerDnd } from './useSchedulerDnd'

// =====================================================================
// WeekGrid — Bizzow-style time-on-Y, days-as-columns layout.
//
// Layout:
//   ┌─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┐
//   │     │ Mon │ Tue │ Wed │ Thu │ Fri │ Sat │ Sun │  <- day header
//   ├─────┼─────────────────────────────────────────┤
//   │     │ all day events                         │  <- AllDayRow
//   ├─────┼─────┬─────┬─────┬─────┬─────┬─────┬─────┤
//   │ 6AM │     │     │     │     │     │     │     │
//   │ 7AM │     │     │     │     │     │     │     │
//   │ 8AM │     │ blk │     │ blk │     │     │     │
//   │ ... │     │     │     │     │     │     │     │
//   └─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┘
//
// Each day's blocks are absolutely positioned within its column. The
// "now" red line spans the full grid, only rendered when today is in
// the visible week.
// =====================================================================

interface Props {
  anchor: Date
  bookings: SchedulerBooking[]
  drivers: SchedulerDriver[]
  settings: SchedulerSettingsLite | null
  allDayEvents: AllDayEvent[]
  selectedId?: string | null
  /** API base for drag-to-reschedule. e.g. /api/portal/bookings */
  baseUrl?: string
  /** Called after a successful drag-reschedule (parent merges into state). */
  onBookingUpdated?: (b: SchedulerBooking) => void
  /** Surface a toast — e.g. on reschedule failure. */
  onError?: (msg: string) => void
  onJobClick: (b: SchedulerBooking) => void
  onEmptyClick: (dateIso: string, hour: number, minute: number) => void
}

const HOUR_HEIGHT = 56 // px per hour
const HEADER_HEIGHT = 38
const TIME_COL_WIDTH = 56

function fmtDayHeader(d: Date): string {
  return d.toLocaleDateString('en-AU', {
    weekday: 'short',
    day: 'numeric',
  })
}

function ymd(d: Date): string {
  // Local-time YYYY-MM-DD. Used for keying all-day events.
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export default function WeekGrid({
  anchor,
  bookings,
  drivers,
  settings,
  allDayEvents,
  selectedId,
  baseUrl,
  onBookingUpdated,
  onError,
  onJobClick,
  onEmptyClick,
}: Props) {
  const weekStartsOn = settings?.week_starts_on ?? 1
  const showWeekend = settings?.show_weekend ?? true
  const startHour = settings?.default_start_hour ?? 6
  const endHour = settings?.default_end_hour ?? 20
  const timezone = settings?.timezone ?? 'Australia/Melbourne'

  const weekStart = useMemo(
    () => startOfWeek(anchor, weekStartsOn),
    [anchor, weekStartsOn],
  )

  const days = useMemo(() => {
    const all = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
    if (showWeekend) return all
    // Drop Saturday + Sunday (JS getDay() 6 and 0).
    return all.filter((d) => d.getDay() !== 0 && d.getDay() !== 6)
  }, [weekStart, showWeekend])

  const gridStartMin = startHour * 60
  const gridEndMin = endHour * 60
  const totalMinutes = gridEndMin - gridStartMin
  const pxPerMin = HOUR_HEIGHT / 60
  const gridHeight = totalMinutes * pxPerMin

  // Bucket bookings by day key (in tz). drop unscheduled.
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

  const driverNameById = useMemo(() => {
    const m = new Map<string, string>()
    for (const d of drivers) m.set(d.id, d.name)
    return m
  }, [drivers])

  const hours = useMemo(() => {
    const out: number[] = []
    for (let h = startHour; h <= endHour; h++) out.push(h)
    return out
  }, [startHour, endHour])

  // Session B — drag-to-reschedule. Disabled when baseUrl is missing
  // (means the parent didn't wire it; e.g. a future read-only view).
  const dragEnabled = !!baseUrl && !!onBookingUpdated
  const dnd = useSchedulerDnd({
    bookings,
    timezone,
    pxPerMin,
    incrementMins: settings?.time_increment_mins ?? 30,
    startHour,
    endHour,
    baseUrl: baseUrl ?? '',
    onUpdated: onBookingUpdated ?? (() => {}),
    onError: onError ?? (() => {}),
  })
  const sensors = useSensors(
    useSensor(PointerSensor, {
      // 5px movement threshold prevents click-vs-drag confusion.
      activationConstraint: { distance: 5 },
    }),
  )

  const gridBody = (
    <div
      style={{
        background: SCHED_COLORS.CARD_BG,
        border: `1px solid ${SCHED_COLORS.GRID_LINE_STRONG}`,
        borderRadius: 12,
        overflow: 'hidden',
        fontFamily: 'Outfit, sans-serif',
      }}
    >
      {/* Day header row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `${TIME_COL_WIDTH}px repeat(${days.length}, 1fr)`,
          background: SCHED_COLORS.NAV_BG,
          borderBottom: `1px solid ${SCHED_COLORS.GRID_LINE_STRONG}`,
        }}
      >
        <div style={{ height: HEADER_HEIGHT }} />
        {days.map((d) => {
          const isToday = ymd(d) === ymd(new Date())
          return (
            <div
              key={d.toISOString()}
              style={{
                height: HEADER_HEIGHT,
                padding: '8px 12px',
                fontSize: 12,
                fontWeight: 600,
                color: isToday ? SCHED_COLORS.ORANGE : '#F2F6FB',
                borderLeft: `1px solid ${SCHED_COLORS.GRID_LINE}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                textTransform: 'uppercase',
                letterSpacing: 0.5,
              }}
            >
              {fmtDayHeader(d)}
            </div>
          )
        })}
      </div>

      {/* All-day row */}
      <AllDayRow
        days={days}
        events={allDayEvents}
        timeColumnWidth={TIME_COL_WIDTH}
      />

      {/* Time grid */}
      <div
        style={{
          position: 'relative',
          display: 'grid',
          gridTemplateColumns: `${TIME_COL_WIDTH}px repeat(${days.length}, 1fr)`,
        }}
      >
        {/* Hour rail */}
        <div
          style={{
            position: 'relative',
            borderRight: `1px solid ${SCHED_COLORS.GRID_LINE_STRONG}`,
            background: SCHED_COLORS.NAV_BG,
            height: gridHeight,
          }}
        >
          {hours.map((h) => (
            <div
              key={h}
              style={{
                position: 'absolute',
                top: (h - startHour) * HOUR_HEIGHT,
                width: '100%',
                height: HOUR_HEIGHT,
                fontSize: 10,
                color: SCHED_COLORS.TEXT_DIM,
                textAlign: 'center',
                paddingTop: 4,
                borderTop: h === startHour ? 'none' : `1px solid ${SCHED_COLORS.GRID_LINE}`,
              }}
            >
              {h === 0
                ? '12 AM'
                : h < 12
                  ? `${h} AM`
                  : h === 12
                    ? '12 PM'
                    : h === 24
                      ? '12 AM'
                      : `${h - 12} PM`}
            </div>
          ))}
        </div>

        {/* Day columns */}
        {days.map((d) => {
          const dayKey = ymd(d)
          const dayBookings = bookingsByDay.get(dayKey) ?? []
          const laidOut = layoutOverlapping(dayBookings, (iso) => {
            const r = renderInTz(new Date(iso), timezone)
            if (!r) return gridStartMin
            return r.hour * 60 + r.minute
          })
          const isToday = ymd(d) === ymd(new Date())

          return (
            <WeekDayColumn
              key={d.toISOString()}
              dayKey={dayKey}
              isToday={isToday}
              gridHeight={gridHeight}
              hours={hours}
              startHour={startHour}
              pxPerMin={pxPerMin}
              gridStartMin={gridStartMin}
              incrementMins={settings?.time_increment_mins ?? 30}
              laidOut={laidOut}
              selectedId={selectedId ?? null}
              driverNameById={driverNameById}
              dragEnabled={dragEnabled}
              draggingOverDayKey={dnd.draggingOverDayKey}
              onResize={dnd.handleResize}
              onJobClick={onJobClick}
              onEmptyClick={onEmptyClick}
            />
          )
        })}

        {/* Now indicator — spans across all day columns */}
        <NowIndicator
          days={days}
          timezone={timezone}
          startHour={startHour}
          endHour={endHour}
          hourHeight={HOUR_HEIGHT}
          timeColumnWidth={TIME_COL_WIDTH}
        />
      </div>
    </div>
  )

  // Wrap in DndContext only when drag is enabled — saves a bit of work
  // for read-only callers, and keeps the legacy shape for the unit-test
  // path (no DndContext = simpler tree).
  if (!dragEnabled) return gridBody
  return (
    <DndContext
      sensors={sensors}
      onDragStart={dnd.handleDragStart}
      onDragOver={dnd.handleDragOver}
      onDragEnd={dnd.handleDragEnd}
    >
      {gridBody}
    </DndContext>
  )
}

// --- WeekDayColumn: extracted so we can use useDroppable per day. ---
// (useDroppable is a hook so it cannot be called inside a .map.)

interface WeekDayColumnProps {
  dayKey: string
  isToday: boolean
  gridHeight: number
  hours: number[]
  startHour: number
  pxPerMin: number
  gridStartMin: number
  incrementMins: number
  laidOut: ReturnType<typeof layoutOverlapping>
  selectedId: string | null
  driverNameById: Map<string, string>
  dragEnabled: boolean
  draggingOverDayKey: string | null
  onResize: (b: SchedulerBooking, newDurationMins: number) => void
  onJobClick: (b: SchedulerBooking) => void
  onEmptyClick: (dateIso: string, hour: number, minute: number) => void
}

function WeekDayColumn(p: WeekDayColumnProps) {
  const { setNodeRef } = useDroppable({ id: `day-${p.dayKey}`, disabled: !p.dragEnabled })
  const isDropTarget = p.dragEnabled && p.draggingOverDayKey === p.dayKey
  return (
    <div
      ref={setNodeRef}
      data-day-key={p.dayKey}
      style={{
        position: 'relative',
        borderLeft: `1px solid ${SCHED_COLORS.GRID_LINE}`,
        height: p.gridHeight,
        background: isDropTarget
          ? 'rgba(232,98,42,0.10)'
          : p.isToday
            ? 'rgba(232,98,42,0.025)'
            : 'transparent',
        outline: isDropTarget ? `1px dashed ${SCHED_COLORS.ORANGE}` : 'none',
        outlineOffset: '-1px',
      }}
      onClick={(e) => {
        const target = e.currentTarget.getBoundingClientRect()
        const offsetY = e.clientY - target.top
        const totalMinutesClicked = offsetY / p.pxPerMin
        const absMin = p.gridStartMin + totalMinutesClicked
        const roundedMin = Math.round(absMin / p.incrementMins) * p.incrementMins
        const hour = Math.floor(roundedMin / 60)
        const minute = roundedMin % 60
        p.onEmptyClick(p.dayKey, hour, minute)
      }}
    >
      {p.hours.slice(1).map((h) => (
        <div
          key={h}
          style={{
            position: 'absolute',
            top: (h - p.startHour) * (p.gridHeight / (p.hours.length - 1)),
            left: 0,
            right: 0,
            height: 1,
            background: SCHED_COLORS.GRID_LINE,
          }}
        />
      ))}
      {p.laidOut.map((laid) => (
        <JobBlock
          key={laid.booking.id}
          booking={laid.booking}
          top={minutesToPx(laid.startMin, p.gridStartMin, p.pxPerMin)}
          height={(laid.endMin - laid.startMin) * p.pxPerMin}
          left={laid.left}
          width={laid.width}
          compact
          draggable={p.dragEnabled}
          resizable={p.dragEnabled}
          pxPerMin={p.pxPerMin}
          incrementMins={p.incrementMins}
          onResize={p.onResize}
          selected={p.selectedId === laid.booking.id}
          driverName={
            laid.booking.driver_id ? p.driverNameById.get(laid.booking.driver_id) : null
          }
          onClick={p.onJobClick}
        />
      ))}
    </div>
  )
}
