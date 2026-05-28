'use client'

import { useMemo } from 'react'
import {
  DndContext,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { renderInTz } from '@/lib/scheduler-time'
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
// DayGrid — single-column variant of WeekGrid.
//
// Two modes:
//   - Plain (group_by_driver = false): single day column. Overlapping
//     blocks share the column width.
//   - Swimlanes (group_by_driver = true): the day column splits into
//     N sub-columns (one per active driver) + an "Unassigned" lane.
//
// Session A renders only the plain mode. Swimlanes ship in Session B
// per the DECISIONS doc.
// =====================================================================

interface Props {
  anchor: Date
  bookings: SchedulerBooking[]
  drivers: SchedulerDriver[]
  settings: SchedulerSettingsLite | null
  allDayEvents: AllDayEvent[]
  selectedId?: string | null
  baseUrl?: string
  onBookingUpdated?: (b: SchedulerBooking) => void
  onError?: (msg: string) => void
  onJobClick: (b: SchedulerBooking) => void
  onEmptyClick: (dateIso: string, hour: number, minute: number) => void
}

const HOUR_HEIGHT = 64
const HEADER_HEIGHT = 38
const TIME_COL_WIDTH = 60

function fmtDayHeader(d: Date): string {
  return d.toLocaleDateString('en-AU', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function ymd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export default function DayGrid({
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
  const startHour = settings?.default_start_hour ?? 6
  const endHour = settings?.default_end_hour ?? 20
  const timezone = settings?.timezone ?? 'Australia/Melbourne'

  const gridStartMin = startHour * 60
  const gridEndMin = endHour * 60
  const totalMinutes = gridEndMin - gridStartMin
  const pxPerMin = HOUR_HEIGHT / 60
  const gridHeight = totalMinutes * pxPerMin

  const days = useMemo(() => [anchor], [anchor])

  // Filter to this day only (in tz).
  const dayKey = ymd(anchor)
  const dayBookings = useMemo(() => {
    const out: SchedulerBooking[] = []
    for (const b of bookings) {
      if (!b.scheduled_start) continue
      const r = renderInTz(new Date(b.scheduled_start), timezone)
      if (!r) continue
      const key = `${r.year}-${String(r.month).padStart(2, '0')}-${String(r.day).padStart(2, '0')}`
      if (key === dayKey) out.push(b)
    }
    return out
  }, [bookings, dayKey, timezone])

  const driverNameById = useMemo(() => {
    const m = new Map<string, string>()
    for (const d of drivers) m.set(d.id, d.name)
    return m
  }, [drivers])

  const laidOut = useMemo(
    () =>
      layoutOverlapping(dayBookings, (iso) => {
        const r = renderInTz(new Date(iso), timezone)
        if (!r) return gridStartMin
        return r.hour * 60 + r.minute
      }),
    [dayBookings, timezone, gridStartMin],
  )

  // Session B — driver swimlanes. When enabled, bookings are bucketed
  // by driver_id (null → "Unassigned" lane on the left).
  const swimlanes = !!settings?.group_by_driver
  const lanes = useMemo(() => {
    if (!swimlanes) return []
    const buckets = new Map<string | null, SchedulerBooking[]>()
    buckets.set(null, []) // Unassigned always shown when swimlanes are on
    for (const d of drivers) buckets.set(d.id, [])
    for (const b of dayBookings) {
      const key = b.driver_id ?? null
      const arr = buckets.get(key) ?? []
      arr.push(b)
      buckets.set(key, arr)
    }
    // Return as array of {laneKey, label, blocks}
    return Array.from(buckets.entries()).map(([driverId, blocks]) => ({
      driverId,
      label: driverId === null ? 'Unassigned' : (driverNameById.get(driverId) ?? 'Driver'),
      laidOut: layoutOverlapping(blocks, (iso) => {
        const r = renderInTz(new Date(iso), timezone)
        if (!r) return gridStartMin
        return r.hour * 60 + r.minute
      }),
    }))
  }, [swimlanes, drivers, dayBookings, driverNameById, timezone, gridStartMin])

  const hours: number[] = []
  for (let h = startHour; h <= endHour; h++) hours.push(h)

  const isToday = ymd(anchor) === ymd(new Date())

  // Session B — drag-to-reschedule.
  const dragEnabled = !!baseUrl && !!onBookingUpdated
  const dnd = useSchedulerDnd({
    bookings: dayBookings,
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
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  )
  // Single day → single droppable.
  const droppable = useDroppable({ id: `day-${dayKey}`, disabled: !dragEnabled })
  const isDropTarget = dragEnabled && dnd.draggingOverDayKey === dayKey

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
      {/* Header */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `${TIME_COL_WIDTH}px 1fr`,
          background: SCHED_COLORS.NAV_BG,
          borderBottom: `1px solid ${SCHED_COLORS.GRID_LINE_STRONG}`,
        }}
      >
        <div style={{ height: HEADER_HEIGHT }} />
        <div
          style={{
            height: HEADER_HEIGHT,
            padding: '8px 16px',
            fontSize: 13,
            fontWeight: 700,
            color: isToday ? SCHED_COLORS.ORANGE : '#F2F6FB',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-start',
          }}
        >
          {fmtDayHeader(anchor)}
        </div>
      </div>

      {/* All-day */}
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
          gridTemplateColumns: `${TIME_COL_WIDTH}px 1fr`,
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

        {/* Day column — either a single column (default) or N+1 swimlanes. */}
        {!swimlanes && (
          <div
            ref={droppable.setNodeRef}
            data-day-key={dayKey}
            style={{
              position: 'relative',
              height: gridHeight,
              background: isDropTarget
                ? 'rgba(232,98,42,0.10)'
                : isToday
                  ? 'rgba(232,98,42,0.025)'
                  : 'transparent',
              outline: isDropTarget ? `1px dashed ${SCHED_COLORS.ORANGE}` : 'none',
              outlineOffset: '-1px',
            }}
            onClick={(e) => {
              const target = e.currentTarget.getBoundingClientRect()
              const offsetY = e.clientY - target.top
              const totalMinutesClicked = offsetY / pxPerMin
              const absMin = gridStartMin + totalMinutesClicked
              const incr = settings?.time_increment_mins ?? 30
              const roundedMin = Math.round(absMin / incr) * incr
              const hour = Math.floor(roundedMin / 60)
              const minute = roundedMin % 60
              onEmptyClick(dayKey, hour, minute)
            }}
          >
            {hours.slice(1).map((h) => (
              <div
                key={h}
                style={{
                  position: 'absolute',
                  top: (h - startHour) * HOUR_HEIGHT,
                  left: 0,
                  right: 0,
                  height: 1,
                  background: SCHED_COLORS.GRID_LINE,
                }}
              />
            ))}

            {laidOut.map((laid) => (
              <JobBlock
                key={laid.booking.id}
                booking={laid.booking}
                top={minutesToPx(laid.startMin, gridStartMin, pxPerMin)}
                height={(laid.endMin - laid.startMin) * pxPerMin}
                left={laid.left}
                width={laid.width}
                compact={false}
                draggable={dragEnabled}
                resizable={dragEnabled}
                pxPerMin={pxPerMin}
                incrementMins={settings?.time_increment_mins ?? 30}
                onResize={dnd.handleResize}
                selected={selectedId === laid.booking.id}
                driverName={
                  laid.booking.driver_id ? driverNameById.get(laid.booking.driver_id) : null
                }
                onClick={onJobClick}
              />
            ))}
          </div>
        )}
        {swimlanes && (
          <div
            ref={droppable.setNodeRef}
            data-day-key={dayKey}
            style={{
              position: 'relative',
              display: 'grid',
              gridTemplateColumns: `repeat(${lanes.length}, 1fr)`,
              height: gridHeight,
              background: isDropTarget ? 'rgba(232,98,42,0.06)' : 'transparent',
              outline: isDropTarget ? `1px dashed ${SCHED_COLORS.ORANGE}` : 'none',
              outlineOffset: '-1px',
            }}
          >
            {lanes.map((lane) => (
              <div
                key={lane.driverId ?? 'unassigned'}
                style={{
                  position: 'relative',
                  borderLeft: `1px solid ${SCHED_COLORS.GRID_LINE}`,
                  height: gridHeight,
                  background:
                    lane.driverId === null
                      ? 'rgba(245,158,11,0.03)'
                      : isToday
                        ? 'rgba(232,98,42,0.020)'
                        : 'transparent',
                }}
                onClick={(e) => {
                  if (e.target !== e.currentTarget) return // ignore clicks on blocks
                  const target = e.currentTarget.getBoundingClientRect()
                  const offsetY = e.clientY - target.top
                  const totalMinutesClicked = offsetY / pxPerMin
                  const absMin = gridStartMin + totalMinutesClicked
                  const incr = settings?.time_increment_mins ?? 30
                  const roundedMin = Math.round(absMin / incr) * incr
                  const hour = Math.floor(roundedMin / 60)
                  const minute = roundedMin % 60
                  // For now the click-empty target is just the day; the
                  // create-modal in Session B reads driver_id separately
                  // (pre-fills with this lane).
                  onEmptyClick(dayKey, hour, minute)
                }}
              >
                {/* Lane header sticky at top */}
                <div
                  style={{
                    position: 'sticky',
                    top: 0,
                    zIndex: 2,
                    padding: '4px 8px',
                    fontSize: 10,
                    fontWeight: 700,
                    color: lane.driverId === null ? '#F59E0B' : SCHED_COLORS.TEXT_DIM,
                    textTransform: 'uppercase',
                    letterSpacing: 0.4,
                    background: SCHED_COLORS.CARD_BG,
                    borderBottom: `1px solid ${SCHED_COLORS.GRID_LINE}`,
                  }}
                >
                  {lane.label}
                </div>
                {/* Hour gridlines within the lane */}
                {hours.slice(1).map((h) => (
                  <div
                    key={h}
                    style={{
                      position: 'absolute',
                      top: (h - startHour) * HOUR_HEIGHT,
                      left: 0,
                      right: 0,
                      height: 1,
                      background: SCHED_COLORS.GRID_LINE,
                    }}
                  />
                ))}
                {lane.laidOut.map((laid) => (
                  <JobBlock
                    key={laid.booking.id}
                    booking={laid.booking}
                    top={minutesToPx(laid.startMin, gridStartMin, pxPerMin)}
                    height={(laid.endMin - laid.startMin) * pxPerMin}
                    left={laid.left}
                    width={laid.width}
                    compact
                    draggable={dragEnabled}
                    resizable={dragEnabled}
                    pxPerMin={pxPerMin}
                    incrementMins={settings?.time_increment_mins ?? 30}
                    onResize={dnd.handleResize}
                    selected={selectedId === laid.booking.id}
                    driverName={lane.label}
                    onClick={onJobClick}
                  />
                ))}
              </div>
            ))}
          </div>
        )}

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
