'use client'

import { useEffect, useMemo, useState } from 'react'
import { SegmentedControl } from '@/components/portal/ui-v2/segmented-control'
import { ButtonV2 } from '@/components/portal/ui-v2/button'
import { DayJobRow } from '@/components/portal/ui-v2/booking-row'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Booking {
  id: string
  caller_name: string | null
  caller_phone: string | null
  scheduled_start: string | null
  scheduled_end: string | null
  truck_type: string | null
  description: string | null
  pickup_address: string | null
  dropoff_address: string | null
  pickup_contact_name: string | null
  pickup_contact_phone: string | null
  confirmation_ref: string | null
  dispatcher_notified_at: string | null
  sms_confirmation_sent: boolean | null
  status: 'pending' | 'confirmed' | 'declined' | 'cancelled' | 'completed' | 'no_show'
  created_at: string
  call_id: string | null
}

type ViewMode = 'week' | 'month' | 'list'
type ListTab = 'pending' | 'confirmed' | 'all'

// ─── Constants ────────────────────────────────────────────────────────────────

const HOUR_H = 68        // px per hour row (matches mockup)
const CAL_START = 7      // first hour shown (7 AM)
const CAL_HOURS = 13     // 7 AM → 8 PM

const TRUCK_OPTIONS: { value: string; label: string }[] = [
  { value: 'loaded_tilt_tray', label: 'Loaded tilt tray' },
  { value: 'empty_tilt_tray', label: 'Empty tilt tray' },
  { value: 'sideloader_40ft', label: 'Sideloader (40ft)' },
]

// Status display helpers
const STATUS_LABEL: Record<Booking['status'], string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  declined: 'Declined',
  cancelled: 'Cancelled',
  completed: 'Completed',
  no_show: 'No Show',
}
const STATUS_COLOR: Record<Booking['status'], string> = {
  pending: 'text-[#f2b53c] bg-[rgba(242,181,60,.13)]',
  confirmed: 'text-green bg-green-soft',
  declined: 'text-[#f0625a] bg-[rgba(240,98,90,.13)]',
  cancelled: 'text-faint bg-[rgba(74,104,130,.12)]',
  completed: 'text-blue bg-[rgba(74,159,232,.12)]',
  no_show: 'text-[#f0625a] bg-[rgba(240,98,90,.13)]',
}

