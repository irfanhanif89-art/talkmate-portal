'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { silentSyncAgent } from '@/components/portal/sync-agent-button'
import { routeLabel } from '@/lib/extract-suburb'

// Session 15 — TalkMate native scheduler.
// One page, three tabs (Calendar / Job List / Settings). Calendar has
// a week and day view; the day view uses a driver-lane layout where
// each driver gets a horizontal row across the operating hours.

type Tab = 'calendar' | 'list' | 'settings'
type View = 'week' | 'day'

interface Booking {
  id: string
  client_id: string
  caller_name: string | null
  caller_phone: string | null
  description: string | null
  pickup_address: string | null
  pickup_contact_name: string | null
  pickup_contact_phone: string | null
  dropoff_address: string | null
  dropoff_contact_name: string | null
  dropoff_contact_phone: string | null
  truck_type: string | null
  rate_type: string | null
  account_id: string | null
  driver_id: string | null
  booking_source: 'agent' | 'manual' | 'google_calendar' | 'walk_in' | null
  estimated_value: number | null
  scheduled_start: string | null
  scheduled_end: string | null
  actual_start: string | null
  actual_end: string | null
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'no_show' | 'declined'
  sms_confirmation_sent: boolean | null
  created_at: string
  waitlist_position?: number | null
  distance_km?: number | null
  duration_minutes?: number | null
  // Session 29 — Hayden SMS confirmation loop
  confirmation_ref?: string | null
  dispatcher_notified_at?: string | null
  reminder_sent_at?: string | null
  confirmed_at?: string | null
  confirmed_by_phone?: string | null
}

// Session 29 — status-only colour palette per brief. Separate from
// sourceColor() because that function mixes status + booking_source +
// in-progress signals; the brief wants a clean status badge.
function statusBadgeColor(status: Booking['status']): { bg: string; color: string } {
  switch (status) {
    case 'pending':   return { bg: 'rgba(245,158,11,0.15)',  color: '#F59E0B' }
    case 'confirmed': return { bg: 'rgba(34,197,94,0.15)',   color: '#22C55E' }
    case 'declined':  return { bg: 'rgba(239,68,68,0.15)',   color: '#EF4444' }
    case 'cancelled': return { bg: 'rgba(156,163,175,0.15)', color: '#9CA3AF' }
    case 'completed': return { bg: 'rgba(74,159,232,0.15)',  color: '#4A9FE8' }
    case 'no_show':   return { bg: 'rgba(239,68,68,0.15)',   color: '#EF4444' }
  }
}

interface Driver {
  id: string
  name: string
  active?: boolean
}

interface OperatingDay { open?: string; close?: string; enabled?: boolean }
interface SchedulerSettings {
  id?: string
  state?: string | null
  timezone?: string | null
  operating_hours?: Record<string, OperatingDay> | null
  buffer_minutes?: number | null
  max_concurrent_jobs?: number | null
  booking_confirmation_sms?: boolean | null
  booking_confirmation_email?: boolean | null
  reminder_24h_enabled?: boolean | null
  reminder_2h_enabled?: boolean | null
  waitlist_enabled?: boolean | null
  waitlist_auto_notify?: boolean | null
  waitlist_claim_window_minutes?: number | null
  cancellation_policy_enabled?: boolean | null
  cancellation_notice_hours?: number | null
  cancellation_fee_aud?: number | null
  default_duration_tilt_minutes?: number | null
  default_duration_sideloader_minutes?: number | null
  default_duration_minutes?: number | null
  mode?: string | null
  overridden_holidays?: string[] | null
}

interface Props {
  plan: string
  industry: string | null
  hasAgent: boolean
  initialLastSyncedAt?: string | null
  adminClientId?: string | null
  smsLimit: number
  smsUsed: number
}

const ORANGE = '#E8622A'
const TEXT_DIM = '#7BAED4'
const NAV_BG = '#0A1E38'
const CARD_BG = '#071829'

// ───────── helpers ─────────

const DAYS: Array<keyof Record<string, OperatingDay>> = [
  'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday',
]

function startOfWeek(d: Date): Date {
  const x = new Date(d)
  const day = x.getDay()
  x.setDate(x.getDate() - day + 1) // Monday-anchored
  x.setHours(0, 0, 0, 0)
  return x
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

function fmtDayLabel(d: Date): string {
  return d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric' })
}

function fmtWeekRange(start: Date): string {
  const end = addDays(start, 6)
  return `${start.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })} — ${end.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}`
}

function fmtDayHeader(d: Date): string {
  return d.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })
}

