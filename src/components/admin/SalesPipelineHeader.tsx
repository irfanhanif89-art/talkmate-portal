'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw, Pencil } from 'lucide-react'
import { formatSprintRange, formatCurrency } from '@/lib/sales-format'
import EditSprintModal from './EditSprintModal'

interface Props {
  sprintStart: string | null
  sprintEnd: string | null
  mrrTarget: number | null
  closedMrr: number
  lastRefreshedIso: string
}

export default function SalesPipelineHeader({
  sprintStart, sprintEnd, mrrTarget, closedMrr, lastRefreshedIso,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [editing, setEditing] = useState(false)

  const target = mrrTarget ?? 0
  const remaining = Math.max(0, target - closedMrr)
  const progressPct = target > 0 ? Math.min(100, Math.round((closedMrr / target) * 100)) : 0

  function refresh() {
    startTransition(() => router.refresh())
  }

  function lastRefreshedLabel(): string {
    const d = new Date(lastRefreshedIso)
    return Number.isNaN(d.getTime())
      ? '—'
      : d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', timeZone: 'Australia/Brisbane' })
  }

  return (
    <>
      <div style={{
        background: '#0A1E38', border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 14, padding: 22, marginBottom: 18,
        color: 'white', fontFamily: 'Outfit, sans-serif',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 18 }}>
          <div>
            <div style={{
              fontSize: 11, fontWeight: 800, color: '#E8622A',
              letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6,
            }}>Sales pipeline</div>
            <div style={{ fontSize: 13, color: '#7BAED4' }}>
              Sprint: <strong style={{ color: 'white' }}>{formatSprintRange(sprintStart, sprintEnd)}</strong>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setEditing(true)}
              style={iconBtn}
              title="Edit sprint dates and target"
            >
              <Pencil size={13} />
              Edit sprint
            </button>
            <button
              onClick={refresh}
              disabled={isPending}
              style={{ ...iconBtn, background: isPending ? '#7a4a2a' : '#E8622A', color: 'white', border: 'none' }}
              title="Reload data from the database"
            >
              <RefreshCw size={13} style={{ animation: isPending ? 'spin 1s linear infinite' : undefined }} />
              {isPending ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>

        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginBottom: 16,
        }}>
          <Stat label="MRR closed this sprint" value={formatCurrency(closedMrr)} accent="#22c55e" />
          <Stat label="Remaining to target" value={formatCurrency(remaining)} accent="#E8622A" />
          <Stat label="MRR target" value={target > 0 ? formatCurrency(target) : '—'} accent="#7BAED4" />
        </div>

        <div style={{ marginBottom: 6 }}>
          <div style={{
            height: 10, background: 'rgba(255,255,255,0.06)', borderRadius: 999, overflow: 'hidden',
          }}>
            <div style={{
              height: '100%', width: `${progressPct}%`,
              background: progressPct >= 100 ? '#22c55e' : '#E8622A',
              transition: 'width 300ms ease',
            }} />
          </div>
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            fontSize: 11, color: '#7BAED4', marginTop: 6,
          }}>
            <span>{progressPct}% of target</span>
            <span>Last refreshed: {lastRefreshedLabel()}</span>
          </div>
        </div>
      </div>

      {editing && (
        <EditSprintModal
          currentStart={sprintStart}
          currentEnd={sprintEnd}
          currentTarget={mrrTarget}
          onClose={() => setEditing(false)}
          onSaved={() => { startTransition(() => router.refresh()) }}
        />
      )}

      <style jsx>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div>
      <div style={{
        fontSize: 10, fontWeight: 800, color: accent,
        letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4,
      }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: 'white' }}>{value}</div>
    </div>
  )
}

const iconBtn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6,
  padding: '8px 12px', borderRadius: 8,
  background: 'transparent', color: '#7BAED4',
  border: '1px solid rgba(255,255,255,0.12)',
  fontSize: 12, fontWeight: 600, cursor: 'pointer',
  fontFamily: 'Outfit, sans-serif',
}
