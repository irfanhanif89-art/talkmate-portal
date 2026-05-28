'use client'

import { SCHED_COLORS, type SchedulerDriver } from './types'

// =====================================================================
// DriverFilterRow — horizontal cards at the top of the scheduler.
//
// Cards (tappable, one active at a time):
//   - All drivers — total job count badge
//   - Unassigned — yellow badge, hidden when count is zero
//   - One per active driver — initials avatar, name, job count badge
//
// Active card: orange border + light orange background tint.
//
// Distinct from swimlanes (which split each day column into per-driver
// sub-columns). The filter narrows the grid to ONE driver; swimlanes
// show everyone side-by-side.
//
// Brief §6a.
// =====================================================================

interface Props {
  drivers: SchedulerDriver[]
  /** null = "All", '__unassigned__' = "Unassigned", else driver id. */
  selected: string | null
  counts: {
    all: number
    unassigned: number
    byDriver: Record<string, number>
  }
  onSelect: (next: string | null) => void
}

function initialsOf(driver: SchedulerDriver): string {
  if (driver.initials) return driver.initials
  const parts = (driver.name ?? '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '??'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function cardStyle(active: boolean) {
  return {
    minWidth: 140,
    padding: '10px 12px',
    borderRadius: 10,
    border: active
      ? `1.5px solid ${SCHED_COLORS.ORANGE}`
      : `1px solid ${SCHED_COLORS.GRID_LINE_STRONG}`,
    background: active
      ? 'rgba(232,98,42,0.10)'
      : SCHED_COLORS.CARD_BG,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    transition: 'background 0.12s ease, border-color 0.12s ease',
    flexShrink: 0,
  } as const
}

export default function DriverFilterRow({
  drivers,
  selected,
  counts,
  onSelect,
}: Props) {
  const activeKey =
    selected === null ? 'all' : selected === '__unassigned__' ? 'unassigned' : selected

  return (
    <div
      style={{
        display: 'flex',
        gap: 10,
        overflowX: 'auto',
        paddingBottom: 4,
        marginBottom: 12,
      }}
      role="tablist"
      aria-label="Filter by driver"
    >
      <button
        role="tab"
        aria-selected={activeKey === 'all'}
        onClick={() => onSelect(null)}
        style={cardStyle(activeKey === 'all')}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 99,
            background: 'rgba(74,159,232,0.18)',
            color: '#4A9FE8',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          ALL
        </div>
        <div style={{ flex: 1, textAlign: 'left' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#F2F6FB' }}>
            All drivers
          </div>
          <div style={{ fontSize: 10, color: SCHED_COLORS.TEXT_DIM }}>
            {counts.all} {counts.all === 1 ? 'job' : 'jobs'}
          </div>
        </div>
      </button>

      {counts.unassigned > 0 && (
        <button
          role="tab"
          aria-selected={activeKey === 'unassigned'}
          onClick={() => onSelect('__unassigned__')}
          style={cardStyle(activeKey === 'unassigned')}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 99,
              background: 'rgba(245,158,11,0.18)',
              color: '#F59E0B',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 14,
              fontWeight: 700,
            }}
          >
            ?
          </div>
          <div style={{ flex: 1, textAlign: 'left' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#F2F6FB' }}>
              Unassigned
            </div>
            <div
              style={{
                fontSize: 10,
                color: '#F59E0B',
                fontWeight: 700,
              }}
            >
              {counts.unassigned} {counts.unassigned === 1 ? 'job' : 'jobs'}
            </div>
          </div>
        </button>
      )}

      {drivers.map((d) => {
        const count = counts.byDriver[d.id] ?? 0
        const isActive = activeKey === d.id
        return (
          <button
            key={d.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => onSelect(d.id)}
            style={cardStyle(isActive)}
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 99,
                background: 'rgba(34,197,94,0.18)',
                color: '#22C55E',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              {initialsOf(d)}
            </div>
            <div style={{ flex: 1, textAlign: 'left' }}>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#F2F6FB',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  maxWidth: 120,
                }}
              >
                {d.name}
              </div>
              <div style={{ fontSize: 10, color: SCHED_COLORS.TEXT_DIM }}>
                {count} {count === 1 ? 'job' : 'jobs'}
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}
