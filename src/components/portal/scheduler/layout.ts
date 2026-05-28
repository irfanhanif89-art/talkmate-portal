// =====================================================================
// scheduler/layout.ts — pure layout helpers for the grid.
//
// Two responsibilities:
//   1. Given a list of bookings on a single day, group them by overlap
//      and produce {left, width} so overlapping blocks share the column
//      side-by-side.
//   2. Convert a wall-clock {hour, minute} to a vertical px offset
//      given the grid's hour range and px-per-minute.
//
// All helpers are pure. No tz logic here — callers convert to the
// client's tz first (via scheduler-time.ts).
// =====================================================================

import type { SchedulerBooking } from './types'

export type LaidOutBlock = {
  booking: SchedulerBooking
  /** Minutes from the grid's start-of-day. */
  startMin: number
  /** Minutes from the grid's start-of-day. */
  endMin: number
  /** 0..1 fraction of column width. */
  left: number
  /** 0..1 fraction of column width. */
  width: number
}

/**
 * Group bookings into clusters of mutually-overlapping intervals.
 * Within each cluster, assign each block a column index (greedy).
 * Resulting left/width = colIndex / numCols, 1 / numCols.
 *
 * Bookings with no scheduled_start are dropped (they belong on the
 * all-day row, not the time grid).
 */
export function layoutOverlapping(
  bookings: SchedulerBooking[],
  toMinutesOfDay: (iso: string) => number,
): LaidOutBlock[] {
  // Project to {startMin, endMin}; drop unscheduled and zero-duration.
  const items = bookings
    .map((b) => {
      if (!b.scheduled_start) return null
      const startMin = toMinutesOfDay(b.scheduled_start)
      const duration = Math.max(15, b.duration_minutes ?? 60)
      const endMin = startMin + duration
      return { booking: b, startMin, endMin }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin)

  // Sweep-line: group items that share any overlap into clusters.
  // A new item joins the current cluster if it starts before the
  // cluster's max end. Otherwise the cluster is flushed.
  const result: LaidOutBlock[] = []
  let cluster: typeof items = []
  let clusterMaxEnd = -1

  function flush() {
    if (cluster.length === 0) return
    // Greedy column assignment.
    const cols: number[] = [] // each entry = the endMin currently occupying that col
    const assigned: number[] = []
    for (const it of cluster) {
      let placed = false
      for (let c = 0; c < cols.length; c++) {
        if (cols[c] <= it.startMin) {
          cols[c] = it.endMin
          assigned.push(c)
          placed = true
          break
        }
      }
      if (!placed) {
        cols.push(it.endMin)
        assigned.push(cols.length - 1)
      }
    }
    const numCols = cols.length
    cluster.forEach((it, i) => {
      const col = assigned[i]
      result.push({
        booking: it.booking,
        startMin: it.startMin,
        endMin: it.endMin,
        left: col / numCols,
        width: 1 / numCols,
      })
    })
    cluster = []
    clusterMaxEnd = -1
  }

  for (const it of items) {
    if (cluster.length === 0 || it.startMin < clusterMaxEnd) {
      cluster.push(it)
      if (it.endMin > clusterMaxEnd) clusterMaxEnd = it.endMin
    } else {
      flush()
      cluster.push(it)
      clusterMaxEnd = it.endMin
    }
  }
  flush()
  return result
}

/**
 * Convert minutes-from-grid-start to px. e.g. given a 6 AM start, a
 * booking at 7:30 has top = 90 * pxPerMin.
 */
export function minutesToPx(minutes: number, gridStartMin: number, pxPerMin: number): number {
  return (minutes - gridStartMin) * pxPerMin
}
