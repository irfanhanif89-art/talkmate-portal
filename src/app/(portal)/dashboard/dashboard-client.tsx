'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

// ui-v2 design-system components
import { Panel, PanelHeader } from '@/components/portal/ui-v2/panel'
import { KpiCard } from '@/components/portal/ui-v2/kpi-card'
import { SegmentedControl } from '@/components/portal/ui-v2/segmented-control'
import { RevenueStrip } from '@/components/portal/ui-v2/revenue-strip'
import { UpsellBanner } from '@/components/portal/ui-v2/upsell-banner'
import { StatusCard } from '@/components/portal/ui-v2/status-card'
import { CallRow } from '@/components/portal/ui-v2/call-row'
import FeaturePrompts from '@/components/portal/feature-prompts'
import { BookingRow } from '@/components/portal/ui-v2/booking-row'
import { VolumeBarChart } from '@/components/portal/ui-v2/charts'
import type { TagVariant } from '@/components/portal/ui-v2/tag'

// ─── Types ────────────────────────────────────────────────────────────────────

interface TodayBooking {
  id: string
  caller_name: string | null
  scheduled_start: string | null
  truck_type: string | null
  pickup_address: string | null
  status: string
}

interface Call {
  id: string
  caller_number: string | null
  outcome: string | null
  duration_seconds: number | null
  created_at: string
  transferred: boolean
}

interface Business {
  id: string
  name: string
  onboarding_completed: boolean
  business_type: string
  plan: string
  agent_name?: string | null
  talkmate_number?: string | null
}

