'use client'

import { ReactNode } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// Meter
// Billing usage gauge.
// Matches .meter-label / .meter-track / .meter-fill / .meter-sub from billing.html
// ─────────────────────────────────────────────────────────────────────────────

interface MeterProps {
  label: string
  value: number
  cap: number
  /** Optional content rendered below the track (e.g. pill chips) */
  pills?: ReactNode
}

export function Meter({ label, value, cap, pills }: MeterProps) {
  const pct = Math.min(100, cap > 0 ? (value / cap) * 100 : 0)

  // Colour shifts to red when >90% full
  const fillStyle =
    pct >= 90
      ? { background: 'var(--red)' }
      : { background: 'linear-gradient(90deg,#f58a42,#e86526)' }

  return (
    <div>
      {/* Label row */}
      <div className="mb-[9px] flex items-end justify-between text-[14px]">
        <span className="text-dim">{label}</span>
        <span className="flex items-baseline gap-1">
          <span className="tnum text-[19px] font-extrabold leading-none tracking-[-0.4px] text-text">
            {value.toLocaleString()}
          </span>
          <span className="text-[12.5px] text-dim">
            / {cap.toLocaleString()}
          </span>
        </span>
      </div>

      {/* Track */}
      <div className="h-[7px] overflow-hidden rounded-full bg-[var(--card-2)]">
        {/* Fill */}
        <div
          className="h-full rounded-full transition-[width] duration-300"
          style={{ width: `${pct}%`, ...fillStyle }}
        />
      </div>

      {/* Optional pills / sub-content */}
      {pills && (
        <div className="mt-[7px] flex flex-wrap items-center gap-2 text-[12px] text-dim">
          {pills}
        </div>
      )}
    </div>
  )
}
