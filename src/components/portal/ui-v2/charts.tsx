'use client'

import { ReactNode } from 'react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  Cell,
  Tooltip,
} from 'recharts'
import { cn } from '@/lib/utils'

// ─────────────────────────────────────────────────────────────────────────────
// VolumeBarChart
// Dashboard stacked call-volume bar chart.
// Matches .chart / .bar / .stack / .esc pattern from dashboard-command-center.html
// ─────────────────────────────────────────────────────────────────────────────

interface VolumeBarChartProps {
  data: { label: string; handled: number; escalated: number }[]
  height?: number
}

// Custom tooltip styled with bg-card / border-line tokens
function VolumeTooltip({ active, payload, label }: {
  active?: boolean
  payload?: { value: number; name: string }[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div
      className="rounded-[10px] border border-line bg-card px-3 py-2 text-[12px] shadow-[0_4px_16px_rgba(0,0,0,.4)]"
    >
      <div className="mb-1 font-semibold text-text">{label}</div>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2 text-dim">
          <span
            className="inline-block size-2 rounded-[2px]"
            style={{
              background:
                p.name === 'handled'
                  ? 'linear-gradient(180deg,#f4843f,#e85f24)'
                  : 'var(--red)',
            }}
          />
          <span className="capitalize">{p.name}</span>
          <span className="ml-auto tnum font-bold text-text">{p.value}</span>
        </div>
      ))}
    </div>
  )
}

export function VolumeBarChart({ data, height = 160 }: VolumeBarChartProps) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 4, right: 0, left: 0, bottom: 0 }}
          barCategoryGap="30%"
        >
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 10, fill: 'var(--faint)' }}
          />
          <Tooltip
            content={<VolumeTooltip />}
            cursor={{ fill: 'rgba(255,255,255,.04)', radius: 4 }}
          />
          {/* Handled — orange gradient (bottom of stack) */}
          <Bar
            dataKey="handled"
            stackId="a"
            fill="url(#orangeGrad)"
            radius={[0, 0, 3, 3]}
            isAnimationActive={false}
          />
          {/* Escalated — red (top of stack, rounded top corners) */}
          <Bar
            dataKey="escalated"
            stackId="a"
            fill="var(--red)"
            radius={[5, 5, 0, 0]}
            isAnimationActive={false}
          />
          {/* SVG gradient def */}
          <defs>
            <linearGradient id="orangeGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f4843f" />
              <stop offset="100%" stopColor="#e85f24" />
            </linearGradient>
          </defs>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// LineVolumeChart
// Analytics 30-day bar chart with optional highlighted bar.
// Matches .linechart / .lbar / .lbar.hi from analytics.html
// ─────────────────────────────────────────────────────────────────────────────

interface LineVolumeChartProps {
  data: { label: string; value: number }[]
  highlightIndex?: number
  height?: number
}

export function LineVolumeChart({
  data,
  highlightIndex,
  height = 170,
}: LineVolumeChartProps) {
  // If no explicit highlightIndex, treat the max-value bar as highlighted
  const resolvedHighlight =
    highlightIndex ??
    data.reduce(
      (maxIdx, d, i, arr) => (d.value > arr[maxIdx].value ? i : maxIdx),
      0,
    )

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 6, right: 0, left: 0, bottom: 0 }}
          barCategoryGap="18%"
        >
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 9.5, fill: 'var(--faint)' }}
            interval={4}
          />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null
              return (
                <div className="rounded-[10px] border border-line bg-card px-3 py-2 text-[12px] shadow-[0_4px_16px_rgba(0,0,0,.4)]">
                  <div className="text-dim">{label}</div>
                  <div className="tnum font-bold text-text">
                    {payload[0].value} calls
                  </div>
                </div>
              )
            }}
            cursor={{ fill: 'rgba(255,255,255,.04)', radius: 4 }}
          />
          <Bar dataKey="value" radius={[3, 3, 0, 0]} isAnimationActive={false}>
            {data.map((_, i) => (
              <Cell
                key={i}
                fill={
                  i === resolvedHighlight
                    ? 'url(#orangeGradLV)'
                    : 'rgba(91,155,217,0.55)'
                }
              />
            ))}
          </Bar>
          <defs>
            <linearGradient id="orangeGradLV" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f4843f" />
              <stop offset="100%" stopColor="rgba(238,106,44,0.3)" />
            </linearGradient>
          </defs>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// OutcomeBars
// Horizontal percentage bars — lightweight, no Recharts.
// Matches .outbars / .outbar-row / .outbar-track / .outbar-fill from analytics.html
// ─────────────────────────────────────────────────────────────────────────────

interface OutcomeBarsProps {
  rows: { label: string; pct: number; color?: string }[]
}

export function OutcomeBars({ rows }: OutcomeBarsProps) {
  return (
    <div className="flex flex-col gap-2.5 pt-1">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center gap-2.5">
          {/* Label */}
          <span className="w-[90px] shrink-0 text-[12px] text-dim">
            {row.label}
          </span>
          {/* Track */}
          <div className="flex-1 overflow-hidden rounded-full bg-[var(--card-2)] h-2">
            {/* Fill */}
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.min(100, Math.max(0, row.pct))}%`,
                background: row.color ?? 'var(--orange)',
              }}
            />
          </div>
          {/* Value */}
          <span
            className="tnum w-9 shrink-0 text-right text-[12px] font-bold"
            style={{ color: row.color ?? 'var(--orange)' }}
          >
            {row.pct}%
          </span>
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Heatmap
// Peak hours heatmap grid — lightweight, no Recharts.
// Matches .heatmap / .hm-cell from analytics.html
// ─────────────────────────────────────────────────────────────────────────────

interface HeatmapProps {
  days: string[]      // 7 day labels e.g. ['Mon','Tue',...]
  hours: string[]     // N hour labels e.g. ['7a','8a',...] (12 typical)
  values: number[][]  // 7 × N, each 0..1 intensity
}

export function Heatmap({ days, hours, values }: HeatmapProps) {
  const N = hours.length
  return (
    <div
      className="grid gap-[3px] pt-0.5"
      style={{ gridTemplateColumns: `32px repeat(${N}, 1fr)` }}
    >
      {/* Top-left empty corner cell */}
      <div />
      {/* Hour labels */}
      {hours.map((h) => (
        <div
          key={h}
          className="text-center"
          style={{ fontSize: 9, color: 'var(--faint)' }}
        >
          {h}
        </div>
      ))}

      {/* Day rows */}
      {days.map((day, di) => (
        <>
          {/* Day label */}
          <div
            key={`day-${day}`}
            className="flex h-5 items-center"
            style={{ fontSize: 10, color: 'var(--faint)' }}
          >
            {day}
          </div>
          {/* Cells */}
          {Array.from({ length: N }, (_, hi) => {
            const intensity = values[di]?.[hi] ?? 0
            // Clamp: always show at least a faint card-2 shade when 0
            const bg =
              intensity < 0.05
                ? 'var(--card-2)'
                : `rgba(238,106,44,${intensity.toFixed(2)})`
            return (
              <div
                key={`${di}-${hi}`}
                className="aspect-square rounded-[3px]"
                style={{ background: bg, height: 20 }}
                title={`${day} ${hours[hi]}`}
              />
            )
          })}
        </>
      ))}
    </div>
  )
}
