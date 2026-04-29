'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import OnboardingChecklist from '@/components/portal/onboarding-checklist'
import RetroactiveTCBanner from '@/components/portal/retroactive-tc-banner'
import RoiCounter from '@/components/portal/roi-counter'
import ContextualUpsellBanner from '@/components/portal/contextual-upsell'
import NpsModal from '@/components/portal/nps-modal'
import SocialProofToaster from '@/components/portal/social-proof-toaster'
import ShareYourWin from '@/components/portal/share-win'

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
}

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function fmt(s: number | null) {
  if (!s) return '—'
  return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`
}

function outcomeBadge(outcome: string | null) {
  const o = (outcome || '').toLowerCase()
  if (!o || o === 'missed') return { bg: 'rgba(239,68,68,0.12)', color: '#EF4444', label: 'Missed' }
  if (o.includes('transfer')) return { bg: 'rgba(245,158,11,0.12)', color: '#F59E0B', label: 'Transferred' }
  if (o === 'faq') return { bg: 'rgba(74,159,232,0.12)', color: '#4A9FE8', label: 'FAQ' }
  return { bg: 'rgba(34,197,94,0.12)', color: '#22C55E', label: 'Resolved' }
}

function PhoneIcon({ color }: { color: string }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 15a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 4.23h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 11a16 16 0 0 0 6 6l.92-.92a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
    </svg>
  )
}

function StatCard({ label, value, hint, accent, hintColor }: { label: string; value: string | number; hint: string; accent: string; hintColor?: string }) {
  return (
    <div style={{ background: '#0A1E38', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, overflow: 'hidden' }}>
      <div style={{ height: 2, background: `linear-gradient(90deg, ${accent}, #1565C0)` }} />
      <div style={{ padding: '16px 18px' }}>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#4A7FBB', marginBottom: 8 }}>{label}</div>
        <div style={{ fontSize: '1.6rem', fontWeight: 800, lineHeight: 1, marginBottom: 4, color: 'white', letterSpacing: '-1px' }}>{value}</div>
        <div style={{ fontSize: 11, fontWeight: 300, color: hintColor ?? 'rgba(255,255,255,0.4)' }}>{hint}</div>
      </div>
    </div>
  )
}

function BarChart({ data }: { data: { date: string; count: number }[] }) {
  const max = Math.max(...data.map(d => d.count), 1)
  const W = 560, H = 160, ml = 20, mr = 8, mt = 8, mb = 28
  const cw = W - ml - mr
  const ch = H - mt - mb
  const slotW = cw / data.length
  const barW = Math.max(10, Math.floor(slotW * 0.58))

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
      {[0, 0.25, 0.5, 0.75, 1].map(t => (
        <line key={t} x1={ml} y1={mt + ch * (1 - t)} x2={W - mr} y2={mt + ch * (1 - t)} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
      ))}
      {data.map((d, i) => {
        const barH = d.count > 0 ? Math.max(3, Math.round((d.count / max) * ch)) : 2
        const x = ml + i * slotW + (slotW - barW) / 2
        const y = mt + ch - barH
        const isToday = i === data.length - 1
        const label = new Date(d.date + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
        return (
          <g key={d.date}>
            <rect x={x} y={y} width={barW} height={barH} rx="3" fill={isToday ? '#E8622A' : 'rgba(232,98,42,0.4)'} />
            {i % 2 === 0 && <text x={x + barW / 2} y={H - 4} textAnchor="middle" fill="#4A7FBB" fontSize="9">{label}</text>}
          </g>
        )
      })}
    </svg>
  )
}

