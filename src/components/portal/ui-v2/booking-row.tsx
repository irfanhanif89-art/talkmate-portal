import { cn } from '@/lib/utils'

// ─── BookingRow (dashboard .bk) ────────────────────────────────────────────
// Flex row: .when block | .ln vertical bar | info block | .valtag
export interface BookingRowProps {
  time: string        // e.g. "9:00"
  meridiem: string    // e.g. "AM"
  job: string
  customer: string
  value: string       // e.g. "$1,200"
  now?: boolean       // if true, bar is orange instead of line-strong
  className?: string
}

export function BookingRow({ time, meridiem, job, customer, value, now, className }: BookingRowProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-[11px] py-[10px] border-b border-line last:border-b-0',
        className,
      )}
    >
      {/* .when */}
      <div className="flex-shrink-0 w-[46px] text-center">
        <div className="text-[14px] font-[800] tracking-tight">{time}</div>
        <div className="text-[10px] text-faint">{meridiem}</div>
      </div>

      {/* .ln — vertical bar */}
      <div
        className={cn(
          'w-0.5 rounded-sm self-stretch',
          now ? 'bg-orange' : 'bg-line-strong',
        )}
      />

      {/* info */}
      <div className="flex-1 min-w-0">
        <div className="text-[13.5px] font-bold truncate">{job}</div>
        <div className="text-[11.5px] text-dim mt-0.5">{customer}</div>
      </div>

      {/* .valtag */}
      <span className="text-xs font-bold text-green ml-auto flex-shrink-0">{value}</span>
    </div>
  )
}

// ─── DayJobRow (bookings .ddj) ─────────────────────────────────────────────
// Similar layout: time block | colored bar | info | value
export interface DayJobRowProps {
  time: string        // e.g. "9:00"
  meridiem: string    // e.g. "AM"
  barColor?: string   // CSS color, e.g. "var(--orange)" or a Tailwind arbitrary
  title: string
  customer: string
  value: string
  className?: string
}

export function DayJobRow({ time, meridiem, barColor, title, customer, value, className }: DayJobRowProps) {
  return (
    <div
      className={cn(
        'flex gap-[14px] py-[14px] border-b border-line last:border-b-0 items-center',
        className,
      )}
    >
      {/* .tm */}
      <div className="w-12 flex-shrink-0 text-center">
        <div className="text-[15px] font-[800] tracking-tight">{time}</div>
        <div className="text-[10.5px] text-faint">{meridiem}</div>
      </div>

      {/* .bar */}
      <div
        className="w-[3px] rounded-sm self-stretch flex-shrink-0"
        style={{ background: barColor ?? 'var(--color-orange)' }}
      />

      {/* .info */}
      <div className="flex-1 min-w-0">
        <div className="text-[14px] font-bold truncate">{title}</div>
        <div className="text-xs text-dim mt-0.5 truncate">{customer}</div>
      </div>

      {/* .vt */}
      <span className="text-[13px] font-bold text-green flex-shrink-0">{value}</span>
    </div>
  )
}
