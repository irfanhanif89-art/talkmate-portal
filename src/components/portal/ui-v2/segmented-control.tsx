'use client'
import { cn } from '@/lib/utils'

export function SegmentedControl<T extends string>({ options, value, onChange, className }: {
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
  className?: string
}) {
  return (
    <div className={cn('inline-flex gap-0.5 rounded-lg border border-line bg-bg p-[3px]', className)}>
      {options.map((o) => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)}
          className={cn('rounded-md px-2.5 py-[5px] text-[11.5px] font-semibold transition',
            value === o.value ? 'bg-card-2 text-text' : 'bg-transparent text-dim hover:text-text')}>
          {o.label}
        </button>
      ))}
    </div>
  )
}
