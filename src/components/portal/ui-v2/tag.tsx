import { cn } from '@/lib/utils'

const TAG = {
  book: 'bg-green-soft text-green',
  quote: 'bg-[rgba(238,106,44,.14)] text-orange',
  question: 'bg-[rgba(91,155,217,.14)] text-blue',
  emergency: 'bg-[rgba(240,98,90,.16)] text-red',
  missed: 'bg-[rgba(240,98,90,.16)] text-red',
  transfer: 'bg-[rgba(242,181,60,.14)] text-gold',
} as const

export type TagVariant = keyof typeof TAG

export function Tag({ variant, children, className }: { variant: TagVariant; children: React.ReactNode; className?: string }) {
  return <span className={cn('inline-block rounded-md px-2 py-0.5 text-[10.5px] font-bold tracking-[.02em] whitespace-nowrap', TAG[variant], className)}>{children}</span>
}
