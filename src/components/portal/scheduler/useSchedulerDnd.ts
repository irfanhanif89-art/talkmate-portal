'use client'

import { useState, useCallback } from 'react'
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core'
import { dateKeyInTz } from '@/lib/scheduler-time'
import type { SchedulerBooking } from './types'

// =====================================================================
// useSchedulerDnd — shared drag-to-reschedule logic for WeekGrid +
// DayGrid (+ later swimlanes). Encapsulates:
//   - what's being dragged (booking id)
//   - the drag-over visual state
//   - the onDragEnd → API call flow (with conflict-dialog fallback)
//
// The grid components own the @dnd-kit DndContext + draggable/droppable
// wiring; this hook owns the cross-grid state and the API plumbing.
// =====================================================================

export type RescheduleResult =
  | { ok: true; newDateKey: string; newTime: string }
  | { ok: false; reason: 'conflict' | 'error'; conflicts?: Array<{ caller_name: string | null }>; error?: string }

export interface UseSchedulerDndArgs {
  bookings: SchedulerBooking[]
  timezone: string
  /** Minutes per pixel from the parent grid. Used to convert drag deltas to time. */
  pxPerMin: number
  /** Rounds the dropped time to this increment. */
  incrementMins: number
  /** The grid's start hour, so we can clamp to >= startHour. */
  startHour: number
  /** The grid's end hour, so we can clamp to <= endHour. */
  endHour: number
  /** API base, e.g. /api/portal/bookings or admin equivalent. */
  baseUrl: string
  /** Called after a successful reschedule — parent merges into its bookings state. */
  onUpdated: (updated: SchedulerBooking) => void
  /** Called to surface a toast / error message. */
  onError: (msg: string) => void
}

export function useSchedulerDnd(args: UseSchedulerDndArgs) {
  const { bookings, timezone, pxPerMin, incrementMins, startHour, endHour, baseUrl, onUpdated, onError } = args
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [draggingOverDayKey, setDraggingOverDayKey] = useState<string | null>(null)

  function handleDragStart(event: DragStartEvent) {
    setDraggingId(String(event.active.id))
  }

  function handleDragOver(event: { over: { id: string | number } | null }) {
    if (event.over) {
      // Drop target id format: `day-YYYY-MM-DD`
      const id = String(event.over.id)
      if (id.startsWith('day-')) setDraggingOverDayKey(id.slice(4))
    } else {
      setDraggingOverDayKey(null)
    }
  }

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const activeId = String(event.active.id)
      const overId = event.over ? String(event.over.id) : null
      setDraggingId(null)
      setDraggingOverDayKey(null)

      if (!overId || !overId.startsWith('day-')) return
      const newDateKey = overId.slice(4)

      const booking = bookings.find((b) => b.id === activeId)
      if (!booking || !booking.scheduled_start) return

      // Compute new time:
      //   originalStart in tz → minutes from midnight
      //   add event.delta.y / pxPerMin → new minutes
      //   round to incrementMins
      //   clamp to [startHour*60, endHour*60 - duration]
      const originalDateKey = dateKeyInTz(new Date(booking.scheduled_start), timezone)
      const originalRendered = renderInTzShim(new Date(booking.scheduled_start), timezone)
      if (!originalRendered) return

      const originalMin = originalRendered.hour * 60 + originalRendered.minute
      const deltaMin = event.delta.y / pxPerMin
      let newMin = Math.round((originalMin + deltaMin) / incrementMins) * incrementMins

      const durationMin = booking.duration_minutes ?? 60
      // Clamp into the grid.
      newMin = Math.max(startHour * 60, Math.min(endHour * 60 - durationMin, newMin))

      // If the user dropped on the same column with no Y delta, no-op.
      if (newDateKey === originalDateKey && newMin === originalMin) return

      const newTime = `${String(Math.floor(newMin / 60)).padStart(2, '0')}:${String(newMin % 60).padStart(2, '0')}`

      // Call the reschedule API with optimistic feedback: hand the new
      // values back to the caller via onUpdated so the grid moves the
      // block immediately. On API failure (incl. 409 conflict) the
      // parent rolls back.
      try {
        const res = await fetch(`${baseUrl}/${activeId}/reschedule`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date: newDateKey, time: newTime, duration_mins: durationMin }),
        })
        if (res.ok) {
          const { booking: updated } = await res.json()
          onUpdated(updated as SchedulerBooking)
          return
        }
        if (res.status === 409) {
          const { conflicts } = await res.json().catch(() => ({ conflicts: [] }))
          const names = (conflicts ?? []).map((c: { caller_name: string | null }) => c.caller_name ?? 'another job').join(', ')
          const ok = window.confirm(
            `This slot overlaps with ${names}. Reschedule anyway?`,
          )
          if (!ok) return
          const res2 = await fetch(`${baseUrl}/${activeId}/reschedule`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date: newDateKey, time: newTime, duration_mins: durationMin, force: true }),
          })
          if (res2.ok) {
            const { booking: updated } = await res2.json()
            onUpdated(updated as SchedulerBooking)
          } else {
            onError('Reschedule failed')
          }
          return
        }
        const { error } = await res.json().catch(() => ({ error: 'failed' }))
        onError(error ?? 'Reschedule failed')
      } catch {
        onError('Network error — change reverted')
      }
    },
    [bookings, timezone, pxPerMin, incrementMins, startHour, endHour, baseUrl, onUpdated, onError],
  )

  // Resize commit: re-uses the /reschedule endpoint with the existing
  // date+time but a new duration_mins. Conflict path identical to drag.
  const handleResize = useCallback(
    async (booking: SchedulerBooking, newDurationMins: number) => {
      if (!booking.scheduled_start) return
      const rendered = renderInTzShim(new Date(booking.scheduled_start), timezone)
      if (!rendered) return
      const date = `${rendered.year}-${String(rendered.month).padStart(2, '0')}-${String(rendered.day).padStart(2, '0')}`
      const time = `${String(rendered.hour).padStart(2, '0')}:${String(rendered.minute).padStart(2, '0')}`
      try {
        const res = await fetch(`${baseUrl}/${booking.id}/reschedule`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date, time, duration_mins: newDurationMins }),
        })
        if (res.ok) {
          const { booking: updated } = await res.json()
          onUpdated(updated as SchedulerBooking)
          return
        }
        if (res.status === 409) {
          const { conflicts } = await res.json().catch(() => ({ conflicts: [] }))
          const names = (conflicts ?? []).map((c: { caller_name: string | null }) => c.caller_name ?? 'another job').join(', ')
          const ok = window.confirm(`This new duration overlaps with ${names}. Resize anyway?`)
          if (!ok) return
          const res2 = await fetch(`${baseUrl}/${booking.id}/reschedule`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date, time, duration_mins: newDurationMins, force: true }),
          })
          if (res2.ok) {
            const { booking: updated } = await res2.json()
            onUpdated(updated as SchedulerBooking)
          } else {
            onError('Resize failed')
          }
          return
        }
        const { error } = await res.json().catch(() => ({ error: 'failed' }))
        onError(error ?? 'Resize failed')
      } catch {
        onError('Network error — change reverted')
      }
    },
    [timezone, baseUrl, onUpdated, onError],
  )

  return {
    draggingId,
    draggingOverDayKey,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    handleResize,
  }
}

// Local copy of renderInTz to avoid a circular import via index file.
import { renderInTz } from '@/lib/scheduler-time'
function renderInTzShim(d: Date, tz: string) {
  return renderInTz(d, tz)
}
