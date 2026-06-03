import { cn } from '@/lib/utils'

export function AiScoreBadge({ score, className }: { score: number | null | undefined; className?: string }) {
  // Render nothing when there is no intelligence score (null/undefined) or
  // when the caller explicitly passes the -1 sentinel to suppress the badge.
  if (score == null || score < 0) return null
  const tier = score >= 8 ? 'bg-green-soft text-green' : score >= 6 ? 'bg-[rgba(242,181,60,.14)] text-gold' : 'bg-[rgba(240,98,90,.16)] text-red'
  return <span className={cn('inline-flex items-center gap-1 rounded-md px-[7px] py-0.5 text-[10.5px] font-bold', tier, className)}>{score}/10</span>
}
