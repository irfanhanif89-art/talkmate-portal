'use client'
import { cn } from '@/lib/utils'

// ─── FilterTabs ──────────────────────────────────────────────────────────────
// Pill-style tabs with optional count badge (from calls.html .tabs/.tab).
// Active tab: bg-card-2 + text-text (matches .tab.on).
// Inactive: transparent bg, text-dim.
// Count: font-size 10.5px, opacity .7, DM Mono (matches .tab .cnt).

export function FilterTabs<T extends string>({ tabs, value, onChange, className }: {
  tabs: { value: T; label: string; count?: number }[]
  value: T
  onChange: (v: T) => void
  className?: string
}) {
  return (
    <div className={cn('flex gap-0.5 rounded-[10px] border border-line bg-card p-[3px]', className)}>
      {tabs.map((t) => (
        <button
          key={t.value}
          type="button"
          onClick={() => onChange(t.value)}
          className={cn(
            'rounded-[7px] px-3 py-[5px] text-[12.5px] font-semibold whitespace-nowrap transition',
            value === t.value ? 'bg-card-2 text-text' : 'bg-transparent text-dim hover:text-text',
          )}
        >
          {t.label}
          {t.count !== undefined && (
            <span className={cn(
              'ml-[3px] font-mono text-[10.5px]',
              value === t.value ? 'opacity-70' : 'opacity-50',
            )}>
              {t.count}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}

// ─── UnderlineTabs ───────────────────────────────────────────────────────────
// Text tabs with orange 3px underline on active (from receptionist.html .tb/.tb.on).
// Active: text-text + border-b-[3px] border-orange.
// Inactive: text-dim, border-b-[3px] border-transparent.
// Container has a full-width bottom border (border-b border-line).

export function UnderlineTabs<T extends string>({ tabs, value, onChange, className }: {
  tabs: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
  className?: string
}) {
  return (
    <div className={cn('flex items-center gap-0 border-b border-line', className)}>
      {tabs.map((t) => (
        <button
          key={t.value}
          type="button"
          onClick={() => onChange(t.value)}
          className={cn(
            'px-[18px] py-3 text-[14px] font-semibold whitespace-nowrap transition',
            '-mb-px border-b-[3px]',
            value === t.value
              ? 'text-text border-orange'
              : 'text-dim border-transparent hover:text-text',
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}
