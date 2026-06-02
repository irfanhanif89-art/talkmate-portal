import assert from 'node:assert'
import { evaluateClientHealth, type CallRow } from './client-health'

// GM-Towing-shaped degraded window: mostly sub-5s calls, several
// regulars who call repeatedly and bounce, a couple of silence timeouts.
const gmShaped: CallRow[] = [
  // three regulars, each calling 3x and hanging up instantly
  ...['+61383681742', '+61477411170', '+61422230629'].flatMap(n => [
    { duration_seconds: 1, caller_number: n, ended_reason: 'customer-ended-call' },
    { duration_seconds: 2, caller_number: n, ended_reason: 'customer-ended-call' },
    { duration_seconds: 3, caller_number: n, ended_reason: 'customer-ended-call' },
  ]),
  // a few more one-off short calls
  { duration_seconds: 4, caller_number: '+61400000001', ended_reason: 'customer-ended-call' },
  { duration_seconds: 2, caller_number: '+61400000002', ended_reason: 'customer-ended-call' },
  // two silence timeouts
  { duration_seconds: 30, caller_number: '+61400000003', ended_reason: 'silence-timed-out' },
  { duration_seconds: 25, caller_number: '+61400000004', ended_reason: 'silence-timed-out' },
  // one genuine longer call
  { duration_seconds: 98, caller_number: '+61430222860', ended_reason: 'customer-ended-call' },
]

const gm = evaluateClientHealth(gmShaped)
assert.equal(gm.breached, true, 'GM-shaped window should breach')
assert.equal(gm.severity, 'critical', 'GM-shaped window should be critical')
assert.ok(gm.avgDuration < 20, 'avg duration under 20s')
assert.ok(gm.sub5Share > 0.5, 'majority under 5s')
assert.ok(gm.repeatShortCallers >= 3, 'at least 3 repeat short callers')
assert.ok(gm.reasons.length >= 3, 'multiple breach reasons')

// Healthy window: real conversations, distinct callers, no silence.
const healthy: CallRow[] = Array.from({ length: 12 }, (_, i) => ({
  duration_seconds: 60 + i * 8,
  caller_number: `+6140000${1000 + i}`,
  ended_reason: 'customer-ended-call',
}))
const ok = evaluateClientHealth(healthy)
assert.equal(ok.breached, false, 'healthy window should not breach')
assert.equal(ok.reasons.length, 0, 'no breach reasons when healthy')

// Borderline: low avg only (one signal) → warning, not critical.
const oneSignal: CallRow[] = Array.from({ length: 10 }, (_, i) => ({
  duration_seconds: 16, // avg 16s (<20) but no sub-5s, no silence, no repeats
  caller_number: `+6149999${1000 + i}`,
  ended_reason: 'customer-ended-call',
}))
const border = evaluateClientHealth(oneSignal)
assert.equal(border.breached, true, 'low avg alone breaches')
assert.equal(border.severity, 'warning', 'single non-critical signal is a warning')
assert.equal(border.reasons.length, 1, 'exactly one reason')

// anonymous callers must not count toward repeat-short-callers
const anon: CallRow[] = Array.from({ length: 8 }, () => ({
  duration_seconds: 2, caller_number: 'anonymous', ended_reason: 'customer-ended-call',
}))
const a = evaluateClientHealth(anon)
assert.equal(a.repeatShortCallers, 0, 'anonymous excluded from repeat detection')

console.log('client-health ok')
