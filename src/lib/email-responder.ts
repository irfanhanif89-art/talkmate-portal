// Shared AI email-responder logic (Session 3C). Used by the inbound webhook
// and the /api/email/draft + /api/email/send routes so there is no internal
// HTTP hop. Service-role (admin) client is passed in by the caller.

import type { createAdminClient } from '@/lib/supabase/server'
import { grokChat } from '@/lib/grok'
import { buildKbBlock, type KbEntry } from '@/lib/kb-block'
import { sendEmail } from '@/lib/resend'

type Admin = ReturnType<typeof createAdminClient>

const DISCLOSURE = 'This reply was sent by {biz} AI assistant. A team member can follow up if needed.'

async function getSetting(admin: Admin, key: string, fallback: string): Promise<string> {
  const { data } = await admin.from('admin_settings').select('value').eq('key', key).maybeSingle()
  return (data?.value as string | null) ?? fallback
}

// Returns { ok, draftId?, reason? }. Never throws.
export async function triggerEmailDraft(
  admin: Admin,
  threadId: string,
  businessId: string,
): Promise<{ ok: boolean; draftId?: string; reason?: string }> {
  try {
    const { data: business } = await admin
      .from('businesses')
      .select('id, name, email_responder_from_name, email_auto_send, ai_email_consent')
      .eq('id', businessId)
      .maybeSingle()
    if (!business) return { ok: false, reason: 'business_not_found' }

    // Spend caps (N5).
    const startOfDay = new Date(); startOfDay.setUTCHours(0, 0, 0, 0)
    const perCap = parseInt(await getSetting(admin, 'email_drafts_daily_cap', '100'), 10)
    const globalCap = parseInt(await getSetting(admin, 'email_drafts_global_daily_cap', '1000'), 10)
    const { count: perCount } = await admin
      .from('email_messages')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', businessId).eq('ai_drafted', true).gte('created_at', startOfDay.toISOString())
    if ((perCount ?? 0) >= perCap) return { ok: false, reason: 'per_business_cap' }
    const { count: globalCount } = await admin
      .from('email_messages')
      .select('id', { count: 'exact', head: true })
      .eq('ai_drafted', true).gte('created_at', startOfDay.toISOString())
    if ((globalCount ?? 0) >= globalCap) return { ok: false, reason: 'global_cap' }

    // Thread + last 5 messages.
    const { data: thread } = await admin
      .from('email_threads')
      .select('id, subject, from_email, from_name')
      .eq('id', threadId).eq('business_id', businessId)
      .maybeSingle()
    if (!thread) return { ok: false, reason: 'thread_not_found' }

    const { data: msgs } = await admin
      .from('email_messages')
      .select('direction, from_name, from_email, body_text, created_at')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true })
      .limit(20)
    const recent = (msgs ?? []).slice(-5)
    const lastInbound = [...(msgs ?? [])].reverse().find((m) => m.direction === 'inbound')
    if (!lastInbound) return { ok: false, reason: 'no_inbound' }

    // KB context.
    const { data: kbRows } = await admin
      .from('knowledge_base_entries')
      .select('category, question, answer, sort_order')
      .eq('business_id', businessId).eq('is_active', true)
      .order('sort_order', { ascending: true })
    const kbBlock = buildKbBlock((kbRows ?? []) as KbEntry[])

    const fromName = (business.email_responder_from_name as string | null)?.trim() || (business.name as string | null) || 'our team'
    const system = [
      `You are ${fromName}'s email assistant.`,
      'Draft a professional, helpful reply to this customer email.',
      'Use the business information below to answer specific questions.',
      'Keep replies concise and friendly. Australian English. Do not use em dashes.',
      'Do not include a subject line. Sign off warmly.',
      '',
      kbBlock,
    ].join('\n')

    const history = recent.map((m) =>
      `${m.direction === 'inbound' ? 'Customer' : 'Us'}: ${(m.body_text as string | null) ?? ''}`
    ).join('\n\n')
    const userMsg = `Conversation so far:\n${history}\n\nDraft a reply to the customer's latest message.`

    let draftBody = ''
    try {
      draftBody = await grokChat([
        { role: 'system', content: system },
        { role: 'user', content: userMsg },
      ], { temperature: 0.6, maxTokens: 600 })
    } catch (e) {
      return { ok: false, reason: 'grok_error:' + (e as Error).message }
    }
    const disclosure = DISCLOSURE.replace('{biz}', (business.name as string | null) ?? fromName)
    const finalBody = `${draftBody.trim()}\n\n${disclosure}`

    const { data: inserted, error: insErr } = await admin
      .from('email_messages')
      .insert({
        thread_id: threadId,
        business_id: businessId,
        direction: 'outbound',
        from_email: thread.from_email, // overwritten on send with the inbound address
        to_email: thread.from_email,
        subject: thread.subject ? `Re: ${thread.subject}` : 'Re: your enquiry',
        body_text: finalBody,
        status: 'queued',
        sent_by: 'ai',
        ai_drafted: true,
      })
      .select('id')
      .single()
    if (insErr || !inserted) return { ok: false, reason: insErr?.message }

    // Auto-send only with both the toggle AND client consent.
    if (business.email_auto_send === true && business.ai_email_consent === true) {
      await sendQueuedEmail(admin, inserted.id as string)
    }

    return { ok: true, draftId: inserted.id as string }
  } catch (e) {
    return { ok: false, reason: (e as Error).message }
  }
}

