'use client'

// Self-fetching dashboard widget — Session 9.
//   - Two stat cards (pending bookings + pending callbacks) linking to
//     their respective queues.
//   - A "Recent outcomes" row showing the last 5 calls with outcome
//     badges so the operator can see what the agent actually did with
//     recent calls at a glance.
//
// Rendered at the top of the dashboard alongside TrialProgressCard.

import { useEffect, useState } from 'react'

interface RecentCall {
  id: string
  caller_number: string | null
  outcome: string | null
  transfer_to: string | null
  is_vip_caller: boolean
  is_repeat_caller: boolean
  created_at: string
}

const OUTCOME_STYLE: Record<string, { label: string; bg: string; color: string }> = {
  message_taken: { label: 'Message taken', bg: 'rgba(245,158,11,0.15)', color: '#F59E0B' },
  transferred: { label: 'Transferred', bg: 'rgba(34,197,94,0.15)', color: '#22C55E' },
  transfer_failed: { label: 'Transfer failed', bg: 'rgba(239,68,68,0.15)', color: '#EF4444' },
  booking_created: { label: 'Booking created', bg: 'rgba(74,159,232,0.15)', color: '#4A9FE8' },
  callback_scheduled: { label: 'Callback scheduled', bg: 'rgba(139,92,246,0.15)', color: '#8B5CF6' },
  vip_transferred: { label: 'VIP transferred', bg: 'rgba(232,98,42,0.15)', color: '#E8622A' },
  emergency_escalated: { label: 'Emergency', bg: 'rgba(239,68,68,0.20)', color: '#EF4444' },
  hung_up: { label: 'Hung up', bg: 'rgba(107,114,128,0.15)', color: '#9CA3AF' },
}

export default function ReceptionistStats({ recentCalls }: { recentCalls: RecentCall[] }) {
  const [pendingBookings, setPendingBookings] = useState<number | null>(null)
  const [pendingCallbacks, setPendingCallbacks] = useState<number | null>(null)

  useEffect(() => {
    let mounted = true
    Promise.all([
      fetch('/api/portal/bookings?status=pending').then(r => r.ok ? r.json() : { bookings: [] }).catch(() => ({ bookings: [] })),
      fetch('/api/portal/callbacks?status=pending').then(r => r.ok ? r.json() : { callbacks: [] }).catch(() => ({ callbacks: [] })),
    ]).then(([b, c]) => {
      if (!mounted) return
      setPendingBookings((b.bookings ?? []).length)
      setPendingCallbacks((c.callbacks ?? []).length)
    })
    return () => { mounted = false }
  }, [])

  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 16 }}>
        <StatCard
          href="/bookings"
          label="Pending bookings"
          value={pendingBookings}
          accent="#4A9FE8"
        />
        <StatCard
          href="/callbacks"
          label="Pending callbacks"
          value={pendingCallbacks}
          accent="#8B5CF6"
        />
      </div>

      {recentCalls.length > 0 && (
        <div style={{
          background: '#0A1E38', border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 12, padding: 18,
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#7BAED4', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: 12 }}>
            Recent outcomes
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
            {recentCalls.slice(0, 5).map(c => {
              const style = c.outcome ? OUTCOME_STYLE[c.outcome] : null
              return (
                <div key={c.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px',
                  background: '#071829', borderRadius: 8, border: '1px solid rgba(255,255,255,0.04)',
                }}>
                  <span style={{ fontSize: 12, color: '#7BAED4', minWidth: 80 }}>
                    {new Date(c.created_at).toLocaleString('en-AU', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span style={{ fontSize: 13, color: 'white', flex: 1 }}>
                    {c.caller_number ?? 'Unknown caller'}
                    {c.is_vip_caller && <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 800, color: '#E8622A', letterSpacing: '0.05em' }}>VIP</span>}
                    {c.is_repeat_caller && !c.is_vip_caller && <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 800, color: '#F59E0B', letterSpacing: '0.05em' }}>REPEAT</span>}
                  </span>
                  {style ? (
                    <span style={{
                      fontSize: 10, fontWeight: 800, letterSpacing: '0.05em',
                      padding: '3px 8px', borderRadius: 99,
                      background: style.bg, color: style.color,
                      textTransform: 'uppercase' as const,
                    }}>{style.label}</span>
                  ) : (
                    <span style={{ fontSize: 11, color: '#7BAED4' }}>—</span>
                  )}
                  {c.transfer_to && (
                    <span style={{ fontSize: 11, color: '#7BAED4' }}>→ {c.transfer_to}</span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({
  href, label, value, accent,
}: {
  href: string
  label: string
  value: number | null
  accent: string
}) {
  return (
    <a href={href} style={{
      display: 'block', padding: 18, borderRadius: 12,
      background: '#0A1E38', border: '1px solid rgba(255,255,255,0.07)',
      textDecoration: 'none', fontFamily: 'Outfit, sans-serif',
      transition: 'border-color 0.15s',
    }}>
      <div style={{ height: 2, background: accent, marginLeft: -18, marginRight: -18, marginTop: -18, marginBottom: 12 }} />
      <div style={{ fontSize: 11, fontWeight: 700, color: '#7BAED4', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color: 'white', letterSpacing: '-0.5px' }}>
        {value === null ? '…' : value}
      </div>
      <div style={{ fontSize: 11, color: accent, fontWeight: 600, marginTop: 4 }}>
        View queue →
      </div>
    </a>
  )
}
