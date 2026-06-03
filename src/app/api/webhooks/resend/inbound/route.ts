// POST /api/webhooks/resend/inbound — public (Resend inbound email webhook).
// Built dark + consent-gated. Returns 200 on every non-handled case so Resend
// does not retry-storm. GATE A (see DEPLOYMENT.md): Resend inbound availability +
// domain ownership are unconfirmed; payload parsing is defensive.

import { NextRequest, NextResponse } from 'next/server'
import { Webhook } from 'svix'
import { createAdminClient } from '@/lib/supabase/server'
import { triggerEmailDraft } from '@/lib/email-responder'

export const dynamic = 'force-dynamic'

const PAID = new Set(['growth', 'pro', 'professional', 'elite'])
const RATE_WINDOW_MS = 60_000
const RATE_MAX = 30

const NO_REPLY = /^(no-?reply|do-?not-?reply|mailer-daemon|postmaster|bounce)/i
const AUTO_SUBJECT = /^(auto(matic)?[- ]?reply|out of office|undeliverable|delivery status|automatic reply)/i

function emailOf(v: unknown): { email: string; name: string } {
  if (!v) return { email: '', name: '' }
  if (typeof v === 'string') {
    // "Name <email>" or "email"
    const m = v.match(/^\s*(.*?)\s*<([^>]+)>\s*$/)
    if (m) return { name: m[1].replace(/"/g, '').trim(), email: m[2].trim().toLowerCase() }
    return { email: v.trim().toLowerCase(), name: '' }
  }
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>
    return { email: String(o.address ?? o.email ?? '').trim().toLowerCase(), name: String(o.name ?? '').trim() }
  }
  return { email: '', name: '' }
}

function firstTo(to: unknown): string {
  if (Array.isArray(to)) return emailOf(to[0]).email
  return emailOf(to).email
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text()
  const admin = createAdminClient()

  // 1. Global kill switch.
  const { data: gate } = await admin.from('admin_settings').select('value').eq('key', 'email_responder_globally_enabled').maybeSingle()
  if (!gate || gate.value !== 'true') return NextResponse.json({ received: true, skipped: 'globally_off' })

  // 2. Signature (svix). If the secret is unset (dev/preview before provisioning), warn + accept.
  const secret = process.env.RESEND_INBOUND_WEBHOOK_SECRET
  if (secret) {
    try {
      new Webhook(secret).verify(rawBody, {
        'svix-id': request.headers.get('svix-id') ?? '',
        'svix-timestamp': request.headers.get('svix-timestamp') ?? '',
        'svix-signature': request.headers.get('svix-signature') ?? '',
      })
    } catch {
      return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
    }
  } else {
    console.warn('[resend-inbound] RESEND_INBOUND_WEBHOOK_SECRET unset — accepting unverified (dev/preview)')
  }

  let payload: Record<string, unknown>
  try { payload = JSON.parse(rawBody) } catch { return NextResponse.json({ received: true }) }
  const data = (payload.data ?? payload) as Record<string, unknown>

  const to = firstTo(data.to)
  const fromParsed = emailOf(data.from)
  const subject = (data.subject as string | null) ?? ''
  const text = (data.text as string | null) ?? ''
  const html = (data.html as string | null) ?? ''
  const headers = (data.headers ?? {}) as Record<string, string>
  const messageId = (data.message_id as string | null)
    ?? (data.messageId as string | null)
    ?? (headers['message-id'] ?? headers['Message-ID'] ?? null)
  const inReplyTo = (data.in_reply_to as string | null)
    ?? (headers['in-reply-to'] ?? headers['In-Reply-To'] ?? null)
  const referencesRaw = (headers['references'] ?? headers['References'] ?? '') as string
  const referencesFirst = referencesRaw.trim().split(/\s+/).filter(Boolean)[0] ?? null

  const cleanId = (s: string | null): string | null => s ? s.replace(/[<>]/g, '').trim() || null : null
  const fromEmail = fromParsed.email
  if (!to || !fromEmail) return NextResponse.json({ received: true })

  // 3. Find the business by inbound address.
  const { data: business } = await admin
    .from('businesses')
    .select('id, plan, email_responder_enabled, ai_email_consent')
    .eq('inbound_email_address', to)
    .maybeSingle()
  if (!business) return NextResponse.json({ received: true, skipped: 'no_business' })
  if (business.email_responder_enabled !== true) return NextResponse.json({ received: true, skipped: 'disabled' })
  if (!PAID.has(((business.plan as string | null) ?? 'starter').toLowerCase())) {
    return NextResponse.json({ received: true, skipped: 'plan' })
  }
  if (business.ai_email_consent !== true) return NextResponse.json({ received: true, skipped: 'no_consent' })

  // 4. Loop / bounce guards.
  const localPart = fromEmail.split('@')[0] ?? ''
  const autoSubmitted = (headers['auto-submitted'] ?? headers['Auto-Submitted'] ?? '').toLowerCase()
  const precedence = (headers['precedence'] ?? headers['Precedence'] ?? '').toLowerCase()
  if (
    fromEmail === to ||
    NO_REPLY.test(localPart) ||
    (autoSubmitted && autoSubmitted !== 'no') ||
    precedence === 'bulk' || precedence === 'auto_reply' ||
    AUTO_SUBJECT.test(subject.trim())
  ) {
    return NextResponse.json({ received: true, skipped: 'auto_or_loop' })
  }

  // 5. Lightweight rate limit (no dependency on rate_limit_log schema).
  const since = new Date(Date.now() - RATE_WINDOW_MS).toISOString()
  const { count: recent } = await admin
    .from('email_messages')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', business.id).eq('from_email', fromEmail).gte('created_at', since)
  if ((recent ?? 0) >= RATE_MAX) return NextResponse.json({ received: true, skipped: 'rate_limited' })

  // 6. Conversation root + thread.
  const rootKey = cleanId(referencesFirst) ?? cleanId(inReplyTo) ?? cleanId(messageId) ?? `${fromEmail}:${Date.now()}`
  const preview = text.replace(/\s+/g, ' ').trim().slice(0, 120)

  // Link to an existing contact by email. NOTE: contacts uses `client_id` (not
  // business_id) and `phone` is NOT NULL, so we never CREATE a contact from an
  // email (no phone to satisfy the constraint, and we avoid polluting the CRM).
  // We only link when a contact with this email already exists; otherwise the
  // thread is left unlinked (email_threads.contact_id is nullable).
  let contactId: string | null = null
  {
    const { data: existing } = await admin
      .from('contacts').select('id, name')
      .eq('client_id', business.id).eq('email', fromEmail).eq('is_merged', false)
      .limit(1).maybeSingle()
    if (existing) {
      contactId = existing.id as string
      if (fromParsed.name && !existing.name) await admin.from('contacts').update({ name: fromParsed.name }).eq('id', existing.id)
    }
  }

  // Upsert thread on (business_id, from_email, root_key).
  const { data: thread } = await admin
    .from('email_threads')
    .upsert({
      business_id: business.id, contact_id: contactId, from_email: fromEmail, from_name: fromParsed.name || null,
      root_key: rootKey, subject: subject || null, last_message_at: new Date().toISOString(), last_message_preview: preview,
    }, { onConflict: 'business_id,from_email,root_key' })
    .select('id, unread_count')
    .maybeSingle()
  if (!thread) return NextResponse.json({ received: true, skipped: 'thread_failed' })

  // Insert the inbound message; idempotent on (business_id, message_id).
  const { error: msgErr } = await admin
    .from('email_messages')
    .insert({
      thread_id: thread.id, business_id: business.id, direction: 'inbound',
      from_email: fromEmail, from_name: fromParsed.name || null, to_email: to,
      subject: subject || null, body_text: text || null, body_html: html || null,
      message_id: cleanId(messageId), in_reply_to: cleanId(inReplyTo), status: 'received', sent_by: 'system',
    })
  if (msgErr) {
    // Unique violation on message_id = already processed (Resend re-delivery). No-op.
    if ((msgErr as { code?: string }).code === '23505') return NextResponse.json({ received: true, skipped: 'duplicate' })
    console.error('[resend-inbound] message insert failed', msgErr.message)
    return NextResponse.json({ received: true })
  }

  await admin.from('email_threads')
    .update({ last_message_at: new Date().toISOString(), last_message_preview: preview, unread_count: ((thread.unread_count as number | null) ?? 0) + 1 })
    .eq('id', thread.id)

  // Draft a reply (also auto-sends if the business opted in AND consented).
  await triggerEmailDraft(admin, thread.id as string, business.id as string)

  return NextResponse.json({ received: true })
}
