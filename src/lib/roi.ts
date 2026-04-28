// ROI / industry benchmarks used by the dashboard ROI counter and the
// "paying for itself" banner. Numbers come from the master brief, Part 5.

import type { BusinessType } from './business-types'

export interface RoiBenchmark {
  avgValue: number
  missRate: number       // 0..1
  label: string
}

export const ROI_BENCHMARKS: Record<BusinessType, RoiBenchmark> = {
  hospitality: { avgValue: 32, missRate: 0.15, label: 'avg order value' },
  retail:      { avgValue: 32, missRate: 0.15, label: 'avg order value' },
  trades:      { avgValue: 380, missRate: 0.23, label: 'avg job value' },
  automotive:  { avgValue: 280, missRate: 0.30, label: 'avg job value' },
  medical:     { avgValue: 120, missRate: 0.18, label: 'avg appointment value' },
  beauty:      { avgValue: 95, missRate: 0.18, label: 'avg appointment value' },
  fitness:     { avgValue: 95, missRate: 0.18, label: 'avg booking value' },
  real_estate: { avgValue: 1200, missRate: 0.23, label: 'avg enquiry value' },
  professional:{ avgValue: 220, missRate: 0.20, label: 'avg consultation value' },
  other:       { avgValue: 85, missRate: 0.20, label: 'avg enquiry value' },
}

export function getBenchmark(t: string | null | undefined): RoiBenchmark {
  const key = (t || 'other') as BusinessType
  return ROI_BENCHMARKS[key] ?? ROI_BENCHMARKS.other
}

// Estimate the revenue TalkMate has *protected* this month — the calls that
// would have been missed if the agent weren't running.
// Calculation per the brief: missed-calls-per-day × avg-value × days-active-this-month.
// Operating ~5 working days/week, so the per-day baseline assumes ~10 incoming
// calls a day for restaurants/trades and similar.
export function estimateRevenueProtected(opts: {
  businessType: string
  daysActiveThisMonth: number
  callsThisMonth: number
}): number {
  const b = getBenchmark(opts.businessType)
  // expected total calls if we extrapolate observed call volume across the
  // remaining days of the month — fall back to 10 calls/day baseline.
  const observedPerDay = opts.daysActiveThisMonth > 0
    ? Math.max(opts.callsThisMonth / opts.daysActiveThisMonth, 0)
    : 0
  const callsPerDay = observedPerDay > 0 ? observedPerDay : 10
  const missedPerDay = callsPerDay * b.missRate
  return Math.round(missedPerDay * b.avgValue * opts.daysActiveThisMonth)
}

export function daysActiveThisMonth(signupAt: string | Date | null | undefined): number {
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const start = signupAt ? new Date(signupAt) : startOfMonth
  const effectiveStart = start > startOfMonth ? start : startOfMonth
  const ms = now.getTime() - effectiveStart.getTime()
  return Math.max(1, Math.ceil(ms / (24 * 60 * 60 * 1000)))
}
