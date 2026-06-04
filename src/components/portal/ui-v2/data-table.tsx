'use client'

import { ReactNode } from 'react'
import { cn } from '@/lib/utils'

// ─── DataTable (customers .tbl-head / .trow) ───────────────────────────────
// Generic grid table — caller supplies column config + renderCell

export interface DataTableColumn {
  key: string
  label: string
  align?: 'left' | 'right'
  width?: string   // CSS column width, e.g. "1fr", "130px", "80px"
}

export interface DataTableProps<T> {
  columns: DataTableColumn[]
  rows: T[]
  renderCell: (row: T, colKey: string) => ReactNode
  getRowKey: (row: T) => string
  selectedKey?: string
  onRowClick?: (row: T) => void
  className?: string
}

export function DataTable<T>({
  columns,
  rows,
  renderCell,
  getRowKey,
  selectedKey,
  onRowClick,
  className,
}: DataTableProps<T>) {
  const gridCols = columns.map((c) => c.width ?? '1fr').join(' ')

  return (
    <div className={cn('overflow-y-auto scrollbar-none', className)}>
      {/* Sticky header */}
      <div
        className="grid gap-[14px] px-6 py-3 border-b border-line sticky top-0 bg-[var(--color-sidebar,var(--color-bg))] z-10"
        style={{ gridTemplateColumns: gridCols }}
      >
        {columns.map((col) => (
          <div
            key={col.key}
            className={cn(
              'text-[11.5px] font-bold uppercase tracking-[.06em] text-faint',
              col.align === 'right' && 'text-right',
            )}
          >
            {col.label}
          </div>
        ))}
      </div>

      {/* Rows */}
      {rows.map((row) => {
        const key = getRowKey(row)
        const selected = key === selectedKey
        return (
          <div
            key={key}
            onClick={() => onRowClick?.(row)}
            className={cn(
              'grid gap-[14px] px-6 py-[14px] border-b border-line items-center transition-colors',
              onRowClick && 'cursor-pointer',
              selected
                ? 'border-l-[3px] border-l-orange bg-[rgba(238,106,44,.06)]'
                : 'hover:bg-white/[.025]',
            )}
            style={{ gridTemplateColumns: gridCols }}
          >
            {columns.map((col) => (
              <div
                key={col.key}
                className={cn(col.align === 'right' && 'text-right')}
              >
                {renderCell(row, col.key)}
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}