export function DashboardClient({
  business, stats, outcomes, chartData, recentCalls: initialCalls, businessName,
  callsAnsweredToday = 0, revenueRecoveredThisMonth = 0, vsLastMonthPercent = 0, revenueIsEstimate = false,
  revenueProtected, benchmarkLabel, payingForItself, planMonthlyPrice, planLimit,
  daysActive, daysSinceSignup, onboardingSteps, needsNps, partner,
  pendingLegalAcceptances = 0, contactsThisMonth = 0, crmHealthPct = 0,
}: Props) {
  const supabase = createClient()
  const router = useRouter()
  const [liveCalls, setLiveCalls] = useState<Call[]>(initialCalls)
  const [npsOpen, setNpsOpen] = useState(false)
  const [npsClosed, setNpsClosed] = useState(false)
  const [payingDismissed, setPayingDismissed] = useState(false)

  useEffect(() => {
    if (needsNps && !npsClosed) {
      // small delay so the modal doesn't race with first paint
      const t = setTimeout(() => setNpsOpen(true), 800)
      return () => clearTimeout(t)
    }
  }, [needsNps, npsClosed])

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
    // Promoter → push to refer-and-earn
    if (data.isPromoter) router.push('/refer-and-earn')
  }

  const pct = (n: number) => outcomes.total > 0 ? Math.round((n / outcomes.total) * 100) : 0
  const firstName = businessName || (business.name || '').split(' ')[0]
  const noData = stats.totalMonth === 0
  const aiRateColor = noData ? 'rgba(255,255,255,0.3)' : stats.aiResolutionRate >= 85 ? '#22C55E' : stats.aiResolutionRate >= 70 ? '#F59E0B' : '#EF4444'

  let vsLastMonthEl: React.ReactNode = null
  if (vsLastMonthPercent > 0) vsLastMonthEl = <span style={{ color: '#22C55E' }}>↑ {vsLastMonthPercent}% vs last month</span>
  else if (vsLastMonthPercent < 0) vsLastMonthEl = <span style={{ color: '#EF4444' }}>↓ {Math.abs(vsLastMonthPercent)}% vs last month</span>
  else vsLastMonthEl = <span style={{ color: 'rgba(255,255,255,0.3)' }}>No data from last month</span>

  return (
    <div style={{ padding: 28, flex: 1, color: '#F2F6FB' }}>
      {/* Page header */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#E8622A', marginBottom: 6 }}>Dashboard</div>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 800, letterSpacing: '-0.5px', margin: 0, lineHeight: 1.1, color: 'white' }}>
          Welcome back{firstName ? `, ${firstName}` : ''}
        </h1>
      </div>

      {/* Retroactive T&C banner (Session 1 brief Part 1) */}
      <RetroactiveTCBanner pendingCount={pendingLegalAcceptances} />

      {/* Onboarding checklist (until complete) */}
      {!business.onboarding_completed && (
        <OnboardingChecklist
          steps={onboardingSteps}
          onTestCall={() => router.push('/calls')}
        />
      )}

      {/* Revenue proof strip */}
      <div style={{
        background: 'linear-gradient(135deg, #061322 0%, rgba(21,101,192,0.18) 50%, rgba(232,98,42,0.12) 100%)',
        border: '1px solid rgba(21,101,192,0.25)', borderRadius: 16, padding: '18px 22px', marginBottom: 20,
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 14,
      }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#4A7FBB', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Revenue captured</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'white', marginTop: 4 }}>${revenueRecoveredThisMonth.toLocaleString()}{revenueIsEstimate && <span style={{ fontSize: 11, color: '#4A7FBB', marginLeft: 4 }}>est.</span>}</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>this month</div>
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#4A7FBB', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Calls answered</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#4A9FE8', marginTop: 4 }}>{stats.totalMonth - stats.missedMonth}</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>this month</div>
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#4A7FBB', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Calls missed this week</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: stats.missedMonth === 0 ? '#22C55E' : '#EF4444', marginTop: 4 }}>{stats.missedMonth === 0 ? '0 🎉' : stats.missedMonth}</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{stats.missedMonth === 0 ? 'Perfect answer rate' : 'Connect SMS Follow-Ups'}</div>
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#4A7FBB', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Avg upsell / call</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#22C55E', marginTop: 4 }}>+$6.20</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>industry benchmark</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
          <button onClick={() => router.push('/analytics')} style={{ background: 'rgba(232,98,42,0.18)', border: '1px solid rgba(232,98,42,0.35)', color: '#E8622A', borderRadius: 8, padding: '8px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
            View full report →
          </button>
        </div>
      </div>

      {/* ROI counter + paying-for-itself banner */}
      <RoiCounter
        amount={revenueProtected}
        benchmarkLabel={benchmarkLabel}
        paying={{
          has: payingForItself && !payingDismissed,
          dayOfMonth: new Date().getDate(),
          planCost: planMonthlyPrice,
        }}
        onDismissPaying={() => setPayingDismissed(true)}
      />

      {/* 4 stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 20 }}>
        <StatCard label="Calls Today" value={callsAnsweredToday} hint={vsLastMonthEl as string} accent="#4A9FE8" />
        <StatCard label="Revenue Captured" value={`$${revenueRecoveredThisMonth.toLocaleString()}`} hint={revenueIsEstimate ? 'estimated' : 'actual'} accent="#E8622A" />
        <StatCard label="Answer Rate" value={noData ? '—' : `${stats.aiResolutionRate}%`} hint="Industry avg 77%" accent={aiRateColor} hintColor="#22C55E" />
        <StatCard label="Avg Order Value" value={revenueIsEstimate ? '$32' : `$${Math.max(85, Math.round(revenueRecoveredThisMonth / Math.max(stats.totalMonth, 1)))}`} hint="incl. upsell lift" accent="#8B5CF6" />
        <StatCard
          label="New Contacts This Month"
          value={contactsThisMonth}
          hint="Callers automatically added to your CRM"
          accent="#1565C0"
        />
        <StatCard
          label="CRM Health"
          value={`${crmHealthPct}%`}
          hint="Contacts with name identified"
          accent={crmHealthPct >= 60 ? '#22C55E' : crmHealthPct >= 40 ? '#F59E0B' : '#EF4444'}
          hintColor={crmHealthPct >= 60 ? '#22C55E' : crmHealthPct >= 40 ? '#F59E0B' : '#EF4444'}
        />
      </div>

      {/* Contextual upsell banner */}
      <ContextualUpsellBanner
        ctx={{
          callsUsed: stats.totalMonth,
          callsLimit: planLimit,
          daysSinceSignup,
          plan: business.plan,
          monthlyRevenue: revenueRecoveredThisMonth,
          hasReferrals: (partner?.active_referrals ?? 0) > 0,
        }}
      />

      {/* Main grid: recent calls + sidebar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: 16, marginBottom: 20 }}>
        <div style={{ background: '#0A1E38', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, overflow: 'hidden' }}>
          <div style={{ height: 2, background: 'linear-gradient(90deg, #E8622A, #1565C0)' }} />
          <div style={{ padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'white' }}>Recent calls</div>
                <div style={{ fontSize: 11, color: '#4A7FBB' }}>Last 5 calls handled by your AI agent</div>
              </div>
              <button onClick={() => router.push('/calls')} style={{ background: 'transparent', border: '1px solid rgba(74,159,232,0.25)', color: '#4A9FE8', padding: '6px 12px', borderRadius: 8, fontSize: 12, cursor: 'pointer', fontFamily: 'Outfit, sans-serif', fontWeight: 600 }}>View all →</button>
            </div>
            {liveCalls.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 0', color: '#4A7FBB', fontSize: 13 }}>No calls yet — your agent is live and waiting</div>
            ) : liveCalls.map((c, i) => {
              const badge = outcomeBadge(c.outcome)
              return (
                <div key={c.id} onClick={() => router.push('/calls')} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14, padding: '12px 0', borderBottom: i < liveCalls.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                  <div style={{ width: 34, height: 34, borderRadius: 9, background: badge.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <PhoneIcon color={badge.color} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'white' }}>{c.caller_number || 'Unknown'}</div>
                    <div style={{ fontSize: 11, color: '#4A7FBB' }}>{c.outcome || 'In progress'} · {fmt(c.duration_seconds)}</div>
                  </div>
                  <div style={{ fontSize: 11, color: '#4A7FBB' }}>{timeAgo(c.created_at)}</div>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 99, background: badge.bg, color: badge.color, marginLeft: 10 }}>{badge.label}</span>
                </div>
              )
            })}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ background: '#0A1E38', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#4A7FBB', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Your agent</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'white' }}>{business.agent_name || 'TalkMate Agent'}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, fontSize: 12, color: '#22C55E' }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#22C55E' }} /> Live · answering calls
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 14 }}>
              <button onClick={() => router.push('/calls')} style={{ background: 'rgba(232,98,42,0.18)', color: '#E8622A', border: '1px solid rgba(232,98,42,0.3)', borderRadius: 8, padding: '8px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Test call</button>
              <button onClick={() => router.push('/catalog')} style={{ background: 'transparent', color: '#4A9FE8', border: '1px solid rgba(74,159,232,0.3)', borderRadius: 8, padding: '8px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Edit menu</button>
              <button onClick={() => router.push('/settings')} style={{ background: 'transparent', color: '#7BAED4', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '8px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>View script</button>
              <button onClick={() => router.push('/settings')} style={{ background: 'transparent', color: '#7BAED4', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '8px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Settings</button>
            </div>
          </div>

          <div style={{ background: '#0A1E38', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#4A7FBB', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Command Centre</div>
              {(business.plan === 'starter') && <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: 'rgba(232,98,42,0.18)', color: '#E8622A', letterSpacing: '0.05em' }}>GROWTH+</span>}
            </div>
            {business.plan === 'starter' ? (
              <>
                <p style={{ fontSize: 12, color: '#7BAED4', lineHeight: 1.5, marginBottom: 12 }}>Run your business by texting WhatsApp or Telegram — &quot;send invoice to John&quot;, &quot;pause agent&quot;, &quot;today&apos;s revenue?&quot;.</p>
                <button onClick={() => router.push('/command-centre')} style={{ background: '#E8622A', color: 'white', border: 'none', borderRadius: 8, padding: '10px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Outfit, sans-serif', width: '100%' }}>Upgrade to Growth →</button>
              </>
            ) : (
              <>
                <p style={{ fontSize: 12, color: '#7BAED4', lineHeight: 1.5, marginBottom: 12 }}>Send a command to your AI assistant via WhatsApp or Telegram.</p>
                <button onClick={() => router.push('/command-centre')} style={{ background: 'transparent', color: '#4A9FE8', border: '1px solid rgba(74,159,232,0.3)', borderRadius: 8, padding: '10px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit, sans-serif', width: '100%' }}>Open Command Centre →</button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Call volume chart */}
      <div style={{ background: '#0A1E38', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: 24, marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'white', marginBottom: 4 }}>Call volume — last 14 days</div>
        <div style={{ fontSize: 11, color: '#4A7FBB', marginBottom: 14 }}>Daily calls handled by your AI agent</div>
        <BarChart data={chartData} />
      </div>

      {/* Outcomes */}
      <div style={{ background: '#0A1E38', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: 24, marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'white', marginBottom: 14 }}>Call outcomes — this month</div>
        {([
          ['Resolved by AI', pct(outcomes.resolved), '#22C55E'],
          ['Transferred', pct(outcomes.transferred), '#F59E0B'],
          ['Missed', pct(outcomes.missed), '#EF4444'],
        ] as [string, number, string][]).map(([label, value, color]) => (
          <div key={label} style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
              <span style={{ color: '#7BAED4' }}>{label}</span>
              <span style={{ fontWeight: 700, color: 'white' }}>{noData ? '—' : `${value}%`}</span>
            </div>
            <div style={{ height: 5, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ width: noData ? '0%' : `${value}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.6s ease' }} />
            </div>
          </div>
        ))}
      </div>

      {/* Refer & Earn strip */}
      {partner ? (
        <div onClick={() => router.push('/refer-and-earn')} style={{ cursor: 'pointer', background: 'linear-gradient(135deg, rgba(34,197,94,0.1), rgba(74,159,232,0.05))', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 14, padding: '14px 18px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ fontSize: 22 }}>💸</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'white' }}>Earning ${partner.pending_payout?.toFixed(2) ?? '0.00'} this month from {partner.active_referrals ?? 0} active referrals</div>
            <div style={{ fontSize: 11, color: '#7BAED4', marginTop: 2 }}>Share your link → earn 15-25% of every monthly subscription, every month</div>
          </div>
          <span style={{ color: '#22C55E', fontSize: 12, fontWeight: 700 }}>Share your link →</span>
        </div>
      ) : (
        <div onClick={() => router.push('/refer-and-earn')} style={{ cursor: 'pointer', background: 'rgba(74,159,232,0.06)', border: '1px solid rgba(74,159,232,0.2)', borderRadius: 14, padding: '14px 18px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ fontSize: 22 }}>💡</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'white' }}>Earn $74+/mo by telling another business about TalkMate</div>
            <div style={{ fontSize: 11, color: '#7BAED4', marginTop: 2 }}>The Partner Program pays 15-25% of every subscription, every month</div>
          </div>
          <span style={{ color: '#4A9FE8', fontSize: 12, fontWeight: 700 }}>Start earning →</span>
        </div>
      )}

      {/* NPS modal */}
      <NpsModal
        open={npsOpen}
        trigger={needsNps ?? 'day30'}
        businessName={business.name.split(' ')[0]}
        onSubmit={submitNps}
      />

      {/* Social proof toaster (dashboard only) */}
      <SocialProofToaster enabled={true} />

      {/* Share-your-win modal */}
      <ShareYourWin
        businessName={business.name}
        monthlyRevenue={revenueRecoveredThisMonth}
        callsThisMonth={stats.totalMonth}
      />
    </div>
  )
}