function hhmmToMinutes(s: string | undefined | null): number {
  if (!s) return 0
  const [h, m] = s.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

function startEndForDay(settings: SchedulerSettings | null, dayKey: string): { startMin: number; endMin: number; enabled: boolean } {
  const cfg = settings?.operating_hours?.[dayKey]
  const enabled = cfg?.enabled !== false
  return {
    startMin: hhmmToMinutes(cfg?.open ?? '08:00'),
    endMin: hhmmToMinutes(cfg?.close ?? '18:00'),
    enabled,
  }
}

function dayKey(d: Date): string {
  return DAYS[d.getDay()]
}

function sourceColor(b: Booking): { border: string; tint: string; label: string; pill: string } {
  if (b.status === 'cancelled') return { border: '#9CA3AF', tint: 'rgba(156,163,175,0.08)', label: 'Cancelled', pill: '#9CA3AF' }
  // Session 29 — declined bookings get the red tint everywhere
  // sourceColor is consulted (calendar tiles, list row tint).
  if (b.status === 'declined')  return { border: '#EF4444', tint: 'rgba(239,68,68,0.10)',    label: 'Declined',  pill: '#EF4444' }
  if (b.actual_start && !b.actual_end) return { border: '#22C55E', tint: 'rgba(34,197,94,0.12)', label: 'In Progress', pill: '#22C55E' }
  if (b.booking_source === 'agent') return { border: ORANGE, tint: 'rgba(232,98,42,0.12)', label: 'Agent', pill: ORANGE }
  if (b.booking_source === 'walk_in') return { border: '#A855F7', tint: 'rgba(168,85,247,0.12)', label: 'Walk-in', pill: '#A855F7' }
  return { border: '#4A9FE8', tint: 'rgba(74,159,232,0.12)', label: 'Manual', pill: '#4A9FE8' }
}

function truckLabel(t: string | null): string {
  if (!t) return ''
  if (t === 'loaded_tilt_tray') return 'Loaded Tilt Tray'
  if (t === 'empty_tilt_tray') return 'Empty Tilt Tray'
  if (t === 'sideloader_40ft') return 'Sideloader 40ft'
  return t
}

// ───────── main component ─────────

export default function SchedulerView(props: Props) {
  const router = useRouter()
  const params = useSearchParams()
  const tabParam = params.get('tab')
  const viewParam = params.get('view')
  const initialTab: Tab = tabParam === 'list' ? 'list' : tabParam === 'settings' ? 'settings' : 'calendar'
  const initialView: View = viewParam === 'week' ? 'week' : 'day'

  const [tab, setTab] = useState<Tab>(initialTab)
  const [view, setView] = useState<View>(initialView)
  const [anchor, setAnchor] = useState<Date>(() => initialView === 'week' ? startOfWeek(new Date()) : new Date(new Date().setHours(0, 0, 0, 0)))
  const [bookings, setBookings] = useState<Booking[]>([])
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [settings, setSettings] = useState<SchedulerSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Booking | null>(null)
  const [adding, setAdding] = useState<{ start?: string; driverId?: string } | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const isTowing = props.industry === 'towing'
  const adminClientId = props.adminClientId ?? null

  const bookingsBase = adminClientId
    ? `/api/admin/businesses/${adminClientId}/bookings`
    : '/api/portal/bookings'
  const schedulerBase = adminClientId
    ? `/api/admin/businesses/${adminClientId}/scheduler-config`
    : '/api/portal/scheduler-config'
  const driversBase = adminClientId
    ? `/api/admin/businesses/${adminClientId}/drivers`
    : '/api/portal/drivers'

  function showToast(m: string) { setToast(m); setTimeout(() => setToast(null), 3000) }

  function selectTab(next: Tab) {
    setTab(next)
    const search = new URLSearchParams(params.toString())
    search.set('tab', next)
    router.replace(`?${search.toString()}`, { scroll: false })
  }

  function selectView(next: View) {
    setView(next)
    const search = new URLSearchParams(params.toString())
    search.set('view', next)
    router.replace(`?${search.toString()}`, { scroll: false })
    if (next === 'week') setAnchor(startOfWeek(anchor))
    else { const d = new Date(anchor); d.setHours(0, 0, 0, 0); setAnchor(d) }
  }

  const loadBookings = useCallback(async () => {
    const from = view === 'week' ? startOfWeek(anchor) : new Date(anchor)
    const to = view === 'week' ? addDays(from, 7) : addDays(from, 1)
    const url = `${bookingsBase}?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`
    const res = await fetch(url)
    if (res.ok) {
      const d = await res.json()
      setBookings((d.bookings ?? []) as Booking[])
    }
  }, [view, anchor, bookingsBase])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const [bRes, dRes, sRes] = await Promise.all([
          (async () => {
            const from = view === 'week' ? startOfWeek(anchor) : new Date(anchor)
            const to = view === 'week' ? addDays(from, 7) : addDays(from, 1)
            return fetch(`${bookingsBase}?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`)
          })(),
          fetch(driversBase).catch(() => null),
          fetch(schedulerBase),
        ])
        if (!cancelled) {
          if (bRes.ok) { const d = await bRes.json(); setBookings((d.bookings ?? []) as Booking[]) }
          if (dRes && dRes.ok) { const d = await dRes.json(); setDrivers((d.drivers ?? d.data ?? []) as Driver[]) }
          if (sRes.ok) { const d = await sRes.json(); setSettings((d.scheduler_settings ?? null) as SchedulerSettings | null) }
        }
      } finally { if (!cancelled) setLoading(false) }
    }
    load()
    return () => { cancelled = true }
  }, [view, anchor, bookingsBase, driversBase, schedulerBase])

  function navigate(delta: number) {
    if (view === 'week') setAnchor(prev => addDays(prev, delta * 7))
    else setAnchor(prev => addDays(prev, delta))
  }
  function jumpToday() {
    setAnchor(view === 'week' ? startOfWeek(new Date()) : new Date(new Date().setHours(0, 0, 0, 0)))
  }

  // Stats
  const stats = useMemo(() => {
    const todayKey = new Date().toDateString()
    const today = bookings.filter(b => b.scheduled_start && new Date(b.scheduled_start).toDateString() === todayKey)
    const onShift = drivers.filter(d => d.active !== false).length
    const revenue = today.reduce((sum, b) => sum + (Number(b.estimated_value) || 0), 0)
    return { jobsToday: today.length, onShift, revenue }
  }, [bookings, drivers])

  return (
    <div style={{ padding: 28, maxWidth: 1400, margin: '0 auto', color: '#F2F6FB', fontFamily: 'Outfit, sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18, gap: 12, flexWrap: 'wrap' as const }}>
        <div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'white', margin: 0 }}>Scheduler</h1>
          <p style={{ fontSize: 13, color: TEXT_DIM, margin: '4px 0 0 0' }}>Calendar, jobs, and scheduler settings. SMS limit: {props.smsUsed} of {props.smsLimit} used this month.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setAdding({ start: new Date().toISOString() })} style={primaryBtn}>+ Add Job</button>
        </div>
      </div>

      <div style={tabBarStyle}>
        <TabButton active={tab === 'calendar'} onClick={() => selectTab('calendar')}>Calendar</TabButton>
        <TabButton active={tab === 'list'} onClick={() => selectTab('list')}>Job List</TabButton>
        <TabButton active={tab === 'settings'} onClick={() => selectTab('settings')}>Settings</TabButton>
      </div>

      {tab === 'calendar' && (
        <CalendarTab
          view={view}
          anchor={anchor}
          bookings={bookings}
          drivers={drivers}
          settings={settings}
          loading={loading}
          isTowing={isTowing}
          stats={stats}
          onNavigate={navigate}
          onToday={jumpToday}
          onView={selectView}
          onJobClick={b => setSelected(b)}
          onEmptyClick={(start, driverId) => setAdding({ start, driverId })}
        />
      )}
      {tab === 'list' && (
        <JobListTab
          bookings={bookings}
          drivers={drivers}
          onSelect={setSelected}
        />
      )}
      {tab === 'settings' && (
        <SchedulerSettingsTab
          settings={settings}
          onSave={async (next) => {
            const res = await fetch(schedulerBase, {
              method: 'PATCH', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(next),
            })
            if (res.ok) {
              const d = await res.json()
              setSettings(d.scheduler_settings)
              showToast('Settings saved')
              silentSyncAgent(adminClientId)
            } else {
              showToast('Save failed')
            }
          }}
          plan={props.plan}
          isTowing={isTowing}
          smsLimit={props.smsLimit}
          smsUsed={props.smsUsed}
        />
      )}

      {selected && (
        <JobDetailModal
          booking={selected}
          drivers={drivers}
          baseUrl={bookingsBase}
          onClose={() => setSelected(null)}
          onUpdated={() => { setSelected(null); loadBookings(); showToast('Job updated') }}
          isTowing={isTowing}
        />
      )}
      {adding && (
        <AddJobModal
          baseUrl={bookingsBase}
          drivers={drivers}
          settings={settings}
          initialStart={adding.start}
          initialDriverId={adding.driverId}
          isTowing={isTowing}
          onClose={() => setAdding(null)}
          onSaved={() => { setAdding(null); loadBookings(); showToast('Job added') }}
        />
      )}
      {toast && <div style={toastStyle}>{toast}</div>}
    </div>
  )
}

// ───────── calendar tab ─────────

function CalendarTab(props: {
  view: View
  anchor: Date
  bookings: Booking[]
  drivers: Driver[]
  settings: SchedulerSettings | null
  loading: boolean
  isTowing: boolean
  stats: { jobsToday: number; onShift: number; revenue: number }
  onNavigate: (d: number) => void
  onToday: () => void
  onView: (v: View) => void
  onJobClick: (b: Booking) => void
  onEmptyClick: (start: string, driverId?: string) => void
}) {
  const { view, anchor, bookings, drivers, settings, isTowing, stats, onNavigate, onToday, onView, onJobClick, onEmptyClick } = props
  const label = view === 'week' ? fmtWeekRange(anchor) : fmtDayHeader(anchor)

  // Determine grid hour range from operating hours (union across days)
  const hourRange = useMemo(() => {
    let earliest = 7 * 60
    let latest = 18 * 60
    for (const d of DAYS) {
      const day = settings?.operating_hours?.[d]
      if (day?.enabled === false) continue
      const open = hhmmToMinutes(day?.open ?? '08:00')
      const close = hhmmToMinutes(day?.close ?? '18:00')
      if (open < earliest) earliest = open
      if (close > latest) latest = close
    }
    return { startHour: Math.floor(earliest / 60), endHour: Math.ceil(latest / 60) }
  }, [settings])

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' as const }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={() => onNavigate(-1)} style={iconNav}>‹</button>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'white' }}>{label}</div>
          <button onClick={() => onNavigate(1)} style={iconNav}>›</button>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={onToday} style={ghostBtn}>Today</button>
          <div style={{ display: 'flex', borderRadius: 9, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
            <button onClick={() => onView('week')} style={view === 'week' ? primaryBtnSmall : ghostBtnFlat}>Week</button>
            <button onClick={() => onView('day')} style={view === 'day' ? primaryBtnSmall : ghostBtnFlat}>Day</button>
          </div>
        </div>
      </div>

      {/* Stats pills */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' as const }}>
        <StatPill label="Jobs Today" value={String(stats.jobsToday)} />
        <StatPill label="Drivers" value={`${stats.onShift} on shift`} />
        <StatPill label="Est. Revenue" value={`$${Math.round(stats.revenue)}`} />
      </div>

      {/* Calendar grid */}
      {view === 'week'
        ? <WeekGrid anchor={anchor} bookings={bookings} settings={settings} hourRange={hourRange} onJobClick={onJobClick} onEmptyClick={onEmptyClick} />
        : <DayGrid anchor={anchor} bookings={bookings} drivers={drivers} settings={settings} hourRange={hourRange} isTowing={isTowing} onJobClick={onJobClick} onEmptyClick={onEmptyClick} />}

      {/* Legend */}
      <div style={{ display: 'flex', gap: 14, marginTop: 14, flexWrap: 'wrap' as const, fontSize: 11, color: TEXT_DIM }}>
        <LegendDot color="#22C55E" label="In Progress" />
        <LegendDot color={ORANGE} label="Booked by Agent" />
        <LegendDot color="#4A9FE8" label="Manual Entry" />
        <LegendDot color="#A855F7" label="Walk-in" />
        <LegendDot color="#9CA3AF" label="Cancelled / Closed" />
      </div>
    </div>
  )
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: NAV_BG, border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '8px 14px', fontSize: 12 }}>
      <span style={{ color: TEXT_DIM, marginRight: 8 }}>{label}</span>
      <span style={{ fontWeight: 700, color: 'white' }}>{value}</span>
    </div>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 8, height: 8, borderRadius: 99, background: color, display: 'inline-block' }} />
      {label}
    </span>
  )
}

