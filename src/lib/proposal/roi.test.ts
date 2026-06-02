import assert from 'node:assert'
import { computeRoi, ROI_DEFAULTS } from './roi'

const r = computeRoi({ missedCallsPerWeek: 10, avgJobValue: 240, hoursPerWeek: 9 })
assert.equal(r.missed_calls, '10')
assert.equal(r.avg_job, '$240')
assert.equal(r.revenue, '$124,800')        // 10*240*52
assert.equal(r.hours_week, '9')
assert.equal(r.hours_year, '468')          // 9*52
assert.equal(r.break_even, '21')           // ceil(4990 / 240) annual Growth / avg job

const d = computeRoi(ROI_DEFAULTS)
assert.equal(d.revenue, '$124,800')
console.log('roi ok')
