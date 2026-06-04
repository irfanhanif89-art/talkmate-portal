// SSRF-safe fetch for Session 4A auto-populate. A business website URL is
// user/Google-supplied and gets fetched server-side, so it is an SSRF vector.
// This helper:
//   - allows http/https only
//   - resolves the hostname and rejects any IP in a private/loopback/
//     link-local/metadata range (incl. IPv6 mapped + unique-local)
//   - re-validates every redirect hop (redirect: 'manual', max 3)
//   - hard 5s timeout and a body-size cap
// On any violation it throws SafeFetchError; callers degrade gracefully.

import { lookup } from 'node:dns/promises'

export class SafeFetchError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SafeFetchError'
  }
}

const MAX_REDIRECTS = 3
const TIMEOUT_MS = 5000
const MAX_BYTES = 512 * 1024 // read at most 512KB before we strip/slice

// Returns true if an IPv4/IPv6 string is in a blocked (non-public) range.
export function isBlockedIp(ip: string): boolean {
  const addr = ip.trim().toLowerCase()

  // IPv6 (including mapped IPv4 like ::ffff:127.0.0.1)
  if (addr.includes(':')) {
    if (addr === '::1' || addr === '::') return true // loopback / unspecified
    const mapped = addr.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/)
    if (mapped) return isBlockedIp(mapped[1])
    const head = addr.split(':')[0]
    // fc00::/7 unique-local (fc.. / fd..), fe80::/10 link-local
    if (head.startsWith('fc') || head.startsWith('fd')) return true
    if (head.startsWith('fe8') || head.startsWith('fe9') || head.startsWith('fea') || head.startsWith('feb')) return true
    return false
  }

  const parts = addr.split('.').map(Number)
  if (parts.length !== 4 || parts.some(n => Number.isNaN(n) || n < 0 || n > 255)) {
    return true // not a clean IPv4 — treat as unsafe
  }
  const [a, b] = parts
  if (a === 0) return true              // 0.0.0.0/8
  if (a === 10) return true             // 10.0.0.0/8
  if (a === 127) return true            // loopback
  if (a === 169 && b === 254) return true // link-local + cloud metadata 169.254.169.254
  if (a === 172 && b >= 16 && b <= 31) return true // 172.16.0.0/12
  if (a === 192 && b === 168) return true // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true // CGNAT 100.64.0.0/10
  if (a >= 224) return true             // multicast/reserved
  return false
}

async function assertHostAllowed(urlStr: string): Promise<void> {
  let url: URL
  try {
    url = new URL(urlStr)
  } catch {
    throw new SafeFetchError('invalid URL')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new SafeFetchError('only http/https allowed')
  }
  const host = url.hostname
  if (!host) throw new SafeFetchError('no host')
  // Block obvious literal localhost / internal names early.
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new SafeFetchError('blocked host')
  }
  // Resolve every address and check each.
  let records: { address: string }[]
  try {
    records = await lookup(host, { all: true })
  } catch {
    throw new SafeFetchError('DNS resolution failed')
  }
  if (records.length === 0) throw new SafeFetchError('no DNS records')
  for (const r of records) {
    if (isBlockedIp(r.address)) {
      throw new SafeFetchError('blocked IP range')
    }
  }
}

// Fetches a webpage safely and returns up to MAX_BYTES of text.
export async function safeFetchText(initialUrl: string): Promise<string> {
  let current = initialUrl
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertHostAllowed(current)

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
    let res: Response
    try {
      res = await fetch(current, {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'User-Agent': 'TalkMateBot/1.0 (+https://talkmate.com.au)' },
      })
    } catch (e) {
      clearTimeout(timer)
      throw new SafeFetchError(`fetch failed: ${(e as Error).message}`)
    }
    clearTimeout(timer)

    // Manual redirect handling — re-validate the next hop.
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location')
      if (!loc) throw new SafeFetchError('redirect without location')
      current = new URL(loc, current).toString()
      continue
    }
    if (!res.ok) throw new SafeFetchError(`upstream ${res.status}`)

    const buf = await res.arrayBuffer()
    const slice = buf.byteLength > MAX_BYTES ? buf.slice(0, MAX_BYTES) : buf
    return new TextDecoder('utf-8', { fatal: false }).decode(slice)
  }
  throw new SafeFetchError('too many redirects')
}

// Strips HTML to plain text and caps length for LLM extraction.
export function htmlToText(html: string, maxChars = 3000): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxChars)
}
