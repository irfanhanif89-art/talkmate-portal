'use client'
import { cn } from '@/lib/utils'

// Filter chips (from catalog.html .chip/.chip.on).
// Active:  bg-[rgba(238,106,44,.12)] + border-[rgba(238,106,44,.4)] + text-text
// Inactive: bg-card + border-line + text-dim
// Shape: rounded-[8px], padding 5px 12px, 12.5px/600

export function Chips<T extends string>({ chips, value, onChange, className }: {
  chips: { value: T; label: string; count?: number }[]
  value: T
  onChange: (v: T) => void
  className?: string
}) {
  return (
    <div className={cn('flex gap-1.5', className)}>
      {chips.map((c) => (
        <button
          key={c.value}
          type="button"
          onClick={() => onChange(c.value)}
          className={cn(
            'rounded-[8px] border px-3 py-[5px] text-[12.5px] font-semibold transition whitespace-nowrap',
            value === c.value
              ? 'bg-[rgba(238,106,44,.12)] border-[rgba(238,106,44,.4)] text-text'
              : 'bg-card border-line text-dim hover:text-text',
          )}
        >
          {c.label}
          {c.count !== undefined && (
            <span className="ml-1.5 font-mono text-[10.5px] opacity-60">{c.count}</span>
          )}
        </button>
      ))}
    </div>
  )
}
