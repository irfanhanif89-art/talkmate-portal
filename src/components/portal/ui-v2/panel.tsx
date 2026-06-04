import { cn } from '@/lib/utils'

export function Panel({ className, ...p }: React.ComponentProps<'div'>) {
  return <div className={cn('rounded-[var(--r)] border border-line bg-card p-[18px_20px] shadow-[0_1px_4px_rgba(0,0,0,.28)]', className)} {...p} />
}

export function PanelHeader({ title, meta, action, className }: { title: React.ReactNode; meta?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('mb-3.5 flex items-center justify-between', className)}>
      <h2 className="text-[15px] font-bold tracking-[-.2px] text-text">{title}</h2>
      {meta && <span className="text-xs text-dim">{meta}</span>}
      {action}
    </div>
  )
}
