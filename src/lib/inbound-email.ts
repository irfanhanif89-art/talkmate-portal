// Shared inbound-email processing (Session 3C). Used by BOTH the Resend inbound
// webhook and the Cloudflare Email Worker webhook so the business lookup, gates,
// loop guards, threading, and AI-draft trigger live in one place.

import type { createAdminClient } from '@/lib/supabase/server'
import { triggerEmailDraft } from '@/lib/email-responder'

type Admin = ReturnType<typeof createAdminClient>

const PAID = new Set(['growth', 'pro', 'professional', 'elite'])
const RATE_WINDOW_MS = 60_000
const RATE_MAX = 30
const NO_REPLY = /^(no-?reply|do-?not-?reply|mailer-daemon|postmaster|bounce)/i
const AUTO_SUBJECT = /^(auto(matic)?[- ]?reply|out of office|undeliverable|delivery status|automatic reply)/i

export interface InboundEmail {
  to: string                    // the TalkMate inbound address it was sent to
  fromEmail: string
  fromName: string
  subject: string
  text: string
  html: string
  messageId: string | null
  inReplyTo: string | null
  referencesFirst: string | null
  autoSubmitted?: string
  precedence?: string
}

const cleanId = (s: string | null): string | null => (s ? s.replace(/[<>]/g, '').trim() || null : null)

// Returns a short status string (the caller maps it to a 200 JSON body). Never throws.
export async function processInboundEmail(admin: Admin, email: InboundEmail): Promise<string> {
  try {
    // Global kill switch.
    const { data: gate } = await admin.from('admin_settings').select('value').eq('key', 'email_responder_globally_enabled').maybeSingle()
    if (!gate || gate.value !== 'true') return 'globally_off'

    const to = email.to.trim().toLowerCase()
    const fromEmail = email.fromEmail.trim().toLowerCase()
    if (!to || !fromEmail) return 'invalid'

    // Find business by inbound address.
    const { data: business } = await admin
      .from('businesses')
      .select('id, plan, email_responder_enabled, ai_email_consent')
      .eq('inbound_email_address', to)
      .maybeSingle()
    if (!business) return 'no_business'
    if (business.email_responder_enabled !== true) return 'disabled'
    if (!PAID.has(((business.plan as string | null) ?? 'starter').toLowerCase())) return 'plan'
    if (business.ai_email_consent !== true) return 'no_consent'

    // Loop / bounce guards.
    const localPart = fromEmail.split('@')[0] ?? ''
    const autoSubmitted = (email.autoSubmitted ?? '').toLowerCase()
    const precedence = (email.precedence ?? '').toLowerCase()
    if (
      fromEmail === to ||
      NO_REPLY.test(localPart) ||
      (autoSubmitted && autoSubmitted !== 'no') ||
      precedence === 'bulk' || precedence === 'auto_reply' ||
      AUTO_SUBJECT.test(email.subject.trim())
    ) {
      return 'auto_or_loop'
    }

    // Lightweight rate limit.
    const since = new Date(Date.now() - RATE_WINDOW_MS).toISOString()
    const { count: recent } = await admin
      .from('email_messages')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', business.id).eq('from_email', fromEmail).gte('created_at', since)
    if ((recent ?? 0) >= RATE_MAX) return 'rate_limited'

    const rootKey = cleanId(email.referencesFirst) ?? cleanId(email.inReplyTo) ?? cleanId(email.messageId) ?? `${fromEmail}:${Date.now()}`
    const preview = email.text.replace(/\s+/g, ' ').trim().slice(0, 120)

    // Link existing contact by email (contacts uses client_id; phone is NOT NULL so we never create one here).
    let contactId: string | null = null
    {
      const { data: existing } = await admin
        .from('contacts').select('id, name')
        .eq('client_id', business.id).eq('email', fromEmail).eq('is_merged', false)
        .limit(1).maybeSingle()
      if (existing) {
        contactId = existing.id as string
        if (email.fromName && !existing.name) await admin.from('contacts').update({ name: email.fromName }).eq('id', existing.id)
      }
    }

    // Upsert thread on (business_id, from_email, root_key).
    const { data: thread } = await admin
      .from('email_threads')
      .upsert({
        business_id: business.id, contact_id: contactId, from_email: fromEmail, from_name: email.fromName || null,
        root_key: rootKey, subject: email.subject || null, last_message_at: new Date().toISOString(), last_message_preview: preview,
      }, { onConflict: 'business_id,from_email,root_key' })
      .select('id, unread_count')
      .maybeSingle()
    if (!thread) return 'thread_failed'

    // Insert the inbound message; idempotent on (business_id, message_id).
    const { error: msgErr } = await admin
      .from('email_messages')
      .insert({
        thread_id: thread.id, business_id: business.id, direction: 'inbound',
        from_email: fromEmail, from_name: email.fromName || null, to_email: to,
        subject: email.subject || null, body_text: email.text || null, body_html: email.html || null,
        message_id: cleanId(email.messageId), in_reply_to: cleanId(email.inReplyTo), status: 'received', sent_by: 'system',
      })
    if (msgErr) {
      if ((msgErr as { code?: string }).code === '23505') return 'duplicate'
      console.error('[inbound-email] message insert failed', msgErr.message)
      return 'error'
    }

    await admin.from('email_threads')
      .update({ last_message_at: new Date().toISOString(), last_message_preview: preview, unread_count: ((thread.unread_count as number | null) ?? 0) + 1 })
      .eq('id', thread.id)

    // Draft a reply (also auto-sends if the business opted in AND consented).
    await triggerEmailDraft(admin, thread.id as string, business.id as string)
    return 'received'
  } catch (e) {
    console.error('[inbound-email] unexpected error', (e as Error).message)
    return 'error'
  }
}
