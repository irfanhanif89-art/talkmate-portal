'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import OnboardingChecklist from '@/components/portal/onboarding-checklist'
import RetroactiveTCBanner from '@/components/portal/retroactive-tc-banner'
import NpsModal from '@/components/portal/nps-modal'
import SocialProofToaster from '@/components/portal/social-proof-toaster'
import ShareYourWin from '@/components/portal/share-win'
import TrialProgressCard from '@/components/portal/trial-progress-card'
import RoiSection from './roi-section'

// ui-v2 design-system components
import { Panel, PanelHeader } from '@/components/portal/ui-v2/panel'
import { KpiCard } from '@/components/portal/ui-v2/kpi-card'
import { SegmentedControl } from '@/components/portal/ui-v2/segmented-control'
import { RevenueStrip } from '@/components/portal/ui-v2/revenue-strip'
import { UpsellBanner } from '@/components/portal/ui-v2/upsell-banner'
import { StatusCard } from '@/components/portal/ui-v2/status-card'
import { CallRow } from '@/components/portal/ui-v2/call-row'
import { BookingRow } from '@/components/portal/ui-v2/booking-row'
import { VolumeBarChart } from '@/components/portal/ui-v2/charts'
import { Tag } from '@/components/portal/ui-v2/tag'
import type { TagVariant } from '@/components/portal/ui-v2/tag'

import { INDUSTRY_AVG_UPSELL_PER_CALL } from '@/lib/dashboard-defaults'

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
  outcomes: { resolved: number; transferred: number; missed: number; total: number }
  chartData: { date: string; count: number }[]
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

/** Convert the 14-day `chartData` array into VolumeBarChart format.
 *  We only have total count per day from the server; we approximate
 *  escalated = missed calls are unknown at this granularity, so escalated = 0. */
function toVolumeData(
  chartData: { date: string; count: number }[],
  range: '7d' | '14d',
): { label: string; handled: number; escalated: number }[] {
  const slice = range === '7d' ? chartData.slice(-7) : chartData
  return slice.map(d => ({
    label: new Date(d.date + 'T00:00:00').toLocaleDateString('en-AU', {
      day: 'numeric',
      month: 'short',
    }),
    handled: d.count,
    escalated: 0, // daily escalated not available in props — would need separate query
  }))
}

// ─── Icons (inline SVGs, no extra deps) ───────────────────────────────────────

function PhoneIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 15a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 4.23h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 11a16 16 0 0 0 6 6l.92-.92a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  )
}

