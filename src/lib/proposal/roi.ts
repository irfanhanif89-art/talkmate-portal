// Pure ROI maths for the proposal. Produces display-ready strings keyed to the
// proposal template's data-tm fields. break_even = how many recovered jobs at
// avgJobValue cover one year of the Growth plan (annual price 4990).
const GROWTH_ANNUAL = 4990

export interface RoiInput {
  missedCallsPerWeek: number
  avgJobValue: number
  hoursPerWeek: number
}

export const ROI_DEFAULTS: RoiInput = {
  missedCallsPerWeek: 10,
  avgJobValue: 240,
  hoursPerWeek: 9,
}

function aud(n: number): string {
  return '$' + Math.round(n).toLocaleString('en-AU')
}

export function computeRoi(input: RoiInput): {
  missed_calls: string; avg_job: string; revenue: string
  hours_week: string; hours_year: string; break_even: string
} {
  const revenue = input.missedCallsPerWeek * input.avgJobValue * 52
  const hoursYear = input.hoursPerWeek * 52
  const breakEven = input.avgJobValue > 0 ? Math.ceil(GROWTH_ANNUAL / input.avgJobValue) : 0
  return {
    missed_calls: String(input.missedCallsPerWeek),
    avg_job: aud(input.avgJobValue),
    revenue: aud(revenue),
    hours_week: String(input.hoursPerWeek),
    hours_year: String(hoursYear),
    break_even: String(breakEven),
  }
}
