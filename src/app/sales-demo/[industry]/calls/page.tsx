import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import {
  validateDemoPortalToken,
  getDemoBusinessId,
  getDemoIndustry,
} from '@/lib/demo-config'
import DemoTokenInvalid from '../_components/DemoTokenInvalid'
import { formatDuration, formatRelative } from '../_components/format'

interface PageProps {
  params: Promise<{ industry: string }>
  searchParams: Promise<{ token?: string }>
}

type CallRow = {
  id: string
  caller_name: string | null
  caller_number: string
  outcome: string
  duration_seconds: number
  created_at: string
  summary: string | null
}

function outcomeStyle(outcome: string): { bg: string; fg: string } {
  const o = (outcome ?? '').toLowerCase()
  if (o.includes('booking')) return { bg: 'rgba(16,185,129,0.14)', fg: '#10B981' }
  if (o.includes('missed')) return { bg: 'rgba(239,68,68,0.14)', fg: '#EF4444' }
  if (o.includes('quote')) return { bg: 'rgba(245,158,11,0.14)', fg: '#F59E0B' }
  if (o.includes('escalat')) return { bg: 'rgba(168,85,247,0.14)', fg: '#A855F7' }
  return { bg: 'rgba(148,163,184,0.14)', fg: '#94A3B8' }
}

const CARD: React.CSSProperties = {
  background: '#0A1E38',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: 12,
  padding: 22,
  fontFamily: "'Outfit', system-ui, sans-serif",
}

export default async function DemoCallsPage({ params, searchParams }: PageProps) {
  const { industry } = await params
  const { token } = await searchParams

  if (!validateDemoPortalToken(token)) {
    return <DemoTokenInvalid />
  }

  const demoIndustry = getDemoIndustry(industry)
  if (!demoIndustry || !demoIndustry.available) notFound()
  const businessId = getDemoBusinessId(industry)
  if (!businessId) notFound()

  const supabase = createAdminClient()

  const { data: calls } = await supabase
    .from('calls')
    .select('id, caller_name, caller_number, outcome, duration_seconds, created_at, summary')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
    .returns<CallRow[]>()

  const list = calls ?? []

  return (
    <div style={{ fontFamily: "'Outfit', system-ui, sans-serif" }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ color: '#ffffff', fontSize: 28, fontWeight: 700, margin: 0 }}>
          Calls
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 14, margin: '6px 0 0' }}>
          All calls received by your AI receptionist.
        </p>
      </div>

      {/* Call cards */}
      {list.length === 0 ? (
        <div style={CARD}>
          <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13, margin: 0 }}>
            No calls yet.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {list.map((call) => {
            const { bg, fg } = outcomeStyle(call.outcome)
            const isMissed = (call.outcome ?? '').toLowerCase().includes('missed')
            const summaryText =
              call.summary
                ? call.summary
                : isMissed
                ? '(Missed call - no transcript)'
                : null

            return (
              <div key={call.id} style={CARD}>
                {/* Row 1: caller name + outcome badge */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 8,
                  }}
                >
                  <span style={{ color: '#ffffff', fontSize: 15, fontWeight: 600 }}>
                    {call.caller_name ?? call.caller_number}
                  </span>
                  <span
                    style={{
                      background: bg,
                      color: fg,
                      fontSize: 11,
                      fontWeight: 600,
                      padding: '3px 10px',
                      borderRadius: 6,
                      letterSpacing: '0.02em',
                    }}
                  >
                    {call.outcome}
                  </span>
                </div>

                {/* Row 2: number + duration + time */}
                <div
                  style={{
                    display: 'flex',
                    gap: 16,
                    alignItems: 'center',
                    marginBottom: summaryText ? 10 : 0,
                    flexWrap: 'wrap',
                  }}
                >
                  <span
                    style={{
                      color: 'rgba(255,255,255,0.5)',
                      fontSize: 12,
                      fontFamily: 'monospace',
                    }}
                  >
                    {call.caller_number}
                  </span>
                  <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12 }}>
                    {formatDuration(call.duration_seconds)}
                  </span>
                  <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12 }}>
                    {formatRelative(call.created_at)}
                  </span>
                </div>

                {/* Row 3: summary */}
                {summaryText && (
                  <p
                    style={{
                      color: isMissed
                        ? 'rgba(255,255,255,0.3)'
                        : 'rgba(255,255,255,0.55)',
                      fontSize: 13,
                      margin: 0,
                      lineHeight: 1.5,
                      fontStyle: isMissed ? 'italic' : 'normal',
                    }}
                  >
                    {summaryText}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
