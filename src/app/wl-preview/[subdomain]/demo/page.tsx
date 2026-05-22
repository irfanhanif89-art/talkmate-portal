import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PROXIMA_DEMO, getProximaDemoStats } from '@/lib/wl-demo-data'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Proxima Agent — Partner Portal Demo',
}

// Brand tokens — exact values from Session 34 brief. Do not edit without
// also updating the corresponding white_label_configs row.
const NAVY = '#1B4FBB'
const DARK = '#0A1E38'
const ACCENT = '#E8622A'
const WHITE = '#FFFFFF'
const MUTED = '#94A3B8'
const GREEN = '#22C55E'
const RED = '#EF4444'
const FAINT = '#64748B'

// Sub-paths under /wl-preview/[subdomain] all match this route. The Proxima
// demo data is partner-specific, so any other subdomain must 404 to avoid
// rendering Proxima's network masquerading as theirs.
export default async function ProximaDemoPage({
  params,
}: { params: Promise<{ subdomain: string }> }) {
  const { subdomain } = await params
  if (subdomain !== 'proxima') notFound()

  const stats = getProximaDemoStats(PROXIMA_DEMO.clients)

  return (
    <div style={{
      minHeight: '100vh',
      background: DARK,
      fontFamily: 'Outfit, sans-serif',
    }}>
      <header style={{
        background: DARK,
        borderBottom: `1px solid ${NAVY}4D`,
        padding: '16px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: NAVY,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, fontWeight: 800, color: WHITE,
            fontFamily: 'Outfit, sans-serif',
          }}>P</div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: WHITE }}>
              {PROXIMA_DEMO.partnerName}
            </div>
            <div style={{ fontSize: 11, color: MUTED }}>Partner Portal</div>
          </div>
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'rgba(34,197,94,0.1)',
          border: '1px solid rgba(34,197,94,0.3)',
          borderRadius: 20, padding: '4px 12px',
          fontSize: 12, fontWeight: 600, color: GREEN,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: GREEN, display: 'inline-block' }} />
          Live Network
        </div>
      </header>

      <main style={{
        maxWidth: 1100,
        margin: '0 auto',
        padding: '32px 24px',
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 14,
          marginBottom: 28,
        }}>
          <StatCard label="Total Agents" value={String(stats.totalAgents)} sub={`${stats.liveAgents} live`} />
          <StatCard label="Network MRR" value={`$${stats.totalMRR.toLocaleString()}`} sub="monthly recurring" />
          <StatCard
            label="Your Royalty"
            value={`$${stats.totalRoyalty.toFixed(2)}/mo`}
            sub="25% of network MRR"
            valueColor={ACCENT}
          />
          <StatCard label="Calls Answered" value={String(stats.totalCallsThisMonth)} sub="this month" />
        </div>

        <SectionHeading>Your Agents</SectionHeading>
        {PROXIMA_DEMO.clients.map(client => (
          <div key={client.id} style={{
            background: 'rgba(27,79,187,0.06)',
            border: '1px solid rgba(27,79,187,0.15)',
            borderRadius: 12, padding: '16px 20px',
            marginBottom: 12,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: WHITE }}>{client.name}</div>
                <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>
                  {client.industry} · {client.location}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{
                  fontSize: 11, fontWeight: 600,
                  padding: '2px 8px', borderRadius: 4,
                  background: 'rgba(27,79,187,0.2)',
                  color: MUTED, textTransform: 'capitalize',
                }}>{client.plan}</span>
                <span style={{
                  fontSize: 11, fontWeight: 600,
                  padding: '2px 8px', borderRadius: 4,
                  background: client.status === 'live' ? 'rgba(34,197,94,0.1)' : 'rgba(232,98,42,0.1)',
                  color: client.status === 'live' ? GREEN : ACCENT,
                  border: `1px solid ${client.status === 'live' ? 'rgba(34,197,94,0.3)' : 'rgba(232,98,42,0.3)'}`,
                }}>
                  {client.status === 'live' ? 'Live' : 'Setting up'}
                </span>
              </div>
            </div>

            {client.status === 'live' && (
              <div style={{ display: 'flex', gap: 24, marginTop: 12, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, color: MUTED }}>
                  <strong style={{ color: WHITE }}>{client.callsThisMonth}</strong> calls
                </span>
                <span style={{ fontSize: 13, color: MUTED }}>
                  <strong style={{ color: WHITE }}>{client.bookingsThisMonth}</strong> bookings
                </span>
                <span style={{ fontSize: 13, color: MUTED }}>
                  Score <strong style={{ color: WHITE }}>{client.avgScore}</strong>/10
                </span>
                <span style={{ fontSize: 13, color: ACCENT, fontWeight: 600 }}>
                  Earns you ${client.royaltyAmount.toFixed(2)}/mo
                </span>
              </div>
            )}
          </div>
        ))}

        <SectionHeading style={{ marginTop: 32 }}>Recent Call Activity</SectionHeading>
        <div style={{
          background: 'rgba(27,79,187,0.04)',
          border: '1px solid rgba(27,79,187,0.12)',
          borderRadius: 12, padding: '4px 20px',
        }}>
          {PROXIMA_DEMO.recentCalls.map((call, i) => (
            <div
              key={call.id}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 0',
                borderBottom: i === PROXIMA_DEMO.recentCalls.length - 1
                  ? 'none'
                  : '1px solid rgba(27,79,187,0.1)',
                gap: 12, flexWrap: 'wrap',
              }}
            >
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: WHITE }}>
                  {call.clientName}
                </div>
                <div style={{ fontSize: 12, color: MUTED }}>
                  {call.callerName} · {call.duration}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <span style={{
                  fontSize: 11, padding: '2px 8px', borderRadius: 4,
                  background: call.outcome === 'Booked' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                  color: call.outcome === 'Booked' ? GREEN : RED,
                  fontWeight: 600,
                }}>{call.outcome}</span>
                <span style={{ fontSize: 12, color: MUTED }}>
                  Score {call.score}/10
                </span>
                <span style={{ fontSize: 11, color: FAINT }}>{call.time}</span>
              </div>
            </div>
          ))}
        </div>

        <div style={{
          background: 'rgba(232,98,42,0.08)',
          border: '1px solid rgba(232,98,42,0.2)',
          borderRadius: 12, padding: '20px 24px',
          marginTop: 32,
        }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: WHITE, marginBottom: 12 }}>
            💰 Your Partner Earnings
          </div>
          <div style={{ fontSize: 13, color: MUTED, marginBottom: 16 }}>
            You earn 25% royalty on every agent subscription, every month.
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: 16,
          }}>
            <div>
              <div style={{ fontSize: 11, color: MUTED }}>Current ({stats.totalAgents} agents)</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: ACCENT }}>${stats.totalRoyalty.toFixed(0)}/mo</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: MUTED }}>At 20 agents</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: WHITE }}>~$2,500/mo</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: MUTED }}>At 100 agents</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: WHITE }}>~$12,500/mo</div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

function StatCard({
  label, value, sub, valueColor = WHITE,
}: { label: string; value: string; sub: string; valueColor?: string }) {
  return (
    <div style={{
      background: 'rgba(27,79,187,0.08)',
      border: '1px solid rgba(27,79,187,0.2)',
      borderRadius: 12, padding: 20,
    }}>
      <div style={{
        fontSize: 10, fontWeight: 700, color: MUTED,
        textTransform: 'uppercase', letterSpacing: '0.08em',
      }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: valueColor, marginTop: 4 }}>{value}</div>
      <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>{sub}</div>
    </div>
  )
}

function SectionHeading({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <h2 style={{
      fontSize: 13, fontWeight: 700, color: MUTED,
      textTransform: 'uppercase', letterSpacing: '0.08em',
      margin: '0 0 12px 0',
      ...style,
    }}>{children}</h2>
  )
}
