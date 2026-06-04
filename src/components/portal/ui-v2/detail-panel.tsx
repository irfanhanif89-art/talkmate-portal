import { ReactNode } from 'react'
import { cn } from '@/lib/utils'

// ─── DetailPanel ────────────────────────────────────────────────────────────
// Right-rail container: bg-card, border, radius, shadow, padding
export interface DetailPanelProps {
  header?: ReactNode
  children: ReactNode
  className?: string
}

export function DetailPanel({ header, children, className }: DetailPanelProps) {
  return (
    <div
      className={cn(
        'bg-card border border-line rounded-[var(--r)] shadow-[0_1px_4px_rgba(0,0,0,.28)] flex flex-col overflow-hidden',
        className,
      )}
    >
      {header && (
        <div className="flex-shrink-0 border-b border-line">{header}</div>
      )}
      <div className="flex-1 overflow-y-auto scrollbar-none">{children}</div>
    </div>
  )
}

// ─── StatGrid (customers .cps) ─────────────────────────────────────────────
// 2-col grid of stat cells
export interface StatGridStat {
  value: ReactNode
  label: string
  green?: boolean   // applies text-green to value
}

export interface StatGridProps {
  stats: StatGridStat[]
  className?: string
}

export function StatGrid({ stats, className }: StatGridProps) {
  return (
    <div className={cn('grid grid-cols-2 gap-[10px] p-[18px]', className)}>
      {stats.map((s, i) => (
        <div
          key={i}
          className="bg-card-2 border border-line rounded-xl p-3 shadow-[0_1px_4px_rgba(0,0,0,.28)]"
        >
          <div
            className={cn(
              'tnum text-[18px] font-[800] tracking-tight',
              s.green && 'text-green',
            )}
          >
            {s.value}
          </div>
          <div className="text-xs text-dim mt-[3px]">{s.label}</div>
        </div>
      ))}
    </div>
  )
}

// ─── HistoryRow (customers .hist-row) ──────────────────────────────────────
// Icon dot | title + meta | optional $value
export interface HistoryRowProps {
  icon?: ReactNode
  iconColor?: string  // background color for the icon wrapper, e.g. "rgba(238,106,44,.14)"
  title: string
  meta: string
  value?: string
  className?: string
}

export function HistoryRow({ icon, iconColor, title, meta, value, className }: HistoryRowProps) {
  return (
    <div
      className={cn(
        'flex gap-3 py-[11px] border-b border-line last:border-b-0 items-center',
        className,
      )}
    >
      {/* icon wrapper */}
      {icon && (
        <div
          className="w-8 h-8 rounded-[9px] flex items-center justify-center flex-shrink-0"
          style={{ background: iconColor }}
        >
          {icon}
        </div>
      )}

      {/* text */}
      <div className="flex-1 min-w-0">
        <div className="text-[13.5px] font-bold truncate">{title}</div>
        <div className="text-xs text-dim mt-0.5">{meta}</div>
      </div>

      {/* value */}
      {value && (
        <span className="text-[13px] font-bold text-green flex-shrink-0">{value}</span>
      )}
    </div>
  )
}