interface Props {
  business: Business
  stats: { totalMonth: number; aiResolutionRate: number; transferredMonth: number; missedMonth: number }
  bookingsThisMonth?: number
  aiScoreAvg?: number | null
  afterHoursCount?: number
  outcomes: { resolved: number; transferred: number; missed: number; total: number }
  chartData: { date: string; count: number }[]
  todayHourly?: { label: string; count: number }[]
  recentCalls: Call[]
  businessName?: string
  callsAnsweredToday?: number
  revenueRecoveredThisMonth?: number
  vsLastMonthPercent?: number
  revenueIsEstimate?: boolean
  revenueProtected: number
  benchmarkLabel: string
  payingForItself: boolean
  planMonthlyPrice: number
  planLimit: number | null
  daysActive: number
  daysSinceSignup: number
  onboardingSteps: Array<{ key: string; label: string; done: boolean; href: string }>
  needsNps: 'day30' | 'day90' | null
  partner: { referral_link?: string; active_referrals?: number; pending_payout?: number } | null
  pendingLegalAcceptances?: number
  contactsThisMonth?: number
  crmHealthPct?: number
  crmHealthHasContacts?: boolean
  todayBookings?: TodayBooking[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function fmt(s: number | null): string {
  if (!s) return '—'
  return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`
}

function callTag(outcome: string | null, transferred: boolean): { variant: TagVariant; label: string } {
  if (!outcome || outcome === 'Missed') return { variant: 'missed', label: 'Missed' }
  if (transferred) return { variant: 'transfer', label: 'Transferred' }
  const o = outcome.toLowerCase()
  if (o.includes('book')) return { variant: 'book', label: 'Booked' }
  if (o.includes('quote')) return { variant: 'quote', label: 'Quote' }
  if (o === 'faq') return { variant: 'question', label: 'FAQ' }
  return { variant: 'book', label: 'Resolved' }
}

/** Convert the daily `chartData` array (last `days` entries) into VolumeBarChart format. */
function toVolumeData(
  chartData: { date: string; count: number }[],
  days: number,
): { label: string; handled: number; escalated: number }[] {
  return chartData.slice(-days).map(d => ({
    label: new Date(d.date + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }),
    handled: d.count,
    escalated: 0,
  }))
}

function PhoneIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 15a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 4.23h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 11a16 16 0 0 0 6 6l.92-.92a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  )
}

function CalendarIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  )
}

function CheckIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><path d="M22 4L12 14.01l-3-3" />
    </svg>
  )
}

function TrendIcon({ dir }: { dir: 'up' | 'down' | 'flat' }) {
  if (dir === 'up') return <span className="text-green text-[11px]">↑</span>
  if (dir === 'down') return <span className="text-red text-[11px]">↓</span>
  return <span className="text-faint text-[11px]">→</span>
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DashboardClient({
  business,
  stats,
  bookingsThisMonth = 0,
  aiScoreAvg = null,
  afterHoursCount = 0,
  chartData,
  todayHourly = [],
  recentCalls: initialCalls,
  callsAnsweredToday = 0,
  revenueRecoveredThisMonth = 0,
  vsLastMonthPercent = 0,
  revenueIsEstimate = false,
  planLimit,
  daysSinceSignup,
  todayBookings = [],
}: Props) {
  const supabase = createClient()
  const router = useRouter()
  const [liveCalls, setLiveCalls] = useState<Call[]>(initialCalls)
  const [chartRange, setChartRange] = useState<'today' | '7d' | '30d'>('today')

  // Live call feed via Supabase realtime
  useEffect(() => {
    const channel = supabase
      .channel('calls-live')
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'calls',
        filter: `business_id=eq.${business.id}`,
      }, payload => {
        setLiveCalls(prev => [payload.new as Call, ...prev].slice(0, 5))
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [business.id, supabase])

  // Derived values
  const noData = stats.totalMonth === 0
  const answerRate = stats.totalMonth > 0
    ? Math.round(((stats.totalMonth - stats.missedMonth) / stats.totalMonth) * 100)
    : 100
  const vsLastMonthDir: 'up' | 'down' | 'flat' =
    vsLastMonthPercent > 0 ? 'up' : vsLastMonthPercent < 0 ? 'down' : 'flat'
  const aiRateAccent: 'green' | 'orange' | undefined =
    noData ? undefined : stats.aiResolutionRate >= 80 ? 'green' : undefined

  // Revenue strip (matches the design: 4 metrics + a "See full report" CTA tile)
  const revenueStripItems = [
    {
      value: (
        <span className="tnum text-orange">
          ${revenueRecoveredThisMonth.toLocaleString()}
        </span>
      ),
      label: 'Revenue recovered',
      sub: revenueIsEstimate ? 'est. job value this month' : 'job value this month',
    },
    {
      value: <span className="tnum text-blue">{callsAnsweredToday}</span>,
      label: 'Answered today',
      sub: noData ? 'agent is live' : `${answerRate}% answer rate`,
    },
    {
      value: <span className="tnum text-green">+23%</span>,
      label: 'Avg order lift',
      sub: 'vs calls without AI',
    },
    {
      value: <span className="text-faint">—</span>,
      label: 'Google rating',
      sub: 'connect in Settings',
    },
  ]

  // Status card rows (per design §5.5)
  const statusRows = [
    { label: 'Avg. pickup time', value: <span className="tnum">&lt; 2s</span> },
    { label: 'After-hours calls', value: <span className="tnum">{afterHoursCount} handled</span> },
    { label: 'Voice', value: `${business.agent_name || 'Ava'} · AU English` },
    { label: 'AI score avg', value: aiScoreAvg != null ? <span className="text-green tnum">{aiScoreAvg.toFixed(1)} / 10</span> : <span className="text-faint">—</span> },
  ]

  const volumeData = chartRange === 'today'
    ? todayHourly.map(h => ({ label: h.label, handled: h.count, escalated: 0 }))
    : toVolumeData(chartData, chartRange === '7d' ? 7 : 30)
  const showUpsell = business.plan === 'starter' && daysSinceSignup >= 14

  return (
    <div
      className="flex flex-col gap-4 p-6 lg:p-7"
      style={{
        background: 'radial-gradient(1200px 700px at 78% -8%,rgba(238,106,44,.10),transparent 60%),radial-gradient(1000px 800px at 12% 110%,rgba(53,201,138,.06),transparent 55%),var(--bg)',
        minHeight: '100%',
      }}
    >
      {/* ── Revenue strip ─────────────────────────────────────────────── */}
      <RevenueStrip
        items={revenueStripItems}
        cta={{ title: 'See full report', subtitle: 'Analytics →', onClick: () => router.push('/analytics') }}
      />

      {/* ── Feature-discovery prompts (Session 4B) ────────────────────── */}
      <FeaturePrompts />

      {/* ── 4 KPI cards ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard
          label="Calls this month"
          icon={<PhoneIcon />}
          value={<span className="tnum">{stats.totalMonth}</span>}
          sub={<><TrendIcon dir={vsLastMonthDir} /><span>{Math.abs(vsLastMonthPercent)}% vs last month</span></>}
          ctxTrend={vsLastMonthDir === 'flat' ? 'neutral' : vsLastMonthDir}
        />
        <KpiCard
          label="Missed calls"
          value={<span className="tnum">{stats.missedMonth}</span>}
          sub={<span>{noData ? 'No calls yet' : stats.missedMonth === 0 ? 'Every call answered' : 'this month'}</span>}
          accent={stats.missedMonth === 0 && !noData ? 'green' : undefined}
          ctx={noData ? undefined : stats.missedMonth === 0 ? '100% answer rate' : undefined}
          ctxTrend={stats.missedMonth === 0 ? 'up' : 'down'}
        />
        <KpiCard
          label="Bookings captured"
          icon={<CalendarIcon />}
          value={<span className="tnum">{bookingsThisMonth}</span>}
          sub={<span className="text-green font-bold">${revenueRecoveredThisMonth.toLocaleString()} est. value</span>}
          accent="orange"
        />
        <KpiCard
          label="AI resolution rate"
          icon={<CheckIcon />}
          value={<span className="tnum">{noData ? '—' : `${stats.aiResolutionRate}%`}</span>}
          sub={<span>handled without transfer</span>}
          accent={aiRateAccent}
          ctx={noData ? undefined : stats.aiResolutionRate >= 80 ? 'Above 77% benchmark' : 'Below benchmark'}
          ctxTrend={stats.aiResolutionRate >= 80 ? 'up' : 'down'}
        />
      </div>

      {/* ── Upsell banner (Starter plan only) ─────────────────────────── */}
      {showUpsell && (
        <UpsellBanner
          title="Unlock Growth features — Command Centre, SMS follow-ups & more"
          subtitle={planLimit != null && stats.totalMonth >= planLimit * 0.8
            ? `You're at ${stats.totalMonth} of ${planLimit} calls — consider upgrading.`
            : 'Run your business by texting your AI agent.'}
          ctaLabel="Upgrade now"
          onCta={() => router.push('/billing')}
        />
      )}

      {/* ── Main grid: left (chart + calls) · right (status + bookings) ─ */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_370px]">

        {/* ── LEFT COLUMN ─────────────────────────────────────────────── */}
        <div className="flex flex-col gap-4">

          {/* Call volume panel */}
          <Panel>
            <PanelHeader
              title="Call volume"
              action={
                <SegmentedControl
                  options={[{ value: 'today', label: 'Today' }, { value: '7d', label: '7 days' }, { value: '30d', label: '30 days' }]}
                  value={chartRange}
                  onChange={setChartRange}
                />
              }
            />
            {noData ? (
              <div className="flex h-[148px] items-center justify-center text-[13px] text-dim">
                No calls yet — your agent is live and waiting
              </div>
            ) : (
              <VolumeBarChart data={volumeData} height={148} />
            )}
            <div className="mt-3 flex items-center gap-4">
              <span className="flex items-center gap-1.5 text-[11px] text-dim">
                <span className="inline-block h-2 w-2 rounded-[2px]" style={{ background: 'linear-gradient(180deg,#f4843f,#e85f24)' }} />
                Handled by AI
              </span>
              <span className="flex items-center gap-1.5 text-[11px] text-dim">
                <span className="inline-block h-2 w-2 rounded-[2px] bg-red" />
                Escalated to you
              </span>
            </div>
          </Panel>

          {/* Recent calls panel */}
          <Panel>
            <PanelHeader
              title="Recent calls"
              action={
                <button
                  onClick={() => router.push('/calls')}
                  className="text-[12px] font-semibold text-orange hover:opacity-80 transition-opacity cursor-pointer"
                >
                  View all →
                </button>
              }
            />
            {liveCalls.length === 0 ? (
              <div className="flex h-[80px] items-center justify-center text-[13px] text-dim">
                No calls yet — your agent is live and waiting
              </div>
            ) : (
              <div>
                {liveCalls.map(c => (
                  <CallRow
                    key={c.id}
                    time={timeAgo(c.created_at)}
                    who={c.caller_number || 'Unknown caller'}
                    desc={c.outcome || 'In progress'}
                    score={undefined}
                    tag={callTag(c.outcome, c.transferred)}
                    duration={fmt(c.duration_seconds)}
                    onPlay={() => router.push('/calls')}
                  />
                ))}
              </div>
            )}
          </Panel>
        </div>

        {/* ── RIGHT COLUMN ────────────────────────────────────────────── */}
        <div className="flex flex-col gap-4">

          {/* Receptionist on duty */}
          <StatusCard
            title={business.agent_name ? `${business.agent_name} on duty` : 'Receptionist on duty'}
            rows={statusRows}
          />

          {/* Today's bookings */}
          <Panel>
            <PanelHeader
              title="Today's bookings"
              meta={`${todayBookings.length} job${todayBookings.length !== 1 ? 's' : ''}`}
            />
            {todayBookings.length === 0 ? (
              <div className="flex h-[80px] items-center justify-center text-[13px] text-dim">
                No bookings scheduled today
              </div>
            ) : (
              <div>
                {todayBookings.map(b => {
                  const d = b.scheduled_start ? new Date(b.scheduled_start) : null
                  const timeStr = d ? d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true }) : '—'
                  const [timePart, meridiem] = timeStr.includes(' ') ? timeStr.split(' ') : [timeStr, '']
                  const truckLabel = b.truck_type
                    ? b.truck_type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
                    : 'Booking'
                  return (
                    <BookingRow
                      key={b.id}
                      time={timePart}
                      meridiem={meridiem}
                      job={truckLabel}
                      customer={b.caller_name ?? (b.pickup_address ?? 'Unknown')}
                      value={b.status.charAt(0).toUpperCase() + b.status.slice(1)}
                    />
                  )
                })}
              </div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  )
}