// Job block variants by status/type
const JOB_BLOCK_STYLE: Record<string, string> = {
  pending: 'bg-[rgba(238,106,44,.18)] border border-[rgba(238,106,44,.3)]',
  confirmed: 'bg-[rgba(46,201,138,.14)] border border-[rgba(46,201,138,.25)]',
  declined: 'bg-[rgba(240,98,90,.13)] border border-[rgba(240,98,90,.25)]',
  cancelled: 'bg-[rgba(74,104,130,.1)] border border-[rgba(74,104,130,.2)]',
  completed: 'bg-[rgba(74,159,232,.14)] border border-[rgba(74,159,232,.25)]',
  no_show: 'bg-[rgba(240,98,90,.13)] border border-[rgba(240,98,90,.25)]',
}
const JOB_TITLE_COLOR: Record<string, string> = {
  pending: 'text-orange',
  confirmed: 'text-green',
  declined: 'text-[#f0625a]',
  cancelled: 'text-faint',
  completed: 'text-blue',
  no_show: 'text-[#f0625a]',
}
const DAY_RAIL_BAR: Record<string, string> = {
  pending: 'var(--color-orange)',
  confirmed: 'var(--color-green)',
  declined: '#f0625a',
  cancelled: '#4a6882',
  completed: 'var(--color-blue)',
  no_show: '#f0625a',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTruckLabel(t: string | null | undefined): string {
  if (!t) return 'Booking'
  if (t === 'loaded_tilt_tray') return 'Loaded tilt tray'
  if (t === 'empty_tilt_tray') return 'Empty tilt tray'
  if (t === 'sideloader_40ft') return 'Sideloader'
  return t
}

function formatScheduled(booking: Booking): string {
  if (!booking.scheduled_start) return 'Time TBC'
  return new Date(booking.scheduled_start).toLocaleString('en-AU', {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit',
  })
}

/** Monday of the week containing `date` */
function getMonday(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
}

function fmtWeekRange(monday: Date): string {
  const friday = addDays(monday, 4)
  const fmt = (d: Date) => d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
  return `${fmt(monday)} — ${fmt(friday)}`
}

function hourLabel(h: number): string {
  if (h === 12) return '12p'
  return h < 12 ? `${h}a` : `${h - 12}p`
}

/** Convert a Booking to calendar top/height within the visible grid */
function bookingToBlock(b: Booking): { top: number; height: number } | null {
  if (!b.scheduled_start) return null
  const start = new Date(b.scheduled_start)
  const startHour = start.getHours() + start.getMinutes() / 60
  if (startHour < CAL_START || startHour >= CAL_START + CAL_HOURS) return null

  let durationHours = 1
  if (b.scheduled_end) {
    const end = new Date(b.scheduled_end)
    durationHours = Math.max(0.25, (end.getTime() - start.getTime()) / 3_600_000)
  }

  const top = (startHour - CAL_START) * HOUR_H
  const height = Math.max(28, durationHours * HOUR_H - 4)
  return { top, height }
}

/** Now-line top offset in px, or null if outside visible range */
function nowLineTop(now: Date): number | null {
  const h = now.getHours() + now.getMinutes() / 60
  if (h < CAL_START || h >= CAL_START + CAL_HOURS) return null
  return (h - CAL_START) * HOUR_H
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function BookingsView({ businessName }: { businessName: string }) {
  const [list, setList] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>('week')
  const [listTab, setListTab] = useState<ListTab>('pending')
  const [weekStart, setWeekStart] = useState<Date>(() => getMonday(new Date()))
  const [selectedDay, setSelectedDay] = useState<Date>(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return today
  })
  const [now, setNow] = useState(new Date())

  // Booking management state (preserved)
  const [confirming, setConfirming] = useState<Booking | null>(null)
  const [viewingNotes, setViewingNotes] = useState<Booking | null>(null)
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => { reload() }, [])

  // Update "now" every minute for the live time indicator
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  async function reload() {
    setLoading(true)
    try {
      const res = await fetch('/api/portal/bookings')
      const data = await res.json()
      if (res.ok) setList(data.bookings ?? [])
    } finally { setLoading(false) }
  }

  function showToast(m: string) { setToast(m); setTimeout(() => setToast(null), 3500) }

  // ── Actions (unchanged) ──────────────────────────────────────────────────────

  async function confirmBooking(b: Booking) {
    setBusy(`confirm:${b.id}`)
    try {
      const res = await fetch(`/api/portal/bookings/${b.id}/confirm`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed')
      setList(l => l.map(x => x.id === b.id
        ? { ...x, status: 'confirmed', sms_confirmation_sent: true }
        : x))
      showToast(data.sms === 'sent' ? 'Booking confirmed. SMS sent.' : 'Booking confirmed.')
      setConfirming(null)
    } catch (e) {
      showToast((e as Error).message)
    } finally { setBusy(null) }
  }

  async function cancelBooking(b: Booking) {
    if (!confirm('Cancel this booking?')) return
    setBusy(`cancel:${b.id}`)
    try {
      const res = await fetch(`/api/portal/bookings/${b.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled' }),
      })
      if (res.ok) {
        setList(l => l.map(x => x.id === b.id ? { ...x, status: 'cancelled' } : x))
        showToast('Cancelled')
      }
    } finally { setBusy(null) }
  }

  // ── Derived data ─────────────────────────────────────────────────────────────

  /** Bookings that fall in the currently-visible week */
  const weekDays = useMemo(() => {
    return Array.from({ length: 5 }, (_, i) => addDays(weekStart, i))
  }, [weekStart])

  /** Map from ISO date string (YYYY-MM-DD) → bookings for that day */
  const byDay = useMemo(() => {
    const map = new Map<string, Booking[]>()
    for (const b of list) {
      if (!b.scheduled_start) continue
      const d = new Date(b.scheduled_start)
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(b)
    }
    return map
  }, [list])

  function dayKey(d: Date) {
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
  }

  function dayBookings(d: Date): Booking[] {
    return (byDay.get(dayKey(d)) ?? []).sort((a, b) => {
      if (!a.scheduled_start) return 1
      if (!b.scheduled_start) return -1
      return new Date(a.scheduled_start).getTime() - new Date(b.scheduled_start).getTime()
    })
  }

  const selectedDayBookings = dayBookings(selectedDay)

  /** List view filtered bookings */
  const listFiltered = useMemo(() => {
    if (listTab === 'all') return list
    return list.filter(b => b.status === listTab)
  }, [list, listTab])

  const todayIsInWeek = weekDays.some(d => sameDay(d, new Date()))

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">

      {/* ── Controls bar ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-7 py-3.5 border-b border-line flex-shrink-0 flex-wrap gap-y-2">
        <SegmentedControl<ViewMode>
          options={[
            { value: 'week', label: 'Week' },
            { value: 'month', label: 'Month' },
            { value: 'list', label: 'List' },
          ]}
          value={viewMode}
          onChange={setViewMode}
        />

        {viewMode === 'week' && (
          <div className="flex items-center gap-2.5 rounded-[10px] border border-line bg-card px-3.5 py-[7px]">
            <button
              onClick={() => setWeekStart(d => addDays(d, -7))}
              className="text-dim hover:text-text w-6 h-6 flex items-center justify-center rounded-md hover:bg-[rgba(255,255,255,.06)] transition"
              aria-label="Previous week"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 3L5 8l5 5"/></svg>
            </button>
            <span className="text-[13.5px] font-bold min-w-[160px] text-center">{fmtWeekRange(weekStart)}</span>
            <button
              onClick={() => setWeekStart(d => addDays(d, 7))}
              className="text-dim hover:text-text w-6 h-6 flex items-center justify-center rounded-md hover:bg-[rgba(255,255,255,.06)] transition"
              aria-label="Next week"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 3l5 5-5 5"/></svg>
            </button>
          </div>
        )}

        <ButtonV2
          variant="primary"
          className="ml-auto gap-1.5 px-4 py-2 text-[14px] font-bold shadow-[0_4px_14px_rgba(238,106,44,.4)]"
          onClick={() => setCreating(true)}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M8 2v12M2 8h12"/>
          </svg>
          Add booking
        </ButtonV2>
      </div>

      {/* ── Body ──────────────────────────────────────────────────────────────── */}
      {viewMode === 'week' && (
        <WeekCalendar
          weekDays={weekDays}
          dayBookings={dayBookings}
          selectedDay={selectedDay}
          onSelectDay={setSelectedDay}
          selectedDayBookings={selectedDayBookings}
          now={now}
          todayIsInWeek={todayIsInWeek}
          onConfirm={setConfirming}
          onCancel={cancelBooking}
          onNotes={setViewingNotes}
          busy={busy}
          loading={loading}
        />
      )}

      {viewMode === 'month' && (
        <div className="flex-1 flex items-center justify-center text-dim text-[14px]">
          Month view coming soon
        </div>
      )}

      {viewMode === 'list' && (
        <ListView
          list={list}
          filtered={listFiltered}
          tab={listTab}
          onTab={setListTab}
          onConfirm={setConfirming}
          onCancel={cancelBooking}
          onNotes={setViewingNotes}
          busy={busy}
          loading={loading}
        />
      )}

      {/* ── Modals ────────────────────────────────────────────────────────────── */}
      {confirming && (
        <ConfirmModal
          booking={confirming}
          businessName={businessName}
          busy={busy === `confirm:${confirming.id}`}
          onCancel={() => setConfirming(null)}
          onConfirm={() => confirmBooking(confirming)}
        />
      )}

      {viewingNotes && (
        <NotesModal booking={viewingNotes} onClose={() => setViewingNotes(null)} />
      )}

      {creating && (
        <NewBookingModal
          onClose={() => setCreating(false)}
          onCreated={() => { setCreating(false); reload(); showToast('Booking created.') }}
          onError={(m) => showToast(m)}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-[100] px-4 py-3 rounded-[10px] bg-card border border-[rgba(46,201,138,.4)] text-green text-[13px] font-semibold shadow-[0_4px_20px_rgba(0,0,0,.4)]">
          {toast}
        </div>
      )}
    </div>
  )
}

// ─── Week Calendar ────────────────────────────────────────────────────────────

function WeekCalendar({
  weekDays,
  dayBookings,
  selectedDay,
  onSelectDay,
  selectedDayBookings,
  now,
  todayIsInWeek,
  onConfirm,
  onCancel,
  onNotes,
  busy,
  loading,
}: {
  weekDays: Date[]
  dayBookings: (d: Date) => Booking[]
  selectedDay: Date
  onSelectDay: (d: Date) => void
  selectedDayBookings: Booking[]
  now: Date
  todayIsInWeek: boolean
  onConfirm: (b: Booking) => void
  onCancel: (b: Booking) => void
  onNotes: (b: Booking) => void
  busy: string | null
  loading: boolean
}) {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const calBodyHeight = HOUR_H * CAL_HOURS

  return (
    <div className="flex-1 grid overflow-hidden" style={{ gridTemplateColumns: '1fr 300px' }}>

      {/* ── Left: Calendar grid ─────────────────────────────────────────────── */}
      <div className="flex flex-col overflow-hidden border-r border-line">

        {/* Day header row */}
        <div
          className="flex-shrink-0 border-b border-line"
          style={{ display: 'grid', gridTemplateColumns: '56px repeat(5, 1fr)' }}
        >
          {/* Gutter placeholder */}
          <div />
          {weekDays.map((d, i) => {
            const isToday = sameDay(d, today)
            const isSelected = sameDay(d, selectedDay)
            return (
              <button
                key={i}
                onClick={() => onSelectDay(d)}
                className={[
                  'flex flex-col items-center justify-center gap-0.5 py-3 px-2',
                  'border-r border-line last:border-r-0 transition-colors',
                  isSelected ? 'bg-[rgba(238,106,44,.04)]' : 'hover:bg-[rgba(255,255,255,.02)]',
                ].join(' ')}
              >
                <span className="text-[11px] font-bold tracking-[.06em] uppercase text-faint">
                  {d.toLocaleDateString('en-AU', { weekday: 'short' })}
                </span>
                <span className={[
                  'text-[22px] font-[800] tracking-tight leading-none',
                  isToday ? 'text-orange' : 'text-text',
                ].join(' ')}>
                  {d.getDate()}
                </span>
              </button>
            )
          })}
        </div>

        {/* Scrollable time grid */}
        <div className="flex-1 overflow-y-auto overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          <div
            className="relative"
            style={{
              display: 'grid',
              gridTemplateColumns: '56px repeat(5, 1fr)',
              height: calBodyHeight,
              minWidth: 480,
            }}
          >
            {/* Time gutter */}
            <div className="flex flex-col" style={{ paddingTop: 6 }}>
              {Array.from({ length: CAL_HOURS }, (_, i) => (
                <div
                  key={i}
                  className="flex-shrink-0 text-right pr-2.5 text-[11px] text-faint"
                  style={{ height: HOUR_H, paddingTop: 6 }}
                >
                  {hourLabel(CAL_START + i)}
                </div>
              ))}
            </div>

            {/* Day columns */}
            {weekDays.map((d, colIdx) => {
              const isToday = sameDay(d, today)
              const isSelected = sameDay(d, selectedDay)
              const booksForDay = dayBookings(d)
              const nlTop = (isToday && todayIsInWeek) ? nowLineTop(now) : null

              return (
                <div
                  key={colIdx}
                  className={[
                    'relative border-r border-line last:border-r-0 cursor-pointer',
                    isToday ? 'bg-[rgba(238,106,44,.025)]' : '',
                    isSelected && !isToday ? 'bg-[rgba(255,255,255,.01)]' : '',
                  ].join(' ')}
                  style={{ height: calBodyHeight }}
                  onClick={() => onSelectDay(d)}
                >
                  {/* Hour lines */}
                  {Array.from({ length: CAL_HOURS }, (_, h) => (
                    <div
                      key={h}
                      className="absolute left-0 right-0 border-t border-line"
                      style={{ top: h * HOUR_H }}
                    />
                  ))}

                  {/* Now line */}
                  {nlTop !== null && (
                    <div
                      className="absolute left-0 right-0 z-10"
                      style={{ top: nlTop, height: 2, background: 'var(--color-orange)' }}
                    >
                      <div
                        className="absolute rounded-full"
                        style={{
                          left: -4, top: -3,
                          width: 8, height: 8,
                          background: 'var(--color-orange)',
                        }}
                      />
                    </div>
                  )}

                  {/* Job blocks */}
                  {booksForDay.map((b) => {
                    const block = bookingToBlock(b)
                    if (!block) return null
                    const blockStyle = JOB_BLOCK_STYLE[b.status] ?? JOB_BLOCK_STYLE.pending
                    const titleColor = JOB_TITLE_COLOR[b.status] ?? 'text-orange'
                    return (
                      <div
                        key={b.id}
                        className={[
                          'absolute rounded-[9px] px-2.5 py-2 overflow-hidden cursor-pointer transition hover:brightness-110',
                          blockStyle,
                        ].join(' ')}
                        style={{ top: block.top + 2, height: block.height, left: 6, right: 6 }}
                        onClick={(e) => { e.stopPropagation(); onSelectDay(d) }}
                        title={`${b.caller_name ?? 'Unknown'} — ${formatTruckLabel(b.truck_type)}`}
                      >
                        <div className={['text-[12px] font-bold truncate', titleColor].join(' ')}>
                          {formatTruckLabel(b.truck_type)}
                        </div>
                        <div className="text-[11px] text-dim mt-0.5 truncate">
                          {b.caller_name ?? 'Unknown'}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Right: Day detail rail ─────────────────────────────────────────── */}
      <div className="flex flex-col overflow-hidden">
        {/* Day header */}
        <div className="px-[22px] py-5 border-b border-line flex-shrink-0">
          <h2 className="text-[18px] font-[800] tracking-tight">
            {selectedDay.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })}
          </h2>
          <p className="text-[13px] text-dim mt-1">
            {loading
              ? 'Loading…'
              : selectedDayBookings.length === 0
                ? 'No bookings'
                : `${selectedDayBookings.length} booking${selectedDayBookings.length !== 1 ? 's' : ''}`}
          </p>
        </div>

        {/* Job list */}
        <div className="flex-1 overflow-y-auto px-[22px] py-4" style={{ scrollbarWidth: 'none' }}>
          {selectedDayBookings.length === 0 && !loading && (
            <p className="text-[13px] text-dim py-4">No bookings scheduled for this day.</p>
          )}
          {selectedDayBookings.map((b) => {
            const startDate = b.scheduled_start ? new Date(b.scheduled_start) : null
            const timeStr = startDate
              ? startDate.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false })
              : '--:--'
            const [timePart, meridiemPart] = (() => {
              if (!startDate) return ['--', '']
              const h = startDate.getHours()
              const m = startDate.getMinutes().toString().padStart(2, '0')
              return [`${h > 12 ? h - 12 : h || 12}:${m}`, h >= 12 ? 'PM' : 'AM']
            })()
            const barColor = DAY_RAIL_BAR[b.status] ?? 'var(--color-orange)'

            return (
              <div key={b.id} className="border-b border-line last:border-b-0">
                <DayJobRow
                  time={timePart}
                  meridiem={meridiemPart}
                  barColor={barColor}
                  title={formatTruckLabel(b.truck_type)}
                  customer={[b.caller_name, b.pickup_address].filter(Boolean).join(' · ')}
                  value={STATUS_LABEL[b.status]}
                />
                {/* Action buttons inline under the row */}
                {(b.status === 'pending' || b.description) && (
                  <div className="flex gap-2 pb-3 pl-[calc(48px+14px+3px+14px)]">
                    {b.status === 'pending' && (
                      <>
                        <button
                          onClick={() => onConfirm(b)}
                          disabled={!!busy}
                          className="text-[11px] font-bold px-3 py-1 rounded-md text-green border border-green bg-[rgba(46,201,138,.08)] hover:bg-[rgba(46,201,138,.15)] transition disabled:opacity-50"
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => onCancel(b)}
                          disabled={!!busy}
                          className="text-[11px] font-bold px-3 py-1 rounded-md text-[#f0625a] border border-[#f0625a] bg-transparent hover:bg-[rgba(240,98,90,.1)] transition disabled:opacity-50"
                        >
                          Cancel
                        </button>
                      </>
                    )}
                    {b.description && (
                      <button
                        onClick={() => onNotes(b)}
                        className="text-[11px] font-bold px-3 py-1 rounded-md text-blue border border-blue bg-[rgba(74,159,232,.08)] hover:bg-[rgba(74,159,232,.15)] transition"
                      >
                        Notes
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── List View ─────────────────────────────────────────────────────────────────

function ListView({
  list,
  filtered,
  tab,
  onTab,
  onConfirm,
  onCancel,
  onNotes,
  busy,
  loading,
}: {
  list: Booking[]
  filtered: Booking[]
  tab: ListTab
  onTab: (t: ListTab) => void
  onConfirm: (b: Booking) => void
  onCancel: (b: Booking) => void
  onNotes: (b: Booking) => void
  busy: string | null
  loading: boolean
}) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden px-7 py-5">
      {/* Tabs */}
      <div className="flex gap-1.5 mb-4">
        {(['pending', 'confirmed', 'all'] as ListTab[]).map(t => (
          <button
            key={t}
            onClick={() => onTab(t)}
            className={[
              'px-3.5 py-1.5 rounded-lg text-[12px] font-bold transition border',
              tab === t
                ? 'bg-orange text-white border-orange'
                : 'bg-[rgba(255,255,255,.04)] border-line text-dim hover:text-text',
            ].join(' ')}
          >
            {t === 'pending' ? 'Pending' : t === 'confirmed' ? 'Confirmed' : 'All'}
            {' '}
            <span className="opacity-70 text-[11px]">
              {t === 'all' ? list.length : list.filter(b => b.status === t).length}
            </span>
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-[14px] border border-line bg-card overflow-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-[#071829]">
              {['Received', 'Caller', 'Service', 'Scheduled', 'Status', 'Actions'].map(h => (
                <th key={h} className="text-left px-4 py-2.5 text-[11px] font-bold text-[#4A7FBB] uppercase tracking-[.06em]">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={6} className="py-8 text-center text-[13px] text-dim">Loading…</td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-[13px] text-dim">
                  {tab === 'pending' ? 'No pending bookings.' : 'No bookings here.'}
                  {' '}Booking requests from callers appear here.
                </td>
              </tr>
            )}
            {filtered.map((b, i) => {
              const statusCls = STATUS_COLOR[b.status]
              return (
                <tr
                  key={b.id}
                  className={[
                    'border-t border-[rgba(255,255,255,.04)]',
                    i % 2 === 0 ? 'bg-card' : 'bg-[#071829]',
                  ].join(' ')}
                >
                  <td className="px-4 py-3 text-[13px] text-dim text-[12px]">
                    {new Date(b.created_at).toLocaleString('en-AU', {
                      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                    })}
                  </td>
                  <td className="px-4 py-3 text-[13px]">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-semibold text-text">{b.caller_name ?? 'Unknown'}</span>
                      {b.confirmation_ref && (
                        <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-[rgba(74,159,232,.12)] text-blue border border-[rgba(74,159,232,.25)]">
                          REF: {b.confirmation_ref}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-dim mt-0.5">{b.caller_phone ?? '—'}</div>
                  </td>
                  <td className="px-4 py-3 text-[13px]">
                    <div className="text-text">{formatTruckLabel(b.truck_type)}</div>
                    {(b.pickup_address || b.dropoff_address) && (
                      <div className="text-[11px] text-dim mt-0.5">
                        {b.pickup_address}
                        {b.pickup_address && b.dropoff_address && ' → '}
                        {b.dropoff_address}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[12px] text-dim">{formatScheduled(b)}</td>
                  <td className="px-4 py-3">
                    <span className={['text-[11px] font-bold tracking-[.04em] px-2.5 py-1 rounded-full uppercase', statusCls].join(' ')}>
                      {STATUS_LABEL[b.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1.5 flex-wrap">
                      {b.status === 'pending' && (
                        <>
                          <button
                            onClick={() => onConfirm(b)}
                            disabled={!!busy}
                            className="text-[11px] font-bold px-2.5 py-1 rounded-md text-green border border-green bg-transparent hover:bg-[rgba(46,201,138,.1)] transition disabled:opacity-50"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => onCancel(b)}
                            disabled={!!busy}
                            className="text-[11px] font-bold px-2.5 py-1 rounded-md text-[#f0625a] border border-[#f0625a] bg-transparent hover:bg-[rgba(240,98,90,.1)] transition disabled:opacity-50"
                          >
                            Cancel
                          </button>
                        </>
                      )}
                      {b.description && (
                        <button
                          onClick={() => onNotes(b)}
                          className="text-[11px] font-bold px-2.5 py-1 rounded-md text-blue border border-blue bg-transparent hover:bg-[rgba(74,159,232,.1)] transition"
                        >
                          Notes
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Modals ───────────────────────────────────────────────────────────────────

function ConfirmModal({ booking, businessName, busy, onCancel, onConfirm }: {
  booking: Booking; businessName: string; busy: boolean; onCancel: () => void; onConfirm: () => void
}) {
  const name = booking.caller_name ?? 'there'
  const when = booking.scheduled_start
    ? new Date(booking.scheduled_start).toLocaleString('en-AU', {
        weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
      })
    : 'the time discussed'
  return (
    <ModalShell onClose={onCancel}>
      <h2 className="text-[18px] font-[800] text-text mb-3">Send confirmation SMS</h2>
      <p className="text-[13px] text-dim mb-3.5">
        Send a confirmation SMS to <strong className="text-text">{booking.caller_phone ?? 'the caller'}</strong>?
      </p>
      <div className="px-3.5 py-3 rounded-lg bg-bg border border-line text-[13px] text-text leading-relaxed mb-3.5">
        Hi {name}, your booking with {businessName} has been confirmed for {when}. See you then!
      </div>
      <div className="flex justify-end gap-2.5">
        <button onClick={onCancel} className="px-4 py-2.5 rounded-lg text-[13px] font-semibold bg-transparent border border-line text-dim hover:text-text transition">Cancel</button>
        <button onClick={onConfirm} disabled={busy} className="px-4 py-2.5 rounded-lg text-[13px] font-bold text-white border border-green bg-[rgba(46,201,138,.15)] hover:bg-[rgba(46,201,138,.25)] transition disabled:opacity-50">
          {busy ? 'Sending…' : 'Send SMS and confirm'}
        </button>
      </div>
    </ModalShell>
  )
}

function NotesModal({ booking, onClose }: { booking: Booking; onClose: () => void }) {
  return (
    <ModalShell onClose={onClose}>
      <h2 className="text-[18px] font-[800] text-text mb-3">Booking notes</h2>
      <div className="px-3.5 py-3 rounded-lg bg-bg border border-line text-[13px] text-text whitespace-pre-wrap leading-relaxed">
        {booking.description ?? ''}
      </div>
      <div className="flex justify-end mt-3.5">
        <button onClick={onClose} className="px-4 py-2.5 rounded-lg text-[13px] font-semibold bg-transparent border border-line text-dim hover:text-text transition">Close</button>
      </div>
    </ModalShell>
  )
}

function NewBookingModal({ onClose, onCreated, onError }: {
  onClose: () => void; onCreated: () => void; onError: (m: string) => void
}) {
  const [callerName, setCallerName] = useState('')
  const [callerPhone, setCallerPhone] = useState('')
  const [truckType, setTruckType] = useState('')
  const [pickupAddress, setPickupAddress] = useState('')
  const [dropoffAddress, setDropoffAddress] = useState('')
  const [scheduledStart, setScheduledStart] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!callerName.trim() || !callerPhone.trim() || !truckType || !scheduledStart) {
      onError('Caller name, phone, truck type, and scheduled time are required.')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/portal/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caller_name: callerName.trim(),
          caller_phone: callerPhone.trim(),
          truck_type: truckType,
          pickup_address: pickupAddress.trim() || null,
          dropoff_address: dropoffAddress.trim() || null,
          scheduled_start: scheduledStart,
          description: description.trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to create booking')
      onCreated()
    } catch (e) {
      onError((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <ModalShell onClose={onClose}>
      <h2 className="text-[18px] font-[800] text-text mb-3">New booking</h2>
      <p className="text-[13px] text-dim mb-3.5">Manually create a booking. The caller will receive an SMS confirmation if enabled.</p>
      <form onSubmit={submit}>
        <div className="flex flex-col gap-2.5">
          <Field label="Caller name *">
            <input value={callerName} onChange={e => setCallerName(e.target.value)} required className={inputCls} />
          </Field>
          <Field label="Caller phone *">
            <input value={callerPhone} onChange={e => setCallerPhone(e.target.value)} required type="tel" placeholder="04..." className={inputCls} />
          </Field>
          <Field label="Truck type *">
            <select value={truckType} onChange={e => setTruckType(e.target.value)} required className={inputCls}>
              <option value="">Select…</option>
              {TRUCK_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Pickup address">
            <input value={pickupAddress} onChange={e => setPickupAddress(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Dropoff address">
            <input value={dropoffAddress} onChange={e => setDropoffAddress(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Scheduled date & time *">
            <input value={scheduledStart} onChange={e => setScheduledStart(e.target.value)} required type="datetime-local" className={inputCls} />
          </Field>
          <Field label="Notes / description">
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} className={[inputCls, 'resize-y font-[Outfit,sans-serif]'].join(' ')} />
          </Field>
        </div>
        <div className="flex justify-end gap-2.5 mt-4">
          <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-lg text-[13px] font-semibold bg-transparent border border-line text-dim hover:text-text transition">Cancel</button>
          <button type="submit" disabled={submitting} className="px-4 py-2.5 rounded-lg text-[13px] font-bold text-white bg-[linear-gradient(135deg,#f58a42,#e86526)] shadow-[0_4px_14px_rgba(238,106,44,.35)] hover:brightness-110 transition disabled:opacity-50">
            {submitting ? 'Creating…' : 'Create booking'}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}

// ─── Shared atoms ─────────────────────────────────────────────────────────────

const inputCls = [
  'w-full px-[11px] py-[9px] rounded-lg text-[13px]',
  'bg-bg border border-line text-text outline-none',
  'focus:border-[rgba(255,255,255,.2)] transition',
].join(' ')

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-bold text-dim uppercase tracking-[.05em]">{label}</span>
      {children}
    </label>
  )
}

function ModalShell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 bg-[rgba(0,0,0,.6)] backdrop-blur-md flex items-center justify-center z-[200] p-5"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="bg-card border border-line rounded-[16px] p-6 max-w-[520px] w-full max-h-[90vh] overflow-y-auto shadow-[0_20px_60px_rgba(0,0,0,.5)]"
      >
        {children}
      </div>
    </div>
  )
}
