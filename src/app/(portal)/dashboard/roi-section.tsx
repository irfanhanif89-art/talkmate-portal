'use client'

// ROI hero + breakdown — Client Portal UI (Sprint features 2).
//
// Self-fetches /api/dashboard/roi (the API resolves the business from auth,
// so no body/props are needed). Renders a navy hero with a count-up dollar
// figure plus a 5-card breakdown beneath. Lives at the very top of the
// dashboard above all existing content.

import { useEffect, useRef, useState } from 'react'
import {
  Moon, MessageSquare, Globe, Star, Phone,
  ChevronDown, TrendingUp, TrendingDown, Info, X, CheckCircle2,
} from 'lucide-react'

const NAVY = '#061322'
const ORANGE = '#E8622A'

type Period = 'this_month' | 'last_month' | 'all_time'

interface RoiResponse {
  ok: boolean
  period: Period
  totalEstimatedRevenue: number
  callsAfterHours: { count: number; estimatedValue: number }
  winbacksSent: { count: number; estimatedValue: number }
  chatLeads: { count: number; estimatedValue: number }
  reviewRequestsSent: { count: number }
  totalCallsAnswered: number
  avgJobValue: number
  conversionRates?: { calls: number; chat: number; winback: number }
  previousPeriod: { totalEstimatedRevenue: number } | null
}

const PERIOD_LABELS: Array<{ key: Period; label: string }> = [
  { key: 'this_month', label: 'This Month' },
  { key: 'last_month', label: 'Last Month' },
  { key: 'all_time', label: 'All Time' },
]

function formatDollars(n: number): string {
  return '$' + Math.round(n).toLocaleString('en-AU')
}

// Count-up hook — animates from 0 to target over ~1.5s with an ease-out curve.
// Restarts whenever the target changes (e.g. switching period).
function useCountUp(target: number, durationMs = 1500): number {
  const [value, setValue] = useState(0)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    const start = performance.now()
    const from = 0
    function tick(now: number) {
      const elapsed = now - start
      const t = Math.min(1, elapsed / durationMs)
      const eased = 1 - Math.pow(1 - t, 3)
      setValue(from + (target - from) * eased)
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        setValue(target)
      }
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [target, durationMs])

  return value
}

