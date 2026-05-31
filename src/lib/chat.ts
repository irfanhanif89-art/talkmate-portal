// Sprint Session 2 — shared helpers for the public website chatbot.
// The /api/chat/* routes are public (no user JWT) and use the service role,
// so everything that protects them lives here: IP hashing, the Supabase-backed
// rate limiter, the Grok system-prompt builder, lead detection and the CORS
// headers the embedded widget needs.

import { createHash } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { grokChat, type GrokMessage } from '@/lib/grok'

// Widget is embedded on arbitrary customer websites, so the public chat API
// must allow any origin. Every /api/chat/* response carries these.
export const CHAT_CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export const MAX_MESSAGE_LENGTH = 500

// SHA-256 of the caller IP. We never store the raw address (privacy + the
// rate_limit_log table only ever sees the hash).
export function hashIp(ip: string): string {
  return createHash('sha256').update(ip).digest('hex')
}

// Best-effort client IP from the proxy headers Vercel sets.
export function getClientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0]!.trim()
  return req.headers.get('x-real-ip') || 'unknown'
}

// Supabase-backed IP rate limiter. Counts rows in rate_limit_log for this
// (ip_hash, endpoint) inside the window; returns false when the cap is hit.
// On the write path we also probabilistically prune entries older than 24h so
// the table never grows unbounded without needing a cron.
export async function checkRateLimit(
  admin: SupabaseClient,
  ipHash: string,
  endpoint: string,
  max: number,
  windowMs: number,
): Promise<boolean> {
  const since = new Date(Date.now() - windowMs).toISOString()
  const { count } = await admin
    .from('rate_limit_log')
    .select('id', { count: 'exact', head: true })
    .eq('ip_hash', ipHash)
    .eq('endpoint', endpoint)
    .gte('created_at', since)

  if ((count ?? 0) >= max) return false

  await admin.from('rate_limit_log').insert({ ip_hash: ipHash, endpoint })

  // ~1% of writes sweep rows older than 24h so the table never grows unbounded
  // without needing a cron. Probabilistic so it fires regardless of per-IP count.
  if (Math.random() < 0.01) {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    await admin.from('rate_limit_log').delete().lt('created_at', cutoff)
  }
  return true
}

// Obvious-spam guard so we don't burn Grok tokens on junk. Conservative on
// purpose — real questions must always get through.
const SPAM_PATTERNS = [
  /\b(viagra|cialis|casino|crypto airdrop|free money|bitcoin generator)\b/i,
  /https?:\/\/\S+\.(ru|cn|tk|top)\b/i,
]
export function looksLikeSpam(message: string): boolean {
  return SPAM_PATTERNS.some(p => p.test(message))
}

export interface KbEntry { question: string; answer: string; category: string }

export function buildSystemPrompt(opts: {
  agentName: string
  businessName: string
  kbEntries: KbEntry[]
  collectLeadsAfter: number
}): string {
  const { agentName, businessName, kbEntries, collectLeadsAfter } = opts
  const kb = kbEntries.length
    ? kbEntries.map(e => `Q: ${e.question}\nA: ${e.answer}`).join('\n\n')
    : 'No specific business information has been provided yet.'

  return [
    `You are ${agentName}, a helpful assistant for ${businessName}.`,
    `Answer questions based on the following business information:`,
    ``,
    kb,
    ``,
    `If you cannot answer a question, politely say you will have someone follow up.`,
    `Keep responses concise (under 150 words).`,
    `Use Australian English. Friendly but professional tone.`,
    `After ${collectLeadsAfter} exchanges, naturally ask for the visitor's name and phone number so the team can follow up with them.`,
  ].join('\n')
}

// Thin wrapper so the route doesn't import grok directly. Uses the codebase
// default Grok model (grok-4.20-0309-non-reasoning) — never grok-2-latest.
export async function chatComplete(messages: GrokMessage[]): Promise<string> {
  return grokChat(messages, { temperature: 0.4, maxTokens: 400 })
}

// Heuristic lead detection on the visitor's own messages: a name-ish token plus
// an Australian phone number. Used to auto-flag lead_captured when the visitor
// volunteers details inside the conversation rather than via the form.
const PHONE_RE = /(\+?61|0)[\s-]?[2-478](?:[\s-]?\d){8}/
export function extractLead(text: string): { phone?: string; name?: string } {
  const phoneMatch = text.match(PHONE_RE)
  const phone = phoneMatch ? phoneMatch[0].replace(/[\s-]/g, '') : undefined
  // "my name is X" / "I'm X" / "this is X"
  const nameMatch = text.match(/\b(?:my name is|i am|i'm|this is|name's)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i)
  const name = nameMatch ? nameMatch[1]!.trim() : undefined
  return { phone, name }
}

// Upsert a contact by (client_id, phone) for the live v2 contacts table
// (migration 008_crm_foundation). That table keys on client_id (not
// business_id) and has a unique index on (client_id, phone) WHERE is_merged =
// false, matching how the win-back webhook and review cron query it. We select
// first, then update or insert, so we never depend on onConflict targeting.
// Returns the contact id (or null on failure).
export async function upsertContactByPhone(
  admin: SupabaseClient,
  businessId: string,
  lead: { name?: string | null; phone: string; email?: string | null },
): Promise<string | null> {
  const { data: existing } = await admin
    .from('contacts')
    .select('id, name, email')
    .eq('client_id', businessId)
    .eq('phone', lead.phone)
    .eq('is_merged', false)
    .limit(1)
    .maybeSingle()

  if (existing) {
    const patch: Record<string, unknown> = { last_seen: new Date().toISOString() }
    if (lead.name && !existing.name) patch.name = lead.name
    if (lead.email && !existing.email) patch.email = lead.email
    await admin.from('contacts').update(patch).eq('id', existing.id)
    return existing.id as string
  }

  const { data: created } = await admin
    .from('contacts')
    .insert({
      client_id: businessId,
      name: lead.name ?? null,
      phone: lead.phone,
      email: lead.email ?? null,
      last_seen: new Date().toISOString(),
    })
    .select('id')
    .maybeSingle()

  return (created?.id as string) ?? null
}