// ───────── week view ─────────

function WeekGrid({ anchor, bookings, settings, hourRange, onJobClick, onEmptyClick }: {
  anchor: Date
  bookings: Booking[]
  settings: SchedulerSettings | null
  hourRange: { startHour: number; endHour: number }
  onJobClick: (b: Booking) => void
  onEmptyClick: (start: string, driverId?: string) => void
}) {
  const weekStart = startOfWeek(anchor)
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const hours = Array.from({ length: hourRange.endHour - hourRange.startHour }, (_, i) => hourRange.startHour + i)

  function bookingsForDay(d: Date): Booking[] {
    return bookings.filter(b => b.scheduled_start && new Date(b.scheduled_start).toDateString() === d.toDateString())
  }

  return (
    <div style={{ background: NAV_BG, border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, overflow: 'auto' as const }}>
      <div style={{ display: 'grid', gridTemplateColumns: `52px repeat(7, 1fr)`, minWidth: 800 }}>
        {/* Header row */}
        <div style={cellHeader} />
        {days.map(d => {
          const isToday = d.toDateString() === new Date().toDateString()
          return (
            <div key={d.toISOString()} style={{ ...cellHeader, textAlign: 'center' as const }}>
              <div style={{ fontSize: 10, color: TEXT_DIM, textTransform: 'uppercase' as const }}>{d.toLocaleDateString('en-AU', { weekday: 'short' })}</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: isToday ? ORANGE : 'white' }}>{d.getDate()}</div>
            </div>
          )
        })}

        {/* Hour rows */}
        {hours.map(h => (
          <div key={`row-${h}`} style={{ display: 'contents' }}>
            <div style={timeLabel}>{formatHourLabel(h)}</div>
            {days.map(d => {
              const key = dayKey(d)
              const cfg = startEndForDay(settings, key)
              const cellStartMin = h * 60
              const closed = !cfg.enabled || cellStartMin < cfg.startMin || cellStartMin >= cfg.endMin
              return (
                <div
                  key={`${d.toISOString()}-${h}`}
                  onClick={() => {
                    if (closed) return
                    const slot = new Date(d); slot.setHours(h, 0, 0, 0)
                    onEmptyClick(slot.toISOString())
                  }}
                  style={{
                    position: 'relative' as const,
                    minHeight: 60,
                    borderTop: '1px solid rgba(255,255,255,0.04)',
                    borderLeft: '1px solid rgba(255,255,255,0.04)',
                    background: closed ? 'repeating-linear-gradient(45deg, rgba(255,255,255,0.02), rgba(255,255,255,0.02) 4px, rgba(255,255,255,0.04) 4px, rgba(255,255,255,0.04) 8px)' : 'transparent',
                    cursor: closed ? 'not-allowed' : 'pointer',
                  }}
                  onMouseEnter={e => { if (!closed) e.currentTarget.style.background = 'rgba(255,255,255,0.03)' }}
                  onMouseLeave={e => { if (!closed) e.currentTarget.style.background = 'transparent' }}
                >
                  {h === hours[0] && (
                    <WeekDayBlocks bookings={bookingsForDay(d)} hourStart={hourRange.startHour} hourEnd={hourRange.endHour} onClick={onJobClick} />
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

function WeekDayBlocks({ bookings, hourStart, hourEnd, onClick }: {
  bookings: Booking[]
  hourStart: number
  hourEnd: number
  onClick: (b: Booking) => void
}) {
  const totalMinutes = (hourEnd - hourStart) * 60
  return (
    <div style={{ position: 'absolute' as const, top: 0, left: 2, right: 2, bottom: 0, pointerEvents: 'none' as const }}>
      {bookings.map(b => {
        if (!b.scheduled_start) return null
        const start = new Date(b.scheduled_start)
        const end = b.scheduled_end ? new Date(b.scheduled_end) : new Date(start.getTime() + 60 * 60 * 1000)
        const startMin = (start.getHours() - hourStart) * 60 + start.getMinutes()
        const endMin = (end.getHours() - hourStart) * 60 + end.getMinutes()
        const topPct = (startMin / totalMinutes) * 100 * (hourEnd - hourStart)
        const heightPct = ((endMin - startMin) / totalMinutes) * 100 * (hourEnd - hourStart)
        const color = sourceColor(b)
        return (
          <div
            key={b.id}
            onClick={(e) => { e.stopPropagation(); onClick(b) }}
            style={{
              position: 'absolute' as const,
              top: `${topPct}px`,
              height: `${Math.max(28, heightPct)}px`,
              left: 2, right: 2,
              background: color.tint,
              border: `1px solid ${color.border}`,
              borderLeft: `3px solid ${color.border}`,
              borderRadius: 6,
              padding: '4px 6px',
              fontSize: 11,
              color: 'white',
              overflow: 'hidden',
              cursor: 'pointer',
              pointerEvents: 'auto' as const,
            }}
          >
            <div style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{b.caller_name ?? 'Job'}</div>
            <div style={{ color: TEXT_DIM, fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
              {routeLabel(b.pickup_address, b.dropoff_address, b.truck_type ? truckLabel(b.truck_type) : (b.description ?? null)) ?? '—'}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function formatHourLabel(h: number): string {
  const date = new Date()
  date.setHours(h, 0, 0, 0)
  return date.toLocaleTimeString('en-AU', { hour: 'numeric', hour12: true })
}

// ───────── day view (driver lanes) ─────────

function DayGrid({ anchor, bookings, drivers, settings, hourRange, isTowing, onJobClick, onEmptyClick }: {
  anchor: Date
  bookings: Booking[]
  drivers: Driver[]
  settings: SchedulerSettings | null
  hourRange: { startHour: number; endHour: number }
  isTowing: boolean
  onJobClick: (b: Booking) => void
  onEmptyClick: (start: string, driverId?: string) => void
}) {
  const lanes = isTowing && drivers.length > 0
    ? drivers
    : [{ id: '__any__', name: 'Schedule' } as Driver]

  const key = dayKey(anchor)
  const cfg = startEndForDay(settings, key)
  const hours = Array.from({ length: hourRange.endHour - hourRange.startHour }, (_, i) => hourRange.startHour + i)
  const colWidth = 110
  const laneHeight = 110

  function bookingsForLane(driverId: string): Booking[] {
    return bookings.filter(b => {
      if (!b.scheduled_start) return false
      if (new Date(b.scheduled_start).toDateString() !== anchor.toDateString()) return false
      if (driverId === '__any__') return true
      return b.driver_id === driverId
    })
  }

  return (
    <div style={{ background: NAV_BG, border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, overflowX: 'auto' as const, overflowY: 'visible' as const }}>
      <div style={{ display: 'grid', gridTemplateColumns: `120px repeat(${hours.length}, ${colWidth}px)`, minWidth: 120 + hours.length * colWidth }}>
        {/* Header row */}
        <div style={{ ...cellHeader, position: 'sticky' as const, left: 0, background: NAV_BG, zIndex: 3 }}>
          <div style={{ fontSize: 10, color: TEXT_DIM, textTransform: 'uppercase' as const }}>Driver</div>
        </div>
        {hours.map(h => (
          <div key={`th-${h}`} style={cellHeader}>{formatHourLabel(h)}</div>
        ))}

        {/* Lane rows */}
        {lanes.map(d => (
          <div key={d.id} style={{ display: 'contents' }}>
            <div style={{ position: 'sticky' as const, left: 0, background: CARD_BG, zIndex: 2, padding: '12px 14px', borderTop: '1px solid rgba(255,255,255,0.06)', borderRight: '1px solid rgba(255,255,255,0.06)', height: laneHeight, boxSizing: 'border-box' as const }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'white' }}>{d.name}</div>
              <div style={{ fontSize: 11, color: TEXT_DIM, marginTop: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: 99, background: '#22C55E', display: 'inline-block', marginRight: 6 }} />
                Available
              </div>
            </div>
            <div style={{ gridColumn: `2 / span ${hours.length}`, position: 'relative' as const, height: laneHeight, background: cfg.enabled ? 'transparent' : 'repeating-linear-gradient(45deg, rgba(255,255,255,0.02), rgba(255,255,255,0.02) 4px, rgba(255,255,255,0.04) 4px, rgba(255,255,255,0.04) 8px)' }}>
              {hours.map((h, i) => {
                const cellStartMin = h * 60
                const closed = !cfg.enabled || cellStartMin < cfg.startMin || cellStartMin >= cfg.endMin
                return (
                  <div
                    key={`cell-${d.id}-${h}`}
                    onClick={() => {
                      if (closed) return
                      const slot = new Date(anchor); slot.setHours(h, 0, 0, 0)
                      onEmptyClick(slot.toISOString(), d.id === '__any__' ? undefined : d.id)
                    }}
                    style={{
                      position: 'absolute' as const,
                      top: 0,
                      bottom: 0,
                      left: i * colWidth,
                      width: colWidth,
                      borderTop: '1px solid rgba(255,255,255,0.04)',
                      borderRight: '1px solid rgba(255,255,255,0.04)',
                      cursor: closed ? 'not-allowed' : 'pointer',
                      background: closed ? 'repeating-linear-gradient(45deg, rgba(255,255,255,0.02), rgba(255,255,255,0.02) 4px, rgba(255,255,255,0.04) 4px, rgba(255,255,255,0.04) 8px)' : 'transparent',
                      display: 'flex',
                      alignItems: 'center' as const,
                      justifyContent: 'center' as const,
                      fontSize: 9,
                      color: '#4A7FBB',
                    }}
                  >
                    {!closed && <span style={{ opacity: 0.4 }}>OPEN</span>}
                  </div>
                )
              })}
              {bookingsForLane(d.id).map(b => {
                if (!b.scheduled_start) return null
                const start = new Date(b.scheduled_start)
                const end = b.scheduled_end ? new Date(b.scheduled_end) : new Date(start.getTime() + 60 * 60 * 1000)
                const startCol = (start.getHours() + start.getMinutes() / 60) - hourRange.startHour
                const durationHours = Math.max(0.25, (end.getTime() - start.getTime()) / (60 * 60 * 1000))
                const left = startCol * colWidth
                const width = durationHours * colWidth
                const color = sourceColor(b)
                return (
                  <div
                    key={b.id}
                    onClick={() => onJobClick(b)}
                    style={{
                      position: 'absolute' as const,
                      top: 8, bottom: 8,
                      left: left + 3, width: Math.max(48, width - 6),
                      background: color.tint,
                      border: `1px solid ${color.border}`,
                      borderLeft: `3px solid ${color.border}`,
                      borderRadius: 8,
                      padding: '6px 8px',
                      fontSize: 11,
                      color: 'white',
                      overflow: 'hidden',
                      cursor: 'pointer',
                      zIndex: 1,
                    }}
                  >
                    <div style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{b.caller_name ?? 'Job'}</div>
                    <div style={{ color: TEXT_DIM, fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                      {routeLabel(b.pickup_address, b.dropoff_address, b.truck_type ? truckLabel(b.truck_type) : (b.description ?? null)) ?? '—'}
                    </div>
                    <div style={{ color: '#7BAED4', fontSize: 10, marginTop: 2, fontFamily: 'monospace' }}>
                      {start.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true })}
                      {' -- '}
                      {end.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ───────── job list tab ─────────

function JobListTab({ bookings, drivers, onSelect }: { bookings: Booking[]; drivers: Driver[]; onSelect: (b: Booking) => void }) {
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const filtered = useMemo(() =>
    bookings.filter(b => statusFilter === 'all' || b.status === statusFilter)
  , [bookings, statusFilter])

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={selectStyle}>
          <option value="all" style={{ background: NAV_BG }}>All statuses</option>
          <option value="confirmed" style={{ background: NAV_BG }}>Upcoming</option>
          <option value="pending" style={{ background: NAV_BG }}>Pending</option>
          {/* Session 29 — surfacing declined explicitly so the
              dispatcher can review which bookings they bounced. */}
          <option value="declined" style={{ background: NAV_BG }}>Declined</option>
          <option value="completed" style={{ background: NAV_BG }}>Completed</option>
          <option value="cancelled" style={{ background: NAV_BG }}>Cancelled</option>
        </select>
      </div>

      <div style={{ background: NAV_BG, border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, overflowX: 'auto' as const }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' as const, fontSize: 13 }}>
          <thead>
            <tr style={{ background: CARD_BG }}>
              {['Date / Time', 'Customer', 'Route', 'Truck', 'Driver', 'Source', 'Status'].map(h => (
                <th key={h} style={th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={7} style={{ padding: 32, color: TEXT_DIM, textAlign: 'center' as const }}>No jobs yet. Jobs booked by your agent or added manually will appear here.</td></tr>
            )}
            {filtered.map(b => {
              const driver = drivers.find(d => d.id === b.driver_id)
              const start = b.scheduled_start ? new Date(b.scheduled_start) : null
              const src = sourceColor(b)
              return (
                <tr key={b.id} onClick={() => onSelect(b)} style={{ cursor: 'pointer', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={td}>
                    {start ? (
                      <>
                        <div style={{ fontFamily: 'monospace', color: TEXT_DIM }}>{start.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}</div>
                        <div style={{ fontFamily: 'monospace', color: 'white', fontSize: 12 }}>{start.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true })}</div>
                      </>
                    ) : '—'}
                  </td>
                  <td style={td}>
                    <div style={{ color: 'white', fontWeight: 600 }}>{b.caller_name ?? '—'}</div>
                    <div style={{ color: TEXT_DIM, fontSize: 11 }}>{b.caller_phone ?? ''}</div>
                  </td>
                  <td style={td}>
                    <div style={{ color: TEXT_DIM, maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                      {(b.pickup_address ?? '—')} → {(b.dropoff_address ?? '—')}
                    </div>
                  </td>
                  <td style={td}>{truckLabel(b.truck_type)}</td>
                  <td style={td}>{driver?.name ?? '—'}</td>
                  <td style={td}><span style={{ ...badgePill, background: `${src.pill}1A`, color: src.pill, border: `1px solid ${src.pill}55` }}>{src.label}</span></td>
                  <td style={td}>
                    {(() => {
                      // Session 29 — status badge uses the dedicated
                      // palette so declined/pending/confirmed read
                      // correctly even when the source pill is orange.
                      const sb = statusBadgeColor(b.status)
                      return (
                        <span style={{ ...badgePill, background: sb.bg, color: sb.color, border: `1px solid ${sb.color}55`, textTransform: 'capitalize' as const }}>{b.status}</span>
                      )
                    })()}
                    {b.confirmation_ref && (
                      <div style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 10, color: TEXT_DIM, marginTop: 4 }}>REF: {b.confirmation_ref}</div>
                    )}
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

// ───────── settings tab ─────────

function SchedulerSettingsTab({ settings, onSave, plan, isTowing, smsLimit, smsUsed }: {
  settings: SchedulerSettings | null
  onSave: (next: SchedulerSettings) => Promise<void>
  plan: string
  isTowing: boolean
  smsLimit: number
  smsUsed: number
}) {
  const [local, setLocal] = useState<SchedulerSettings>(() => settings ?? {})
  const [holidays, setHolidays] = useState<Array<{ holiday_name: string; holiday_date: string; is_national: boolean }>>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => { setLocal(settings ?? {}) }, [settings])
  useEffect(() => {
    let cancelled = false
    async function load() {
      const res = await fetch('/api/portal/public-holidays')
      if (!cancelled && res.ok) {
        const d = await res.json()
        setHolidays(d.holidays ?? [])
      }
    }
    load()
    return () => { cancelled = true }
  }, [local.state])

  const operating = local.operating_hours ?? {
    monday:    { open: '08:00', close: '18:00', enabled: true },
    tuesday:   { open: '08:00', close: '18:00', enabled: true },
    wednesday: { open: '08:00', close: '18:00', enabled: true },
    thursday:  { open: '08:00', close: '18:00', enabled: true },
    friday:    { open: '08:00', close: '18:00', enabled: true },
    saturday:  { open: '09:00', close: '14:00', enabled: false },
    sunday:    { open: '09:00', close: '14:00', enabled: false },
  }

  function setOp(day: string, patch: Partial<OperatingDay>) {
    setLocal(s => ({
      ...s,
      operating_hours: { ...(s.operating_hours ?? operating), [day]: { ...(s.operating_hours?.[day] ?? operating[day as keyof typeof operating]), ...patch } },
    }))
  }

  async function handleSave() {
    setSaving(true)
    await onSave(local)
    setSaving(false)
  }

  const nextHoliday = holidays.find(h => new Date(h.holiday_date) >= new Date(new Date().setHours(0, 0, 0, 0)))
  const smsLocked = plan === 'starter'

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16 }}>
      <Card title="Operating hours" subtitle="Set when your agent will accept bookings each day of the week.">
        {nextHoliday && (
          <div style={holidayBanner}>
            <strong>Heads up:</strong> {nextHoliday.holiday_name} on {new Date(nextHoliday.holiday_date).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })}{nextHoliday.is_national ? ' (national)' : ''}.
            {' '}<a href="#" onClick={e => { e.preventDefault(); const next = local.overridden_holidays ?? []; setLocal(s => ({ ...s, overridden_holidays: [...next, nextHoliday.holiday_date] })) }} style={{ color: ORANGE, fontWeight: 700 }}>Override to open</a>
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 1fr auto', gap: 8, alignItems: 'center' }}>
          {['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map(day => {
            const cfg = (local.operating_hours?.[day] ?? operating[day as keyof typeof operating]) as OperatingDay
            return (
              <FragmentRow key={day}>
                <div style={{ fontSize: 13, color: 'white', textTransform: 'capitalize' as const }}>{day}</div>
                <input type="time" value={cfg.open ?? '08:00'} disabled={cfg.enabled === false} onChange={e => setOp(day, { open: e.target.value })} style={inputStyle} />
                <input type="time" value={cfg.close ?? '18:00'} disabled={cfg.enabled === false} onChange={e => setOp(day, { close: e.target.value })} style={inputStyle} />
                <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 12, color: TEXT_DIM }}>
                  <input type="checkbox" checked={cfg.enabled !== false} onChange={e => setOp(day, { enabled: e.target.checked })} />
                  Open
                </label>
              </FragmentRow>
            )
          })}
        </div>
      </Card>

      <Card title="Job settings" subtitle="Defaults applied to new bookings.">
        <Row>
          <FieldBlock label="Buffer between jobs">
            <select value={local.buffer_minutes ?? 30} onChange={e => setLocal(s => ({ ...s, buffer_minutes: Number(e.target.value) }))} style={selectStyle}>
              {[15, 30, 45, 60].map(v => <option key={v} value={v} style={{ background: NAV_BG }}>{v} min</option>)}
            </select>
          </FieldBlock>
          <FieldBlock label="Max concurrent jobs">
            <input type="number" min={1} value={local.max_concurrent_jobs ?? 1} onChange={e => setLocal(s => ({ ...s, max_concurrent_jobs: Number(e.target.value) }))} style={inputStyle} />
          </FieldBlock>
        </Row>
        {isTowing ? (
          <Row>
            <FieldBlock label="Default duration — Tilt Tray">
              <select value={local.default_duration_tilt_minutes ?? 120} onChange={e => setLocal(s => ({ ...s, default_duration_tilt_minutes: Number(e.target.value) }))} style={selectStyle}>
                {[60, 120, 180].map(v => <option key={v} value={v} style={{ background: NAV_BG }}>{v / 60} hr</option>)}
              </select>
            </FieldBlock>
            <FieldBlock label="Default duration — Sideloader">
              <select value={local.default_duration_sideloader_minutes ?? 180} onChange={e => setLocal(s => ({ ...s, default_duration_sideloader_minutes: Number(e.target.value) }))} style={selectStyle}>
                {[120, 180, 240].map(v => <option key={v} value={v} style={{ background: NAV_BG }}>{v / 60} hr</option>)}
              </select>
            </FieldBlock>
          </Row>
        ) : (
          <Row>
            <FieldBlock label="Default appointment duration">
              <select value={local.default_duration_minutes ?? 60} onChange={e => setLocal(s => ({ ...s, default_duration_minutes: Number(e.target.value) }))} style={selectStyle}>
                {[30, 45, 60, 90, 120].map(v => <option key={v} value={v} style={{ background: NAV_BG }}>{v} min</option>)}
              </select>
            </FieldBlock>
          </Row>
        )}
      </Card>

      <Card title="Confirmations and reminders" subtitle="Direct Twilio SMS. Plan limits apply.">
        {smsLocked ? (
          <div style={lockedBox}>SMS not available on Starter plan. Upgrade to Growth.</div>
        ) : (
          <>
            <ToggleRow label="SMS on booking confirmed" value={local.booking_confirmation_sms !== false} onChange={v => setLocal(s => ({ ...s, booking_confirmation_sms: v }))} />
            <ToggleRow label="Email on booking confirmed" value={local.booking_confirmation_email === true} onChange={v => setLocal(s => ({ ...s, booking_confirmation_email: v }))} />
            <ToggleRow label="24-hour reminder SMS" value={local.reminder_24h_enabled !== false} onChange={v => setLocal(s => ({ ...s, reminder_24h_enabled: v }))} />
            <ToggleRow label="2-hour reminder SMS" value={local.reminder_2h_enabled !== false} onChange={v => setLocal(s => ({ ...s, reminder_2h_enabled: v }))} />
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12, color: TEXT_DIM, marginBottom: 4 }}>{smsUsed} of {smsLimit} SMS used this month</div>
              <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 99, overflow: 'hidden' }}>
                <div style={{ width: `${Math.min(100, (smsUsed / Math.max(1, smsLimit)) * 100)}%`, height: '100%', background: smsUsed / Math.max(1, smsLimit) > 0.8 ? '#EF4444' : '#22C55E' }} />
              </div>
            </div>
          </>
        )}
      </Card>

      <Card title="Waitlist" subtitle="When fully booked, agent can add callers to a waitlist.">
        <ToggleRow label="Enable waitlist" value={local.waitlist_enabled === true} onChange={v => setLocal(s => ({ ...s, waitlist_enabled: v }))} />
        <ToggleRow label="Auto-notify next in line" value={local.waitlist_auto_notify !== false} onChange={v => setLocal(s => ({ ...s, waitlist_auto_notify: v }))} />
        <FieldBlock label="Claim window">
          <select value={local.waitlist_claim_window_minutes ?? 30} onChange={e => setLocal(s => ({ ...s, waitlist_claim_window_minutes: Number(e.target.value) }))} style={selectStyle}>
            {[15, 30, 60].map(v => <option key={v} value={v} style={{ background: NAV_BG }}>{v} min</option>)}
          </select>
        </FieldBlock>
      </Card>

      <Card title="Cancellation policy">
        <ToggleRow label="Enforce cancellation policy" value={local.cancellation_policy_enabled === true} onChange={v => setLocal(s => ({ ...s, cancellation_policy_enabled: v }))} />
        <Row>
          <FieldBlock label="Notice required">
            <select value={local.cancellation_notice_hours ?? 24} onChange={e => setLocal(s => ({ ...s, cancellation_notice_hours: Number(e.target.value) }))} style={selectStyle}>
              {[2, 24, 48].map(v => <option key={v} value={v} style={{ background: NAV_BG }}>{v} hours</option>)}
            </select>
          </FieldBlock>
          <FieldBlock label="Cancellation fee ($)">
            <input type="number" min={0} value={local.cancellation_fee_aud ?? 0} onChange={e => setLocal(s => ({ ...s, cancellation_fee_aud: Number(e.target.value) }))} style={inputStyle} />
          </FieldBlock>
        </Row>
      </Card>

      <Card title="Location and timezone">
        <Row>
          <FieldBlock label="State">
            <select value={local.state ?? 'VIC'} onChange={e => {
              const st = e.target.value
              const tz: Record<string, string> = { VIC: 'Australia/Melbourne', NSW: 'Australia/Sydney', ACT: 'Australia/Sydney', TAS: 'Australia/Hobart', QLD: 'Australia/Brisbane', WA: 'Australia/Perth', SA: 'Australia/Adelaide', NT: 'Australia/Darwin' }
              setLocal(s => ({ ...s, state: st, timezone: tz[st] ?? s.timezone }))
            }} style={selectStyle}>
              {['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'].map(s => <option key={s} value={s} style={{ background: NAV_BG }}>{s}</option>)}
            </select>
          </FieldBlock>
          <FieldBlock label="Timezone">
            <select value={local.timezone ?? 'Australia/Melbourne'} onChange={e => setLocal(s => ({ ...s, timezone: e.target.value }))} style={selectStyle}>
              {['Australia/Melbourne', 'Australia/Sydney', 'Australia/Brisbane', 'Australia/Adelaide', 'Australia/Perth', 'Australia/Hobart', 'Australia/Darwin'].map(tz => <option key={tz} value={tz} style={{ background: NAV_BG }}>{tz}</option>)}
            </select>
          </FieldBlock>
        </Row>
      </Card>

      <div>
        <button onClick={handleSave} disabled={saving} style={primaryBtn}>{saving ? 'Saving…' : 'Save and Sync Agent'}</button>
      </div>
    </div>
  )
}

// ───────── job detail modal ─────────

function JobDetailModal({ booking, drivers, baseUrl, onClose, onUpdated, isTowing }: {
  booking: Booking
  drivers: Driver[]
  baseUrl: string
  onClose: () => void
  onUpdated: () => void
  isTowing: boolean
}) {
  const color = sourceColor(booking)
  const start = booking.scheduled_start ? new Date(booking.scheduled_start) : null
  const end = booking.scheduled_end ? new Date(booking.scheduled_end) : null
  const driver = drivers.find(d => d.id === booking.driver_id)

  async function setStatus(next: Booking['status']) {
    const res = await fetch(`${baseUrl}/${booking.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    })
    if (res.ok) onUpdated()
  }

  // Session 29 — status pill uses the dedicated status palette so
  // pending/confirmed/declined are readable at a glance. Source
  // pill stays driven by sourceColor (Agent / Manual / Walk-in).
  const statusBg = statusBadgeColor(booking.status)
  return (
    <ModalShell onClose={onClose}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' as const }}>
        <span style={{ ...badgePill, background: statusBg.bg, color: statusBg.color, border: `1px solid ${statusBg.color}55`, textTransform: 'capitalize' as const }}>{booking.status}</span>
        <span style={{ ...badgePill, background: `${color.pill}1A`, color: color.pill, border: `1px solid ${color.pill}55` }}>{color.label}</span>
        {booking.confirmation_ref && (
          <span style={{ ...badgePill, background: 'rgba(74,159,232,0.12)', color: '#4A9FE8', border: '1px solid rgba(74,159,232,0.4)', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
            REF: {booking.confirmation_ref}
          </span>
        )}
      </div>
      <h2 style={{ fontSize: 18, fontWeight: 800, color: 'white', margin: 0 }}>{booking.caller_name ?? 'Job'}{booking.truck_type ? ` — ${truckLabel(booking.truck_type)}` : ''}</h2>
      <div style={{ fontSize: 12, color: TEXT_DIM, marginBottom: 16 }}>
        {start ? start.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'short' }) : ''}
        {start && end ? ` · ${start.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true })} — ${end.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true })}` : ''}
        {driver ? ` · ${driver.name}` : ''}
      </div>

      <Section title="Description">
        <div style={infoBoxStyle}>{booking.description ?? 'No description added.'}</div>
      </Section>

      <Section title="Route">
        <div style={routeBoxStyle}>
          <RoutePoint color="#FB923C" address={booking.pickup_address} contactName={booking.pickup_contact_name} contactPhone={booking.pickup_contact_phone} />
          <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '10px 0' }} />
          <RoutePoint color="#22C55E" address={booking.dropoff_address} contactName={booking.dropoff_contact_name} contactPhone={booking.dropoff_contact_phone} />
          <div style={{ marginTop: 10, fontSize: 11, color: TEXT_DIM, display: 'flex', gap: 14, flexWrap: 'wrap' as const }}>
            {booking.distance_km != null && <span>{booking.distance_km}km</span>}
            {booking.duration_minutes != null && <span>{booking.duration_minutes} min</span>}
            {booking.truck_type && <span>{truckLabel(booking.truck_type)}</span>}
            {booking.rate_type && <span style={{ textTransform: 'capitalize' as const }}>{booking.rate_type}</span>}
          </div>
        </div>
      </Section>

      <Section title="Details">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <DetailField label="Truck type" value={truckLabel(booking.truck_type)} />
          <DetailField label="Driver" value={driver?.name ?? '—'} />
          <DetailField label="Rate" value={booking.rate_type ? (booking.rate_type === 'account' ? 'Account' : 'Retail') : '—'} />
          <DetailField label="Booked at" value={new Date(booking.created_at).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true })} />
          {booking.estimated_value != null && (
            <DetailField label="Estimated value" value={`$${booking.estimated_value}`} />
          )}
        </div>
      </Section>

      {booking.booking_source === 'agent' && (
        <div style={agentBanner}>
          Booked by agent on {new Date(booking.created_at).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true })}. {booking.sms_confirmation_sent ? 'SMS confirmation sent.' : ''}
        </div>
      )}

      {/* Session 29 — Hayden SMS confirmation loop trail. Only renders
          if at least one of the loop timestamps was set. */}
      {(booking.dispatcher_notified_at || booking.reminder_sent_at || booking.confirmed_at) && (
        <Section title="Confirmation loop">
          <div style={{ ...infoBoxStyle, fontSize: 12, lineHeight: 1.7 }}>
            {booking.dispatcher_notified_at && (
              <div>Dispatcher notified · {new Date(booking.dispatcher_notified_at).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true })}</div>
            )}
            {booking.reminder_sent_at && (
              <div>Reminder sent · {new Date(booking.reminder_sent_at).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true })}</div>
            )}
            {booking.confirmed_at && (
              <div>
                {booking.status === 'declined' ? 'Declined' : 'Confirmed'} · {new Date(booking.confirmed_at).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true })}
                {booking.confirmed_by_phone ? ` · by ${booking.confirmed_by_phone}` : ''}
              </div>
            )}
          </div>
        </Section>
      )}

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20, flexWrap: 'wrap' as const }}>
        <button onClick={onClose} style={ghostBtn}>Close</button>
        {booking.status !== 'completed' && booking.status !== 'cancelled' && (
          <>
            <button onClick={() => setStatus('completed')} style={primaryBtnGreen}>Mark complete</button>
            <button onClick={() => { if (confirm('Cancel this job? A cancellation SMS will be sent if enabled.')) setStatus('cancelled') }} style={dangerBtn}>Cancel job</button>
          </>
        )}
      </div>
    </ModalShell>
  )
}

function RoutePoint({ color, address, contactName, contactPhone }: { color: string; address: string | null; contactName: string | null; contactPhone: string | null }) {
  return (
    <div style={{ display: 'flex', gap: 10 }}>
      <span style={{ width: 12, height: 12, borderRadius: 99, background: color, marginTop: 4, flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <div style={{ color: 'white', fontWeight: 600 }}>{address ?? '—'}</div>
        {(contactName || contactPhone) && (
          <div style={{ fontSize: 12, color: TEXT_DIM, marginTop: 4 }}>
            {contactName ?? ''}{contactName && contactPhone ? ' · ' : ''}{contactPhone ?? ''}
          </div>
        )}
      </div>
    </div>
  )
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, color: TEXT_DIM, textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 13, color: 'white' }}>{value || '—'}</div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: TEXT_DIM, textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  )
}

// ───────── add job modal ─────────

function AddJobModal({ baseUrl, drivers, settings, initialStart, initialDriverId, isTowing, onClose, onSaved }: {
  baseUrl: string
  drivers: Driver[]
  settings: SchedulerSettings | null
  initialStart?: string
  initialDriverId?: string
  isTowing: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const initialDate = initialStart ? new Date(initialStart) : new Date()
  const initialTime = initialDate.toTimeString().slice(0, 5)
  const dateStr = initialDate.toISOString().slice(0, 10)

  const [callerName, setCallerName] = useState('')
  const [callerPhone, setCallerPhone] = useState('')
  const [description, setDescription] = useState('')
  const [truckType, setTruckType] = useState('')
  const [rateType, setRateType] = useState('')
  const [pickup, setPickup] = useState('')
  const [pickupName, setPickupName] = useState('')
  const [pickupPhone, setPickupPhone] = useState('')
  const [dropoff, setDropoff] = useState('')
  const [dropoffName, setDropoffName] = useState('')
  const [dropoffPhone, setDropoffPhone] = useState('')
  const [date, setDate] = useState(dateStr)
  const [time, setTime] = useState(initialTime)
  const [duration, setDuration] = useState(settings?.default_duration_tilt_minutes ?? 120)
  const [driverId, setDriverId] = useState(initialDriverId ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function save() {
    setBusy(true); setErr(null)
    try {
      const start = new Date(`${date}T${time}:00`)
      const end = new Date(start.getTime() + duration * 60_000)
      const payload: Record<string, unknown> = {
        caller_name: callerName || null,
        caller_phone: callerPhone || null,
        description: description || null,
        truck_type: truckType || null,
        rate_type: rateType || null,
        pickup_address: pickup || null,
        pickup_contact_name: pickupName || null,
        pickup_contact_phone: pickupPhone || null,
        dropoff_address: dropoff || null,
        dropoff_contact_name: dropoffName || null,
        dropoff_contact_phone: dropoffPhone || null,
        driver_id: driverId || null,
        scheduled_start: start.toISOString(),
        scheduled_end: end.toISOString(),
        booking_source: 'manual',
      }
      const res = await fetch(baseUrl, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Save failed')
      onSaved()
    } catch (e) { setErr((e as Error).message); setBusy(false) }
  }

  return (
    <ModalShell onClose={onClose}>
      <h2 style={{ fontSize: 18, fontWeight: 800, color: 'white', margin: 0, marginBottom: 16 }}>Add job</h2>

      <Section title="Customer">
        <Row>
          <FieldBlock label="Caller name"><input value={callerName} onChange={e => setCallerName(e.target.value)} style={inputStyle} /></FieldBlock>
          <FieldBlock label="Caller phone"><input value={callerPhone} onChange={e => setCallerPhone(e.target.value)} style={inputStyle} placeholder="0412 345 678" /></FieldBlock>
        </Row>
        <FieldBlock label="Description">
          <textarea rows={3} value={description} onChange={e => setDescription(e.target.value)} style={{ ...inputStyle, resize: 'vertical' as const }} placeholder="e.g. Vehicle broken down on highway, keys with customer, waiting on site" />
        </FieldBlock>
      </Section>

      {isTowing && (
        <Section title="Towing details">
          <Row>
            <FieldBlock label="Truck type">
              <select value={truckType} onChange={e => setTruckType(e.target.value)} style={selectStyle}>
                <option value="" style={{ background: NAV_BG }}>—</option>
                <option value="loaded_tilt_tray" style={{ background: NAV_BG }}>Loaded Tilt Tray</option>
                <option value="empty_tilt_tray" style={{ background: NAV_BG }}>Empty Tilt Tray</option>
                <option value="sideloader_40ft" style={{ background: NAV_BG }}>Sideloader 40ft</option>
              </select>
            </FieldBlock>
            <FieldBlock label="Rate">
              <select value={rateType} onChange={e => setRateType(e.target.value)} style={selectStyle}>
                <option value="" style={{ background: NAV_BG }}>—</option>
                <option value="account" style={{ background: NAV_BG }}>Account / Trade</option>
                <option value="retail" style={{ background: NAV_BG }}>Retail / Private</option>
              </select>
            </FieldBlock>
          </Row>
        </Section>
      )}

      <Section title="Pickup">
        <FieldBlock label="Pickup address"><input value={pickup} onChange={e => setPickup(e.target.value)} style={inputStyle} /></FieldBlock>
        <Row>
          <FieldBlock label="Contact name"><input value={pickupName} onChange={e => setPickupName(e.target.value)} style={inputStyle} /></FieldBlock>
          <FieldBlock label="Contact phone"><input value={pickupPhone} onChange={e => setPickupPhone(e.target.value)} style={inputStyle} /></FieldBlock>
        </Row>
      </Section>

      <Section title="Dropoff">
        <FieldBlock label="Dropoff address"><input value={dropoff} onChange={e => setDropoff(e.target.value)} style={inputStyle} /></FieldBlock>
        <Row>
          <FieldBlock label="Contact name"><input value={dropoffName} onChange={e => setDropoffName(e.target.value)} style={inputStyle} /></FieldBlock>
          <FieldBlock label="Contact phone"><input value={dropoffPhone} onChange={e => setDropoffPhone(e.target.value)} style={inputStyle} /></FieldBlock>
        </Row>
      </Section>

      <Section title="Schedule">
        <Row>
          <FieldBlock label="Date"><input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} /></FieldBlock>
          <FieldBlock label="Time"><input type="time" value={time} onChange={e => setTime(e.target.value)} style={inputStyle} /></FieldBlock>
        </Row>
        <Row>
          <FieldBlock label="Estimated duration">
            <select value={duration} onChange={e => setDuration(Number(e.target.value))} style={selectStyle}>
              {[60, 120, 180, 240].map(v => <option key={v} value={v} style={{ background: NAV_BG }}>{v / 60} hour{v > 60 ? 's' : ''}</option>)}
            </select>
          </FieldBlock>
          <FieldBlock label="Driver">
            <select value={driverId} onChange={e => setDriverId(e.target.value)} style={selectStyle}>
              <option value="" style={{ background: NAV_BG }}>Auto-assign (next available)</option>
              {drivers.map(d => <option key={d.id} value={d.id} style={{ background: NAV_BG }}>{d.name}</option>)}
            </select>
          </FieldBlock>
        </Row>
      </Section>

      {err && <div style={errorBoxStyle}>{err}</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
        <button onClick={onClose} style={ghostBtn}>Cancel</button>
        <button onClick={save} disabled={busy} style={primaryBtn}>{busy ? 'Saving…' : 'Save job'}</button>
      </div>
    </ModalShell>
  )
}

// ───────── small atoms ─────────

function ModalShell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div onClick={onClose} style={{
      position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center' as const, justifyContent: 'center' as const, zIndex: 200, padding: 20,
      fontFamily: 'Outfit, sans-serif',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: NAV_BG, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16,
        padding: 26, maxWidth: 720, width: '100%', maxHeight: '92vh', overflowY: 'auto' as const,
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
      }}>{children}</div>
    </div>
  )
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div style={{ background: NAV_BG, border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: 20 }}>
      <div style={{ marginBottom: 14 }}>
        <h3 style={{ fontSize: 14, fontWeight: 800, color: 'white', margin: 0 }}>{title}</h3>
        {subtitle && <div style={{ fontSize: 12, color: TEXT_DIM, marginTop: 4 }}>{subtitle}</div>}
      </div>
      {children}
    </div>
  )
}

function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 10 }}>{children}</div>
}

function FragmentRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

function FieldBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', marginBottom: 8 }}>
      <span style={{ display: 'block', fontSize: 11, fontWeight: 700, color: TEXT_DIM, textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 6 }}>{label}</span>
      {children}
    </label>
  )
}

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center' as const, justifyContent: 'space-between' as const, padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer' }}>
      <span style={{ fontSize: 13, color: 'white' }}>{label}</span>
      <input type="checkbox" checked={value} onChange={e => onChange(e.target.checked)} />
    </label>
  )
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      padding: '10px 18px', borderRadius: 9, fontSize: 13, fontWeight: 700,
      background: active ? 'white' : 'transparent', color: active ? '#061322' : TEXT_DIM,
      border: 'none', cursor: 'pointer', fontFamily: 'Outfit, sans-serif',
    }}>{children}</button>
  )
}

const tabBarStyle: React.CSSProperties = {
  display: 'flex', gap: 4, padding: 4, background: 'rgba(255,255,255,0.04)',
  borderRadius: 12, width: 'fit-content', marginBottom: 22,
}
const cellHeader: React.CSSProperties = {
  padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)',
  borderRight: '1px solid rgba(255,255,255,0.04)', fontSize: 11, color: TEXT_DIM,
  textAlign: 'left' as const,
}
const timeLabel: React.CSSProperties = {
  padding: '4px 6px', borderTop: '1px solid rgba(255,255,255,0.04)',
  borderRight: '1px solid rgba(255,255,255,0.06)', fontSize: 10, color: TEXT_DIM,
  textAlign: 'right' as const,
}
const inputStyle: React.CSSProperties = {
  background: CARD_BG, border: '1px solid rgba(255,255,255,0.1)', color: 'white',
  borderRadius: 9, padding: '9px 12px', fontSize: 13, width: '100%',
  fontFamily: 'Outfit, sans-serif', outline: 'none', boxSizing: 'border-box' as const,
}
const selectStyle: React.CSSProperties = {
  background: CARD_BG, border: '1px solid rgba(255,255,255,0.1)', color: 'white',
  borderRadius: 9, padding: '9px 12px', fontSize: 13, width: '100%',
  fontFamily: 'Outfit, sans-serif', cursor: 'pointer', boxSizing: 'border-box' as const,
}
const primaryBtn: React.CSSProperties = {
  padding: '10px 18px', borderRadius: 9, fontSize: 13, fontWeight: 700,
  background: ORANGE, color: 'white', border: 'none', cursor: 'pointer', fontFamily: 'Outfit, sans-serif',
}
const primaryBtnGreen: React.CSSProperties = { ...primaryBtn, background: '#22C55E' }
const primaryBtnSmall: React.CSSProperties = { ...primaryBtn, padding: '6px 12px', fontSize: 12, borderRadius: 0 }
const ghostBtn: React.CSSProperties = {
  padding: '8px 14px', borderRadius: 9, fontSize: 12, fontWeight: 600,
  background: 'transparent', border: '1px solid rgba(255,255,255,0.15)',
  color: TEXT_DIM, cursor: 'pointer', fontFamily: 'Outfit, sans-serif',
}
const ghostBtnFlat: React.CSSProperties = { ...ghostBtn, borderRadius: 0, border: 'none', borderRight: '1px solid rgba(255,255,255,0.06)' }
const dangerBtn: React.CSSProperties = {
  padding: '10px 18px', borderRadius: 9, fontSize: 13, fontWeight: 700,
  background: 'rgba(239,68,68,0.12)', color: '#EF4444',
  border: '1px solid rgba(239,68,68,0.3)', cursor: 'pointer', fontFamily: 'Outfit, sans-serif',
}
const iconNav: React.CSSProperties = {
  width: 36, height: 36, borderRadius: 9, background: NAV_BG,
  border: '1px solid rgba(255,255,255,0.08)', color: 'white', cursor: 'pointer', fontSize: 16, fontWeight: 700,
}
const th: React.CSSProperties = {
  textAlign: 'left' as const, padding: '11px 14px',
  fontSize: 11, fontWeight: 700, color: TEXT_DIM,
  textTransform: 'uppercase' as const, letterSpacing: '0.06em',
}
const td: React.CSSProperties = { padding: '12px 14px', fontSize: 13, color: '#C8D8EA' }
const badgePill: React.CSSProperties = {
  display: 'inline-block', padding: '3px 10px', borderRadius: 99,
  fontSize: 11, fontWeight: 700,
}
const infoBoxStyle: React.CSSProperties = {
  background: CARD_BG, border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10,
  padding: 12, fontSize: 13, color: 'white',
}
const routeBoxStyle: React.CSSProperties = {
  background: CARD_BG, border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10,
  padding: 14, fontSize: 13,
}
const agentBanner: React.CSSProperties = {
  background: 'rgba(232,98,42,0.08)', border: '1px solid rgba(232,98,42,0.3)',
  color: ORANGE, fontSize: 12, padding: '10px 12px', borderRadius: 10, marginBottom: 8,
}
const lockedBox: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)', border: '1px dashed rgba(255,255,255,0.1)',
  borderRadius: 10, padding: 14, color: TEXT_DIM, fontSize: 13,
}
const errorBoxStyle: React.CSSProperties = {
  marginTop: 10, padding: '10px 14px', borderRadius: 9,
  background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.35)',
  color: '#FCA5A5', fontSize: 13,
}
const holidayBanner: React.CSSProperties = {
  background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.3)',
  color: '#22C55E', fontSize: 13, padding: '10px 12px', borderRadius: 10, marginBottom: 14,
}
const toastStyle: React.CSSProperties = {
  position: 'fixed' as const, bottom: 24, right: 24, zIndex: 100,
  padding: '12px 18px', background: NAV_BG,
  border: '1px solid rgba(34,197,94,0.4)', borderRadius: 10,
  color: '#22C55E', fontSize: 13, fontWeight: 600,
  boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
}
