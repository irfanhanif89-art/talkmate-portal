'use client'

import { Play } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Tag, TagVariant } from '@/components/portal/ui-v2/tag'
import { AiScoreBadge } from '@/components/portal/ui-v2/ai-score-badge'

// ─── CallRow (dashboard .call) ─────────────────────────────────────────────
// Grid: [56px 1fr auto], gap-3, items-center, border-b border-line
// Hover: bg-white/[.02]
export interface CallRowProps {
  time: string
  who: string
  desc: string
  score: number | null | undefined
  tag: { variant: TagVariant; label: string }
  duration: string
  onPlay?: () => void
  className?: string
}

export function CallRow({ time, who, desc, score, tag, duration, onPlay, className }: CallRowProps) {
  return (
    <div
      className={cn(
        'grid items-center gap-3 px-1.5 py-[11px] border-b border-line last:border-b-0 hover:bg-white/[.02] transition-colors',
        className,
      )}
      style={{ gridTemplateColumns: '56px 1fr auto' }}
    >
      {/* Col 1 — time */}
      <span className="mono text-xs text-dim">{time}</span>

      {/* Col 2 — who + desc */}
      <div className="min-w-0">
        <div className="text-sm font-bold leading-snug">{who}</div>
        <div className="text-xs text-dim mt-0.5 truncate max-w-[340px]">{desc}</div>
      </div>

      {/* Col 3 — score + tag + duration + play */}
      <div className="flex items-center gap-3 justify-end">
        <AiScoreBadge score={score} />
        <Tag variant={tag.variant}>{tag.label}</Tag>
        <span className="mono text-[11.5px] text-faint">{duration}</span>
        <button
          onClick={onPlay}
          className="w-7 h-7 rounded-lg bg-card-2 border border-line flex items-center justify-center text-text hover:bg-white/[.06] transition-colors cursor-pointer"
          aria-label="Play recording"
        >
          <Play className="w-3 h-3 fill-current" />
        </button>
      </div>
    </div>
  )
}

// ─── CallListRow (calls page .callrow) ─────────────────────────────────────
// Left-rail stacked row, selectable with orange left border
export interface CallListRowProps {
  who: string
  tag: { variant: TagVariant; label: string }
  preview: string
  time: string
  score: number | null | undefined
  revenue?: string
  duration: string
  selected?: boolean
  onClick?: () => void
  className?: string
}

export function CallListRow({
  who,
  tag,
  preview,
  time,
  score,
  revenue,
  duration,
  selected,
  onClick,
  className,
}: CallListRowProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'flex flex-col gap-1 px-[18px] py-[13px] border-b border-line cursor-pointer transition-colors relative',
        selected
          ? 'border-l-[3px] border-l-orange bg-[rgba(238,106,44,.07)]'
          : 'hover:bg-white/[.025]',
        className,
      )}
    >
      {/* Row 1: who + tag */}
      <div className="flex items-center gap-[9px]">
        <span className="text-[14px] font-bold flex-1 min-w-0 truncate">{who}</span>
        <Tag variant={tag.variant}>{tag.label}</Tag>
      </div>

      {/* Row 2: preview + time */}
      <div className="flex items-center gap-[7px]">
        <span className="text-xs text-dim flex-1 min-w-0 truncate">{preview}</span>
        <span className="mono text-[11.5px] text-faint whitespace-nowrap">{time}</span>
      </div>

      {/* Row 3: score + revenue + duration */}
      <div className="flex items-center gap-2 mt-0.5">
        <AiScoreBadge score={score} />
        {revenue && (
          <span className="text-[10.5px] font-bold text-orange">{revenue}</span>
        )}
        <span className="text-[11px] text-faint ml-auto">{duration}</span>
      </div>
    </div>
  )
}
