'use client'

import { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface RevenueStripItem {
  value: ReactNode
  label: string
  sub?: string
  color?: string
}

export interface RevenueStripCta {
  title: string
  subtitle: string
  onClick?: () => void
}

interface RevenueStripProps {
  items: RevenueStripItem[]
  cta?: RevenueStripCta
  className?: string
}

export function RevenueStrip({ items, cta, className }: RevenueStripProps) {
  return (
    <div
      className={cn(
        'flex items-center rounded-[var(--r)] border border-[rgba(21,101,192,.25)] p-[14px_20px]',
        'bg-[linear-gradient(135deg,rgba(21,101,192,.15),rgba(238,106,44,.10))]',
        className
      )}
    >
      {items.map((item, i) => (
        <div
          key={i}
          className={cn(
            'flex flex-1 flex-col gap-[3px] px-5',
            i === 0 && 'pl-0',
            i < items.length - 1 && 'border-r border-line'
          )}
        >
          <div
            className="tnum text-[22px] font-[800] leading-none tracking-[-0.5px]"
            style={item.color ? { color: item.color } : undefined}
          >
            {item.value}
          </div>
          <div className="mt-[2px] text-[10px] uppercase tracking-[.08em] text-dim">
            {item.label}
          </div>
          {item.sub && (
            <div className="text-[10.5px] text-faint">
              {item.sub}
            </div>
          )}
        </div>
      ))}

      {cta && (
        <div className="flex-shrink-0 pl-5">
          <button
            type="button"
            onClick={cta.onClick}
            className={cn(
              'cursor-pointer rounded-[9px] border border-[rgba(238,106,44,.3)]',
              'bg-[rgba(238,106,44,.15)] px-[14px] py-[8px] text-center',
              'transition-opacity hover:opacity-80'
            )}
          >
            <span className="block text-[11px] font-[700] text-orange">
              {cta.title}
            </span>
            <span className="mt-[1px] block text-[10px] text-faint">
              {cta.subtitle}
            </span>
          </button>
        </div>
      )}
    </div>
  )
}
