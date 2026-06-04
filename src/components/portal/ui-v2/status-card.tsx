'use client'

import { ReactNode } from 'react'
import { cn } from '@/lib/utils'

const WAVE_BARS = 40

export interface StatusRow {
  label: string
  value: ReactNode
}

interface StatusCardProps {
  title?: string
  rows: StatusRow[]
  className?: string
}

export function StatusCard({
  title = 'Receptionist on duty',
  rows,
  className,
}: StatusCardProps) {
  return (
    <div
      className={cn(
        'tm-status relative overflow-hidden rounded-[var(--r)] border border-[rgba(53,201,138,.2)] p-[18px_20px]',
        className
      )}
    >
      {/* Header with pulsing green dot */}
      <div className="mb-[14px] flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-[15px] font-[700] tracking-[-0.2px]">
          {/* Pulsing dot — replicates dashboard .dot with tm-pulse halo */}
          <span className="relative flex-shrink-0">
            <span className="block h-[7px] w-[7px] rounded-full bg-green" />
            <span
              className="absolute inset-[-4px] rounded-full bg-green opacity-40"
              style={{ animation: 'tm-pulse 1.8s ease-out infinite' }}
              aria-hidden="true"
            />
          </span>
          {title}
        </h2>
      </div>

      {/* Waveform — 40 bars staggered by 0.06s each */}
      <div
        className="mb-[12px] mt-1 flex h-[28px] items-center gap-[3px]"
        aria-hidden="true"
      >
        {Array.from({ length: WAVE_BARS }).map((_, i) => (
          <span
            key={i}
            className="h-1.5 w-[3px] rounded-[2px] bg-green opacity-80"
            style={{
              animation: 'tm-wave 1.1s ease-in-out infinite',
              animationDelay: `${(i * 0.06).toFixed(2)}s`,
            }}
          />
        ))}
      </div>

      {/* Status rows */}
      {rows.map((row, i) => (
        <div
          key={i}
          className="flex items-center justify-between gap-3 border-t border-line py-[8px] text-[12.5px]"
        >
          <span className="text-dim">{row.label}</span>
          <b className="font-[700]">{row.value}</b>
        </div>
      ))}
    </div>
  )
}
