import assert from 'node:assert'
import { isBlockedIp, htmlToText } from './safe-fetch'

// ─── SSRF IP classifier ─────────────────────────────────────────────
// Public addresses must be allowed.
for (const ip of ['8.8.8.8', '1.1.1.1', '203.0.113.10', '142.250.70.78']) {
  assert.equal(isBlockedIp(ip), false, `${ip} should be allowed (public)`)
}

// Private / loopback / link-local / metadata must be blocked.
for (const ip of [
  '127.0.0.1',        // loopback
  '10.0.0.5',         // private /8
  '10.255.255.255',
  '172.16.0.1',       // private /12 low
  '172.31.255.254',   // private /12 high
  '192.168.1.1',      // private /16
  '169.254.169.254',  // cloud metadata
  '0.0.0.0',          // unspecified
  '100.64.0.1',       // CGNAT
  '224.0.0.1',        // multicast
  '::1',              // IPv6 loopback
  '::ffff:127.0.0.1', // IPv4-mapped loopback
  'fd00::1',          // unique-local
  'fe80::1',          // link-local
]) {
  assert.equal(isBlockedIp(ip), true, `${ip} should be blocked`)
}

// 172.x outside 16-31 is public.
assert.equal(isBlockedIp('172.15.0.1'), false, '172.15 is public')
assert.equal(isBlockedIp('172.32.0.1'), false, '172.32 is public')

// Garbage is treated as unsafe.
assert.equal(isBlockedIp('not-an-ip'), true, 'garbage blocked')
assert.equal(isBlockedIp('999.1.1.1'), true, 'out-of-range octet blocked')

// ─── HTML stripping ─────────────────────────────────────────────────
assert.equal(
  htmlToText('<h1>Joe</h1> <p>We do <b>towing</b> &amp; recovery</p><script>evil()</script>'),
  'Joe We do towing & recovery',
  'strips tags + scripts, decodes entities',
)
assert.equal(htmlToText('x'.repeat(5000)).length, 3000, 'caps at 3000 chars')

console.log('safe-fetch.test.ts: all assertions passed')
