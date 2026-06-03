'use client'

import { Plus } from 'lucide-react'
import { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Tag, TagVariant } from '@/components/portal/ui-v2/tag'

// ─── KanbanBoard ────────────────────────────────────────────────────────────
// Horizontal-scroll flex row of columns
export interface KanbanBoardProps {
  children: ReactNode
  className?: string
}

export function KanbanBoard({ children, className }: KanbanBoardProps) {
  return (
    <div
      className={cn(
        'flex gap-3 overflow-x-auto pb-4 scrollbar-none',
        className,
      )}
    >
      {children}
    </div>
  )
}

// ─── KanbanColumn ───────────────────────────────────────────────────────────
// Fixed-width flex column with header + card body + optional "Add lead" footer
export interface KanbanColumnProps {
  title: string
  count: number
  tone?: 'default' | 'won' | 'lost'
  /** Color for the column title, e.g. "var(--color-faint)" */
  titleColor?: string
  onAddLead?: () => void
  children: ReactNode
  className?: string
}

export function KanbanColumn({
  title,
  count,
  tone = 'default',
  titleColor,
  onAddLead,
  children,
  className,
}: KanbanColumnProps) {
  return (
    <div
      className={cn(
        'flex-shrink-0 w-[260px] flex flex-col',
        tone === 'lost' && 'opacity-50',
        className,
      )}
    >
      {/* .col-head */}
      <div className="flex items-center justify-between px-1 pb-[10px]">
        <span
          className="text-xs font-[800] uppercase tracking-[.1em]"
          style={{ color: titleColor ?? 'var(--color-faint)' }}
        >
          {title}
        </span>
        <span className="text-[11px] font-bold px-[7px] py-0.5 rounded-md bg-card text-dim">
          {count}
        </span>
      </div>

      {/* .col-body */}
      <div className="flex flex-col gap-2 flex-1">
        {children}

        {/* "Add lead" dashed footer */}
        {onAddLead && (
          <button
            onClick={onAddLead}
            className="flex items-center justify-center gap-1.5 px-3 py-[10px] border border-dashed border-line-strong rounded-[10px] text-faint text-[12.5px] font-semibold hover:border-orange/40 hover:text-orange transition-colors cursor-pointer"
          >
            <Plus className="w-[13px] h-[13px]" />
            Add lead
          </button>
        )}
      </div>
    </div>
  )
}

// ─── KanbanCard (.lcard) ────────────────────────────────────────────────────
// bg-card, border-line, rounded-lg, p-3; optional accent / wonBadge
export interface KanbanCardProps {
  business: string
  contact?: string
  plan?: string
  tag?: { variant: TagVariant; label: string }
  meta?: string        // e.g. "2h ago"
  accent?: 'hot' | 'warm'   // hot = orange left border, warm = gold
  wonBadge?: boolean
  onClick?: () => void
  className?: string
}

export function KanbanCard({
  business,
  contact,
  plan,
  tag,
  meta,
  accent,
  wonBadge,
  onClick,
  className,
}: KanbanCardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'bg-card border border-line rounded-xl p-3 cursor-pointer transition-all hover:border-orange/30 hover:-translate-y-px relative',
        accent === 'hot' && 'border-l-[3px] border-l-orange',
        accent === 'warm' && 'border-l-[3px] border-l-gold',
        className,
      )}
    >
      {/* Won badge */}
      {wonBadge && (
        <span className="absolute top-[10px] right-[10px] text-[10.5px] font-[800] px-2 py-0.5 rounded-[7px] bg-[rgba(53,201,138,.18)] text-green">
          ✓ Won
        </span>
      )}

      {/* Business name */}
      <div className="text-[13.5px] font-[800] mb-1 truncate pr-14">{business}</div>

      {/* Contact */}
      {contact && (
        <div className="text-xs text-dim mb-1.5 truncate">{contact}</div>
      )}

      {/* Plan */}
      {plan && (
        <div className="text-[11.5px] font-bold text-orange">{plan}</div>
      )}

      {/* Footer: industry tag + days-ago */}
      {(tag || meta) && (
        <div className="flex items-center gap-[7px] mt-[7px] flex-wrap">
          {tag && (
            <Tag variant={tag.variant} className="text-[10px] uppercase tracking-[.05em]">
              {tag.label}
            </Tag>
          )}
          {meta && (
            <span className="text-[10.5px] text-faint ml-auto">{meta}</span>
          )}
        </div>
      )}
    </div>
  )
}
