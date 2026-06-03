import { cn } from '@/lib/utils'

type Trend = 'up' | 'down' | 'neutral'

export function KpiCard({ label, icon, value, sub, ctx, ctxTrend = 'up', accent }: {
  label: string
  icon?: React.ReactNode
  value: React.ReactNode
  sub?: React.ReactNode
  ctx?: React.ReactNode
  ctxTrend?: Trend
  accent?: 'orange' | 'green'
}) {
  const valColor = accent === 'orange' ? 'text-orange' : accent === 'green' ? 'text-green' : 'text-text'
  const ctxColor = ctxTrend === 'up' ? 'text-green' : ctxTrend === 'down' ? 'text-red' : 'text-white/30'
  return (
    <div className="relative overflow-hidden rounded-[var(--r)] border border-line bg-card p-[17px_20px] shadow-[0_1px_4px_rgba(0,0,0,.28)]">
      <div className="flex items-center gap-[7px] text-[11.5px] font-semibold uppercase tracking-[.06em] text-dim">
        {icon}<span>{label}</span>
      </div>
      <div className={cn('tnum mt-[11px] text-4xl font-extrabold leading-none tracking-[-1.5px]', valColor)}>{value}</div>
      {sub && <div className="mt-1.5 flex items-center gap-1.5 text-[11.5px] text-dim">{sub}</div>}
      {ctx && <span className={cn('mt-1.5 block text-[11px]', ctxColor)}>{ctx}</span>}
    </div>
  )
}
