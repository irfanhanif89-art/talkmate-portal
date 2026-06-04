'use client'

import { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface StatItem {
  value: ReactNode
  label: string
  color?: string
}

interface StatsBarProps {
  stats: StatItem[]
  className?: string
}

export function StatsBar({ stats, className }: StatsBarProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-0 border-b border-line bg-card overflow-x-auto',
        className
      )}
    >
      {stats.map((stat, i) => (
        <div
          key={i}
          className={cn(
            'flex flex-1 flex-col gap-[2px] px-5 py-4',
            i === 0 && 'pl-7',
            i < stats.length - 1 && 'border-r border-line'
          )}
        >
          <div
            className="tnum text-[21px] font-[800] leading-none tracking-[-0.5px]"
            style={stat.color ? { color: stat.color } : undefined}
          >
            {stat.value}
          </div>
          <div className="text-[11px] uppercase tracking-[.07em] text-faint">
            {stat.label}
          </div>
        </div>
      ))}
    </div>
  )
}
