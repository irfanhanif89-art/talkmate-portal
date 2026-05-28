// =====================================================================
// Bizzow scheduler grid — shared types + design tokens.
//
// Booking shape is a subset of the existing portal Booking type, kept
// loose enough that the grid components don't break when adjacent
// fields change. See scheduler-view.tsx for the canonical type.
// =====================================================================

export const SCHED_COLORS = {
  // Dark theme aligned with existing scheduler-view.tsx.
  ORANGE: '#E8622A',
  TEXT_DIM: '#7BAED4',
  NAV_BG: '#0A1E38',
  CARD_BG: '#071829',
  GRID_LINE: 'rgba(255,255,255,0.06)',
  GRID_LINE_STRONG: 'rgba(255,255,255,0.12)',
  // Status palette per brief — separate from sourceColor() in the
  // legacy scheduler-view. The grid uses status colors; the legacy
  // list uses booking_source colors. Both are valid views.
  STATUS_PENDING: '#F59E0B', // orange/yellow, dashed border
  STATUS_CONFIRMED: '#4A9FE8', // blue
  STATUS_STARTED: '#22C55E', // green, pulse
  STATUS_COMPLETED: '#9CA3AF', // grey, dimmed
  STATUS_CANCELLED: '#EF4444', // red, struck through
  STATUS_DECLINED: '#EF4444',
  STATUS_NO_SHOW: '#EF4444',
} as const

export type SchedulerBooking = {
  id: string
  client_id?: string | null
  caller_name: string | null
  caller_phone: string | null
  description: string | null
  pickup_address: string | null
  pickup_lat?: number | null
  pickup_lng?: number | null
  dropoff_address: string | null
  dropoff_lat?: number | null
  dropoff_lng?: number | null
  truck_type: string | null
  driver_id: string | null
  booking_source?: string | null
  estimated_value: number | null
  scheduled_start: string | null
  scheduled_end: string | null
  actual_start: string | null
  actual_end: string | null
  duration_minutes: number | null
  status:
    | 'pending'
    | 'confirmed'
    | 'started'
    | 'cancelled'
    | 'completed'
    | 'no_show'
    | 'declined'
  payment_method?: 'cash' | 'card' | 'invoice' | 'insurance' | 'account' | null
  color_hex?: string | null
  notes?: string | null
  confirmed_at?: string | null
}

export type SchedulerDriver = {
  id: string
  name: string
  phone?: string | null
  initials?: string
  status?: string
  active?: boolean
}

export type AllDayEvent = {
  date: string // YYYY-MM-DD
  label: string
  type: 'holiday' | 'closure' | 'driver_off'
}

export type SchedulerSettingsLite = {
  timezone?: string | null
  default_start_hour?: number | null
  default_end_hour?: number | null
  show_weekend?: boolean | null
  week_starts_on?: number | null
  time_increment_mins?: number | null
  group_by_driver?: boolean | null
  state?: string | null
  // Legacy carry-over — used when the flat columns are NULL.
  operating_hours?: Record<
    string,
    { open?: string; close?: string; enabled?: boolean }
  > | null
}

/**
 * Status → color triple for the JobBlock. Custom color_hex overrides
 * border/tint but keeps text styling (e.g. struck-through for cancelled).
 */
export function blockColors(
  status: SchedulerBooking['status'],
  color_hex?: string | null,
): {
  border: string
  bg: string
  text: string
  borderStyle: 'solid' | 'dashed'
  textDecoration?: 'line-through'
  dim?: boolean
  pulse?: boolean
} {
  const customBorder = color_hex && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(color_hex)
    ? color_hex
    : null
  switch (status) {
    case 'pending':
      return {
        border: customBorder ?? SCHED_COLORS.STATUS_PENDING,
        bg: 'rgba(245,158,11,0.14)',
        text: '#FBE6B5',
        borderStyle: 'dashed',
      }
    case 'confirmed':
      return {
        border: customBorder ?? SCHED_COLORS.STATUS_CONFIRMED,
        bg: 'rgba(74,159,232,0.14)',
        text: '#CEE5FA',
        borderStyle: 'solid',
      }
    case 'started':
      return {
        border: customBorder ?? SCHED_COLORS.STATUS_STARTED,
        bg: 'rgba(34,197,94,0.16)',
        text: '#CFF5DC',
        borderStyle: 'solid',
        pulse: true,
      }
    case 'completed':
      return {
        border: customBorder ?? SCHED_COLORS.STATUS_COMPLETED,
        bg: 'rgba(156,163,175,0.10)',
        text: '#C8D2DC',
        borderStyle: 'solid',
        dim: true,
      }
    case 'cancelled':
      return {
        border: customBorder ?? SCHED_COLORS.STATUS_CANCELLED,
        bg: 'rgba(239,68,68,0.10)',
        text: '#FBB2B2',
        borderStyle: 'solid',
        textDecoration: 'line-through',
      }
    case 'declined':
      return {
        border: customBorder ?? SCHED_COLORS.STATUS_DECLINED,
        bg: 'rgba(239,68,68,0.10)',
        text: '#FBB2B2',
        borderStyle: 'solid',
        textDecoration: 'line-through',
      }
    case 'no_show':
      return {
        border: customBorder ?? SCHED_COLORS.STATUS_NO_SHOW,
        bg: 'rgba(239,68,68,0.10)',
        text: '#FBB2B2',
        borderStyle: 'solid',
        textDecoration: 'line-through',
      }
  }
}

/**
 * True when the booking's price is hidden from the assigned driver
 * per the Driver Price Visibility Rule (brief §DRIVER PRICE VISIBILITY).
 * Owner UI uses this to render the "Hidden from driver" chip next to
 * the price field.
 */
export function priceHiddenFromDriver(b: SchedulerBooking): boolean {
  return !(b.payment_method === 'cash' || b.payment_method === 'card')
}