// Sends a queued outbound message via Resend. Never throws.
export async function sendQueuedEmail(
  admin: Admin,
  messageId: string,
): Promise<{ ok: boolean; reason?: string }> {
  try {
    const { data: message } = await admin
      .from('email_messages')
      .select('id, thread_id, business_id, subject, body_text, status')
      .eq('id', messageId)
      .maybeSingle()
    if (!message) return { ok: false, reason: 'message_not_found' }
    if (message.status !== 'queued') return { ok: false, reason: 'not_queued' }

    const { data: thread } = await admin
      .from('email_threads')
      .select('from_email, root_key, subject')
      .eq('id', message.thread_id)
      .maybeSingle()
    if (!thread) return { ok: false, reason: 'thread_not_found' }

    const { data: business } = await admin
      .from('businesses')
      .select('inbound_email_address, email_responder_from_name, name, ai_email_consent')
      .eq('id', message.business_id)
      .maybeSingle()
    if (!business?.inbound_email_address) return { ok: false, reason: 'no_inbound_address' }
    if (business.ai_email_consent !== true) return { ok: false, reason: 'no_consent' }

    const fromName = (business.email_responder_from_name as string | null)?.trim()
      || (business.name as string | null) || 'TalkMate'
    const bodyText = (message.body_text as string | null) ?? ''
    const html = bodyText.split('\n').map((l) => l || '<br/>').join('<br/>')
    const rootKey = thread.root_key as string | null

    const result = await sendEmail({
      to: thread.from_email as string,
      from: `${fromName} <${business.inbound_email_address}>`,
      subject: (message.subject as string | null) || (thread.subject ? `Re: ${thread.subject}` : 'Re: your enquiry'),
      html,
      headers: rootKey ? { 'In-Reply-To': `<${rootKey}>`, References: `<${rootKey}>` } : undefined,
    })

    if (!result.ok) {
      await admin.from('email_messages').update({ status: 'failed' }).eq('id', messageId)
      return { ok: false, reason: result.error }
    }

    await admin.from('email_messages')
      .update({ status: 'sent', resend_message_id: result.id ?? null, from_email: business.inbound_email_address })
      .eq('id', messageId)
    await admin.from('email_threads')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', message.thread_id)
    return { ok: true }
  } catch (e) {
    return { ok: false, reason: (e as Error).message }
  }
}