function TrendIcon({ dir }: { dir: 'up' | 'down' | 'flat' }) {
  if (dir === 'up') return <span className="text-green text-[11px]">↑</span>
  if (dir === 'down') return <span className="text-red text-[11px]">↓</span>
  return <span className="text-white/30 text-[11px]">→</span>
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DashboardClient({
  business,
  stats,
  outcomes,
  chartData,
  recentCalls: initialCalls,
  businessName,
  callsAnsweredToday = 0,
  revenueRecoveredThisMonth = 0,
  vsLastMonthPercent = 0,
  revenueIsEstimate = false,
  planLimit,
  daysSinceSignup,
  onboardingSteps,
  needsNps,
  partner,
  pendingLegalAcceptances = 0,
  contactsThisMonth = 0,
  todayBookings = [],
}: Props) {
  const supabase = createClient()
  const router = useRouter()
  const [liveCalls, setLiveCalls] = useState<Call[]>(initialCalls)
  const [npsOpen, setNpsOpen] = useState(false)
  const [npsClosed, setNpsClosed] = useState(false)
  const [chartRange, setChartRange] = useState<'7d' | '14d'>('14d')

  // NPS trigger
  useEffect(() => {
    if (needsNps && !npsClosed) {
      const t = setTimeout(() => setNpsOpen(true), 800)
      return () => clearTimeout(t)
    }
  }, [needsNps, npsClosed])

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

  async function submitNps(score: number) {
    const res = await fetch('/api/nps', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ score, trigger: needsNps }),
    })
    const data = await res.json().catch(() => ({}))
    setNpsOpen(false)
    setNpsClosed(true)
    if (data.isPromoter) router.push('/refer-and-earn')
  }

  // Derived values
  const firstName = businessName || (business.name || '').split(' ')[0]
  const noData = stats.totalMonth === 0
  const callsAnswered = stats.totalMonth - stats.missedMonth
  const vsLastMonthDir: 'up' | 'down' | 'flat' =
    vsLastMonthPercent > 0 ? 'up' : vsLastMonthPercent < 0 ? 'down' : 'flat'

  const aiRateAccent: 'green' | 'orange' | undefined =
    noData ? undefined : stats.aiResolutionRate >= 80 ? 'green' : undefined

  // Revenue strip items
  const revenueStripItems = [
    {
      value: (
        <span className="tnum">
          ${revenueRecoveredThisMonth.toLocaleString()}
          {revenueIsEstimate && <span className="text-[11px] text-dim ml-1">est.</span>}
        </span>
      ),
      label: 'Revenue captured',
      sub: 'this month',
    },
    {
      value: <span className="tnum text-blue">{callsAnswered}</span>,
      label: 'Calls answered',
      sub: 'this month',
    },
    {
      value: (
        <span className={`tnum ${stats.missedMonth === 0 ? 'text-green' : 'text-red'}`}>
          {stats.missedMonth === 0 ? '0 ✓' : stats.missedMonth}
        </span>
      ),
      label: 'Missed calls',
      sub: stats.missedMonth === 0 ? 'Perfect answer rate' : 'this month',
    },
    {
      value: <span className="tnum text-green">+${INDUSTRY_AVG_UPSELL_PER_CALL.toFixed(0)}</span>,
      label: 'Avg upsell / call',
      sub: 'industry benchmark',
    },
  ]

  // Chart data
  const volumeData = toVolumeData(chartData, chartRange)

  // Status card rows
  const statusRows = [
    { label: 'Agent', value: business.agent_name || 'TalkMate Agent' },
    { label: 'Status', value: <span className="text-green">Live · answering calls</span> },
    { label: 'Number', value: business.talkmate_number || '—' },
    { label: 'Today', value: <span className="tnum">{callsAnsweredToday} call{callsAnsweredToday !== 1 ? 's' : ''}</span> },
  ]

  // Upsell: show when starter plan and approaching limit or passed 14 days
  const showUpsell = business.plan === 'starter' && daysSinceSignup >= 14

  return (
    <div
      className="flex flex-col gap-4 p-6 lg:p-7"
      style={{
        background: 'radial-gradient(1200px 700px at 78% -8%,rgba(238,106,44,.10),transparent 60%),radial-gradient(1000px 800px at 12% 110%,rgba(53,201,138,.06),transparent 55%),var(--bg)',
        minHeight: '100%',
      }}
    >
      {/* ── Page header ───────────────────────────────────────────────────── */}
      <div>
        <div className="text-[10px] font-bold uppercase tracking-[.1em] text-orange mb-1">Dashboard</div>
        <h1 className="text-[20px] font-[800] tracking-[-0.4px] leading-tight text-text">
          Welcome back{firstName ? `, ${firstName}` : ''}
        </h1>
        <p className="text-[13px] text-dim mt-1">
          {noData ? 'Your agent is live and ready to answer calls.' : `${callsAnsweredToday} call${callsAnsweredToday !== 1 ? 's' : ''} handled today`}
        </p>
      </div>

      {/* ── ROI hero (self-fetches /api/dashboard/roi) ─────────────────── */}
      <RoiSection />

      {/* ── Trial progress (self-fetches, renders nothing when not on trial) */}
      <TrialProgressCard callsThisMonth={stats.totalMonth} />

      {/* ── Retroactive T&C banner ─────────────────────────────────────── */}
      <RetroactiveTCBanner pendingCount={pendingLegalAcceptances} />

      {/* ── Onboarding checklist (until complete) ─────────────────────── */}
      {!business.onboarding_completed && (
        <OnboardingChecklist
          steps={onboardingSteps}
          onTestCall={() => router.push('/calls')}
        />
      )}

      {/* ── Revenue strip ─────────────────────────────────────────────── */}
      <RevenueStrip
        items={revenueStripItems}
        cta={{
          title: 'Full report →',
          subtitle: 'Analytics & ROI',
          onClick: () => router.push('/analytics'),
        }}
      />

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
          sub={<span>{noData ? 'No calls yet' : stats.missedMonth === 0 ? 'Perfect answer rate' : 'this month'}</span>}
          accent={stats.missedMonth === 0 && !noData ? 'green' : undefined}
          ctxTrend={stats.missedMonth === 0 ? 'up' : 'down'}
        />
        <KpiCard
          label="Revenue captured"
          value={<span className="tnum">${revenueRecoveredThisMonth.toLocaleString()}</span>}
          sub={<span>{revenueIsEstimate ? 'estimated' : 'actual'}</span>}
          accent="orange"
          ctx={revenueIsEstimate ? 'Based on industry avg' : undefined}
          ctxTrend="neutral"
        />
        <KpiCard
          label="AI resolution"
          value={<span className="tnum">{noData ? '—' : `${stats.aiResolutionRate}%`}</span>}
          sub={<span>Industry avg 77%</span>}
          accent={aiRateAccent}
          ctx={noData ? undefined : stats.aiResolutionRate >= 80 ? 'Above benchmark' : 'Below benchmark'}
          ctxTrend={stats.aiResolutionRate >= 80 ? 'up' : 'down'}
        />
      </div>

      {/* ── Upsell banner ─────────────────────────────────────────────── */}
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
              meta={chartRange === '7d' ? 'Last 7 days' : 'Last 14 days'}
              action={
                <SegmentedControl
                  options={[
                    { value: '7d', label: '7 days' },
                    { value: '14d', label: '14 days' },
                  ]}
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

            {/* Legend */}
            <div className="mt-3 flex items-center gap-4">
              <span className="flex items-center gap-1.5 text-[11px] text-dim">
                <span className="inline-block h-2 w-2 rounded-[2px]" style={{ background: 'linear-gradient(180deg,#f4843f,#e85f24)' }} />
                Handled
              </span>
              <span className="flex items-center gap-1.5 text-[11px] text-dim">
                <span className="inline-block h-2 w-2 rounded-[2px] bg-red" />
                Escalated
              </span>
              <span className="ml-auto text-[10px] text-faint">
                Escalated breakdown requires call intelligence
              </span>
            </div>
          </Panel>

          {/* Recent calls panel */}
          <Panel>
            <PanelHeader
              title="Recent calls"
              meta="Last 5 calls handled by your AI agent"
              action={
                <button
                  onClick={() => router.push('/calls')}
                  className="text-[12px] font-semibold text-blue hover:text-text transition-colors cursor-pointer"
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
                {liveCalls.map(c => {
                  const tag = callTag(c.outcome, c.transferred)
                  // AI score: not fetched in this prop set (lives in call_intelligence)
                  // Pass undefined so AiScoreBadge hides rather than showing "0/10"
                  return (
                    <CallRow
                      key={c.id}
                      time={timeAgo(c.created_at)}
                      who={c.caller_number || 'Unknown caller'}
                      desc={c.outcome || 'In progress'}
                      score={undefined}
                      tag={tag}
                      duration={fmt(c.duration_seconds)}
                      onPlay={() => router.push('/calls')}
                    />
                  )
                })}
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

          {/* Today's bookings panel */}
          <Panel>
            <PanelHeader
              title="Today's bookings"
              meta={`${todayBookings.length} scheduled`}
              action={
                <button
                  onClick={() => router.push('/bookings')}
                  className="text-[12px] font-semibold text-blue hover:text-text transition-colors cursor-pointer"
                >
                  View all →
                </button>
              }
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
                  const [timePart, meridiem] = timeStr.includes(' ')
                    ? timeStr.split(' ')
                    : [timeStr, '']
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

            {/* Call outcomes breakdown */}
            <div className="mt-3 border-t border-line pt-3">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-[.06em] text-faint">
                Outcomes this month
              </div>
              {([
                ['Resolved by AI', outcomes.resolved, 'var(--green)'],
                ['Transferred', outcomes.transferred, 'var(--gold)'],
                ['Missed', outcomes.missed, 'var(--red)'],
              ] as [string, number, string][]).map(([label, count, color]) => {
                const pct = outcomes.total > 0 ? Math.round((count / outcomes.total) * 100) : 0
                return (
                  <div key={label} className="mb-2">
                    <div className="flex justify-between text-[11.5px] mb-1">
                      <span className="text-dim">{label}</span>
                      <span className="tnum font-bold" style={{ color }}>{noData ? '—' : `${pct}%`}</span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden bg-card-2">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: noData ? '0%' : `${pct}%`, background: color }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </Panel>

          {/* Agent actions card */}
          <Panel>
            <div className="mb-3 text-[11px] font-bold uppercase tracking-[.08em] text-faint">Quick actions</div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => router.push('/calls')}
                className="rounded-[8px] border border-[rgba(238,106,44,.3)] bg-[rgba(238,106,44,.15)] px-3 py-2 text-[12px] font-semibold text-orange transition-opacity hover:opacity-80 cursor-pointer"
              >
                Test call
              </button>
              <button
                onClick={() => router.push('/catalog')}
                className="rounded-[8px] border border-line bg-transparent px-3 py-2 text-[12px] font-semibold text-blue transition-opacity hover:opacity-80 cursor-pointer"
              >
                Edit menu
              </button>
              <button
                onClick={() => router.push('/settings')}
                className="rounded-[8px] border border-line bg-transparent px-3 py-2 text-[12px] font-semibold text-dim transition-opacity hover:opacity-80 cursor-pointer"
              >
                View script
              </button>
              <button
                onClick={() => router.push(business.plan === 'starter' ? '/billing' : '/command-centre')}
                className="rounded-[8px] border border-line bg-transparent px-3 py-2 text-[12px] font-semibold text-dim transition-opacity hover:opacity-80 cursor-pointer"
              >
                {business.plan === 'starter' ? 'Upgrade plan' : 'Command Centre'}
              </button>
            </div>
          </Panel>
        </div>
      </div>

      {/* ── Refer & Earn strip ────────────────────────────────────────── */}
      {partner ? (
        <div
          onClick={() => router.push('/refer-and-earn')}
          className="flex cursor-pointer items-center gap-4 rounded-[11px] border border-[rgba(46,201,138,.25)] bg-[rgba(46,201,138,.08)] p-[14px_18px] transition-opacity hover:opacity-80"
        >
          <span className="text-[22px]">💸</span>
          <div className="flex-1">
            <div className="text-[13px] font-bold text-text">
              Earning ${partner.pending_payout?.toFixed(2) ?? '0.00'} this month from {partner.active_referrals ?? 0} active referral{(partner.active_referrals ?? 0) !== 1 ? 's' : ''}
            </div>
            <div className="mt-0.5 text-[11px] text-dim">Share your link → earn 15-25% of every monthly subscription</div>
          </div>
          <span className="text-[12px] font-bold text-green">Share →</span>
        </div>
      ) : (
        <div
          onClick={() => router.push('/refer-and-earn')}
          className="flex cursor-pointer items-center gap-4 rounded-[11px] border border-[rgba(74,159,232,.2)] bg-[rgba(74,159,232,.06)] p-[14px_18px] transition-opacity hover:opacity-80"
        >
          <span className="text-[22px]">💡</span>
          <div className="flex-1">
            <div className="text-[13px] font-bold text-text">Earn $74+/mo by telling another business about TalkMate</div>
            <div className="mt-0.5 text-[11px] text-dim">The Partner Program pays 15-25% of every subscription, every month</div>
          </div>
          <span className="text-[12px] font-bold text-blue">Start earning →</span>
        </div>
      )}

      {/* ── Modals & toasters (preserved exactly) ─────────────────────── */}
      <NpsModal
        open={npsOpen}
        trigger={needsNps ?? 'day30'}
        businessName={business.name.split(' ')[0]}
        onSubmit={submitNps}
      />
      <SocialProofToaster enabled={true} />
      <ShareYourWin
        businessName={business.name}
        monthlyRevenue={revenueRecoveredThisMonth}
        callsThisMonth={stats.totalMonth}
      />
    </div>
  )
}
