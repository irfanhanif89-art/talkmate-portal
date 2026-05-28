// =====================================================================
// scheduler-time.ts
//
// Time helpers for the Bizzow-style scheduler. The grid speaks in
// wall-clock {date, time} pairs (in the client's IANA timezone); the
// DB stores TIMESTAMPTZ. These helpers bridge the two without bringing
// in a heavy tz library (date-fns-tz is added per the brief but we
// only need the minimum here).
//
// All helpers are pure. No side effects. Importable from server
// (API routes) and client (components).
// =====================================================================

export type WallClock = {
  /** YYYY-MM-DD */
  date: string
  /** HH:MM in 24h */
  time: string
}

/**
 * Convert a wall-clock {date, time} in the given IANA timezone to a UTC
 * ISO string. Uses Intl.DateTimeFormat to compute the tz offset
 * (handles DST correctly).
 *
 * Returns null if date or time are malformed.
 */
export function wallClockToIso(
  date: string,
  time: string,
  timezone: string,
): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  const t = /^(\d{1,2}):(\d{2})$/.exec(time)
  if (!m || !t) return null
  const year = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  const hour = Number(t[1])
  const minute = Number(t[2])
  if (hour > 23 || minute > 59) return null

  // Initial guess: treat the wall clock as UTC, then correct by the
  // tz offset. Two iterations cover any single DST offset boundary.
  let guess = Date.UTC(year, month - 1, day, hour, minute, 0, 0)
  for (let i = 0; i < 2; i++) {
    const rendered = renderInTz(new Date(guess), timezone)
    if (!rendered) return null
    const delta =
      Date.UTC(year, month - 1, day, hour, minute, 0, 0) -
      Date.UTC(
        rendered.year,
        rendered.month - 1,
        rendered.day,
        rendered.hour,
        rendered.minute,
        0,
        0,
      )
    if (delta === 0) break
    guess += delta
  }
  return new Date(guess).toISOString()
}

/**
 * Render a UTC Date into its wall-clock components in the given tz.
 * Returns null if the tz is invalid.
 */
export function renderInTz(d: Date, timezone: string) {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(d)
    const get = (type: string) =>
      Number(parts.find((p) => p.type === type)?.value ?? 'NaN')
    return {
      year: get('year'),
      month: get('month'),
      day: get('day'),
      hour: get('hour') === 24 ? 0 : get('hour'),
      minute: get('minute'),
    }
  } catch {
    return null
  }
}

/**
 * Convert a UTC ISO string back to a {date, time} pair in the given tz.
 * Used by the API GET path to produce the brief-shape API response.
 */
export function isoToWallClock(
  iso: string | null,
  timezone: string,
): WallClock | null {
  if (!iso) return null
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  const r = renderInTz(d, timezone)
  if (!r) return null
  return {
    date: `${pad4(r.year)}-${pad2(r.month)}-${pad2(r.day)}`,
    time: `${pad2(r.hour)}:${pad2(r.minute)}`,
  }
}

function pad2(n: number) {
  return String(n).padStart(2, '0')
}
function pad4(n: number) {
  return String(n).padStart(4, '0')
}

/**
 * Returns the start of the week containing `d`, in UTC. weekStartsOn
 * follows JS Date.getDay(): 0=Sunday, 1=Monday.
 */
export function startOfWeek(d: Date, weekStartsOn: number): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  const diff = (x.getDay() - weekStartsOn + 7) % 7
  x.setDate(x.getDate() - diff)
  return x
}

/**
 * Returns the start of the month containing `d`, at midnight in local time.
 */
export function startOfMonth(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  x.setDate(1)
  return x
}

/**
 * Add N days to a Date, returning a new Date.
 */
export function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

/**
 * The "now" instant rendered as minutes-from-midnight in the given tz.
 * Used by NowIndicator to position itself on the time axis.
 * Returns null if the tz is invalid.
 */
export function minutesFromMidnightInTz(
  d: Date,
  timezone: string,
): number | null {
  const r = renderInTz(d, timezone)
  if (!r) return null
  return r.hour * 60 + r.minute
}

/**
 * Returns YYYY-MM-DD for `d` rendered in tz.
 */
export function dateKeyInTz(d: Date, timezone: string): string | null {
  const r = renderInTz(d, timezone)
  if (!r) return null
  return `${pad4(r.year)}-${pad2(r.month)}-${pad2(r.day)}`
}