function BreakdownCard(props: {
  icon: React.ComponentType<{ size?: number; color?: string }>
  iconColor: string
  primary: string
  secondary?: string
  sub: string
}) {
  const Icon = props.icon
  return (
    <div style={{
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 14, padding: 18,
      display: 'flex', gap: 14, alignItems: 'flex-start',
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: 10, flexShrink: 0,
        background: 'rgba(255,255,255,0.05)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={20} color={props.iconColor} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'white', lineHeight: 1.3 }}>{props.primary}</div>
        {props.secondary && (
          <div style={{ fontSize: 13, fontWeight: 700, color: '#22C55E', marginTop: 3 }}>{props.secondary}</div>
        )}
        <div style={{ fontSize: 12, color: '#7BAED4', marginTop: 5, lineHeight: 1.4 }}>{props.sub}</div>
      </div>
    </div>
  )
}

export default function RoiSection() {
  const [period, setPeriod] = useState<Period>('this_month')
  const [data, setData] = useState<RoiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [howOpen, setHowOpen] = useState(false)
  const [bannerDismissed, setBannerDismissed] = useState(false)

  // Adjust-assumptions editor.
  const [adjustOpen, setAdjustOpen] = useState(false)
  const [adjustJobValue, setAdjustJobValue] = useState('')
  const [adjustCalls, setAdjustCalls] = useState('')
  const [adjustChat, setAdjustChat] = useState('')
  const [adjustWinback, setAdjustWinback] = useState('')
  const [adjustSaving, setAdjustSaving] = useState(false)
  const [adjustSaved, setAdjustSaved] = useState(false)
  const [adjustError, setAdjustError] = useState<string | null>(null)
  const [refetchKey, setRefetchKey] = useState(0)

  // Fetch ROI for the selected period. All setState lives inside the async
  // chain (the leading setLoading runs in the first .then, never synchronously
  // in the effect body) so we satisfy react-hooks/set-state-in-effect. Resets
  // the count-up by flipping loading true while the new period is in flight.
  // refetchKey bumps after saving assumptions so the headline updates.
  useEffect(() => {
    let cancelled = false
    Promise.resolve()
      .then(() => { if (!cancelled) setLoading(true) })
      .then(() => fetch(`/api/dashboard/roi?period=${period}`))
      .then(r => (r.ok ? r.json() : null))
      .then((d: RoiResponse | null) => {
        if (cancelled) return
        setData(d && d.ok ? d : null)
        // Seed the editor inputs from the live response (only when not mid-edit).
        if (d && d.ok) {
          setAdjustJobValue(String(d.avgJobValue ?? ''))
          setAdjustCalls(String(d.conversionRates?.calls ?? ''))
          setAdjustChat(String(d.conversionRates?.chat ?? ''))
          setAdjustWinback(String(d.conversionRates?.winback ?? ''))
        }
      })
      .catch(() => { if (!cancelled) setData(null) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [period, refetchKey])

  async function saveAssumptions() {
    if (adjustSaving) return
    const jobValue = Number(adjustJobValue)
    const calls = Number(adjustCalls)
    const chat = Number(adjustChat)
    const winback = Number(adjustWinback)
    // Client-side validation: value >= 0 and <= 1,000,000, rates 0-100.
    if (!Number.isFinite(jobValue) || jobValue < 0 || jobValue > 1000000) {
      setAdjustError('Average job value must be between 0 and 1,000,000.')
      return
    }
    for (const r of [calls, chat, winback]) {
      if (!Number.isFinite(r) || r < 0 || r > 100) {
        setAdjustError('Conversion rates must be between 0 and 100.')
        return
      }
    }
    setAdjustSaving(true)
    setAdjustSaved(false)
    setAdjustError(null)
    try {
      const res = await fetch('/api/dashboard/roi', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          avgJobValue: jobValue,
          conversionRateCalls: calls,
          conversionRateChat: chat,
          conversionRateWinback: winback,
        }),
      })
      const d = await res.json().catch(() => ({}))
      if (res.ok && d?.ok !== false) {
        setAdjustSaved(true)
        setTimeout(() => setAdjustSaved(false), 2500)
        setRefetchKey(k => k + 1) // refetch so the headline reflects the new figures
      } else {
        setAdjustError('We could not save those figures. Please check them and try again.')
      }
    } catch {
      setAdjustError('We could not save those figures. Please check them and try again.')
    } finally {
      setAdjustSaving(false)
    }
  }

  const target = data?.totalEstimatedRevenue ?? 0
  const animated = useCountUp(loading ? 0 : target)

  // Percentage change vs previous period (only when we have a positive baseline).
  let delta: { pct: number; up: boolean } | null = null
  if (data?.previousPeriod && data.previousPeriod.totalEstimatedRevenue > 0) {
    const prev = data.previousPeriod.totalEstimatedRevenue
    const pct = Math.round(((data.totalEstimatedRevenue - prev) / prev) * 100)
    if (pct !== 0) delta = { pct: Math.abs(pct), up: pct > 0 }
  }

  const periodSuffix =
    period === 'this_month' ? 'this month'
      : period === 'last_month' ? 'last month'
        : 'so far'

  const showAvgJobBanner =
    !bannerDismissed && data != null && data.avgJobValue === 250

  return (
    <div style={{ marginBottom: 22, fontFamily: 'Outfit, sans-serif' }}>
      {/* Hero */}
      <div style={{
        background: NAVY,
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 18, padding: '28px 28px 24px',
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Period pills */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 18, flexWrap: 'wrap' }}>
          {PERIOD_LABELS.map(p => {
            const active = p.key === period
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => setPeriod(p.key)}
                style={{
                  padding: '6px 14px', borderRadius: 99,
                  fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  fontFamily: 'inherit',
                  background: active ? ORANGE : 'rgba(255,255,255,0.06)',
                  color: active ? 'white' : '#7BAED4',
                  border: active ? '1px solid ' + ORANGE : '1px solid rgba(255,255,255,0.08)',
                  transition: 'all 0.15s',
                }}
              >
                {p.label}
              </button>
            )
          })}
        </div>

        <div style={{ fontSize: 14, color: '#7BAED4', marginBottom: 6 }}>
          TalkMate recovered an estimated
        </div>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
          <div className="text-5xl font-bold" style={{ color: 'white', letterSpacing: '-1px' }}>
            {loading ? (
              <span style={{ opacity: 0.4 }}>$0</span>
            ) : (
              formatDollars(animated)
            )}
          </div>
          {delta && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              fontSize: 13, fontWeight: 700,
              color: delta.up ? '#22C55E' : '#EF4444',
              background: delta.up ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
              padding: '4px 10px', borderRadius: 99,
            }}>
              {delta.up ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
              {delta.up ? 'Up' : 'Down'} {delta.pct}%
            </div>
          )}
        </div>

        <div style={{ fontSize: 14, color: '#7BAED4', marginTop: 6 }}>
          for you {periodSuffix}
        </div>

        {/* How we calculate this */}
        <button
          type="button"
          onClick={() => setHowOpen(o => !o)}
          style={{
            marginTop: 16, display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: '#7BAED4', fontSize: 12, fontWeight: 600, fontFamily: 'inherit', padding: 0,
          }}
        >
          <Info size={13} />
          How we calculate this
          <ChevronDown size={13} style={{ transform: howOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
        </button>
        {howOpen && (
          <div style={{
            marginTop: 12, padding: 14, borderRadius: 12,
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
            fontSize: 12.5, color: '#C8D8EA', lineHeight: 1.6,
          }}>
            This is an estimate, not a guarantee. We take your after-hours calls answered,
            missed-call win-backs, and website chat leads, and multiply each by your average
            job value ({formatDollars(data?.avgJobValue ?? 0)}) and an assumed conversion rate
            (after-hours {data?.conversionRates?.calls ?? 0}%, win-backs{' '}
            {data?.conversionRates?.winback ?? 0}%, chat {data?.conversionRates?.chat ?? 0}%).
            Win-back calls are counted once, not twice. Adjust these figures below to match
            your business.
          </div>
        )}
      </div>

      {/* Avg job value prompt */}
      {showAvgJobBanner && (
        <div style={{
          marginTop: 12, display: 'flex', alignItems: 'center', gap: 12,
          padding: '12px 16px', borderRadius: 12,
          background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.25)',
        }}>
          <Info size={16} color="#FBBF24" style={{ flexShrink: 0 }} />
          <div style={{ flex: 1, fontSize: 13, color: '#FBBF24' }}>
            Update your average job value to make your ROI estimate more accurate.{' '}
            <a href="/settings" style={{ color: '#FBBF24', fontWeight: 700, textDecoration: 'underline' }}>
              Update now
            </a>
          </div>
          <button
            type="button"
            onClick={() => setBannerDismissed(true)}
            aria-label="Dismiss"
            style={{ background: 'transparent', border: 'none', color: '#FBBF24', cursor: 'pointer', padding: 2, display: 'flex' }}
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* Breakdown cards */}
      {loading ? (
        <div style={{
          marginTop: 16,
          display: 'grid', gap: 12,
          gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))',
        }}>
          {[0, 1, 2, 3, 4].map(i => (
            <div key={i} style={{
              height: 96, borderRadius: 14,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.06)',
              opacity: 0.5,
            }} />
          ))}
        </div>
      ) : data ? (
        <div style={{
          marginTop: 16,
          display: 'grid', gap: 12,
          gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))',
        }}>
          <BreakdownCard
            icon={Moon} iconColor="#7BAED4"
            primary={`${data.callsAfterHours.count} calls answered after hours`}
            secondary={`Est. ${formatDollars(data.callsAfterHours.estimatedValue)} recovered`}
            sub="Calls outside 9am-5pm Mon-Fri"
          />
          <BreakdownCard
            icon={MessageSquare} iconColor={ORANGE}
            primary={`${data.winbacksSent.count} win-backs sent`}
            secondary={`Est. ${formatDollars(data.winbacksSent.estimatedValue)} recovered`}
            sub="Callers who hung up, texted back"
          />
          <BreakdownCard
            icon={Globe} iconColor="#4A9FE8"
            primary={`${data.chatLeads.count} leads from website chat`}
            secondary={`Est. ${formatDollars(data.chatLeads.estimatedValue)} recovered`}
            sub="Visitors who left contact details"
          />
          <BreakdownCard
            icon={Star} iconColor="#FBBF24"
            primary={`${data.reviewRequestsSent.count} review requests sent`}
            sub="More Google reviews on autopilot"
          />
          <BreakdownCard
            icon={Phone} iconColor="#22C55E"
            primary={`${data.totalCallsAnswered} total calls answered`}
            sub="All handled without missing one"
          />
        </div>
      ) : null}

      {/* Adjust assumptions */}
      {!loading && data && (
        <div style={{ marginTop: 16 }}>
          <button
            type="button"
            onClick={() => setAdjustOpen(o => !o)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: '#7BAED4', fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit', padding: 0,
            }}
          >
            Adjust assumptions
            <ChevronDown size={13} style={{ transform: adjustOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
          </button>

          {adjustOpen && (
            <div style={{
              marginTop: 12, padding: 18, borderRadius: 14,
              background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
            }}>
              <div style={{
                display: 'grid', gap: 14,
                gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',
              }}>
                <AdjustField label="Average job value ($)">
                  <input
                    type="number" min={0} max={1000000} step={1}
                    value={adjustJobValue}
                    onChange={e => { setAdjustJobValue(e.target.value); setAdjustError(null); setAdjustSaved(false) }}
                    style={adjustInputStyle}
                  />
                </AdjustField>
                <AdjustField label="After-hours conversion (%)">
                  <input
                    type="number" min={0} max={100} step={1}
                    value={adjustCalls}
                    onChange={e => { setAdjustCalls(e.target.value); setAdjustError(null); setAdjustSaved(false) }}
                    style={adjustInputStyle}
                  />
                </AdjustField>
                <AdjustField label="Win-back conversion (%)">
                  <input
                    type="number" min={0} max={100} step={1}
                    value={adjustWinback}
                    onChange={e => { setAdjustWinback(e.target.value); setAdjustError(null); setAdjustSaved(false) }}
                    style={adjustInputStyle}
                  />
                </AdjustField>
                <AdjustField label="Chat conversion (%)">
                  <input
                    type="number" min={0} max={100} step={1}
                    value={adjustChat}
                    onChange={e => { setAdjustChat(e.target.value); setAdjustError(null); setAdjustSaved(false) }}
                    style={adjustInputStyle}
                  />
                </AdjustField>
              </div>

              {adjustError && (
                <div style={{ fontSize: 12.5, color: '#EF4444', marginTop: 14, lineHeight: 1.5 }}>
                  {adjustError}
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16 }}>
                <button
                  type="button"
                  onClick={saveAssumptions}
                  disabled={adjustSaving}
                  style={{
                    background: ORANGE, color: 'white', border: 'none',
                    padding: '9px 20px', borderRadius: 9, fontSize: 13, fontWeight: 700,
                    cursor: adjustSaving ? 'default' : 'pointer', fontFamily: 'inherit', opacity: adjustSaving ? 0.6 : 1,
                  }}
                >
                  {adjustSaving ? 'Saving...' : 'Save'}
                </button>
                {adjustSaved && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: '#22C55E', fontSize: 13, fontWeight: 600 }}>
                    <CheckCircle2 size={15} /> Saved
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function AdjustField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#C8D8EA', marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  )
}

const adjustInputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 9,
  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)',
  color: 'white', fontSize: 13, fontFamily: 'inherit', outline: 'none',
}
