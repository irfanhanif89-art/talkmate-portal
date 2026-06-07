// POST /api/webhooks/resend/inbound — public (Resend inbound email webhook).
// Built dark + consent-gated. Returns 200 on every non-handled case so Resend
// does not retry-storm. Shares processing with the Cloudflare path via
// src/lib/inbound-email.ts. (Resend inbound is the PAID path; the free path in
// production currently uses Cloudflare Email Routing — see /api/webhooks/cloudflare-email.)

import { NextRequest, NextResponse } from 'next/server'
import { Webhook } from 'svix'
import { createAdminClient } from '@/lib/supabase/server'
import { processInboundEmail, type InboundEmail } from '@/lib/inbound-email'

export const dynamic = 'force-dynamic'

function emailOf(v: unknown): { email: string; name: string } {
  if (!v) return { email: '', name: '' }
  if (typeof v === 'string') {
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

  // Signature (svix). If the secret is unset (dev/preview), warn + accept.
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
    console.error('[resend-inbound] RESEND_INBOUND_WEBHOOK_SECRET unset — rejecting (fail closed)')
    return NextResponse.json({ error: 'inbound webhook not configured' }, { status: 401 })
  }

  let payload: Record<string, unknown>
  try { payload = JSON.parse(rawBody) } catch { return NextResponse.json({ received: true }) }
  const data = (payload.data ?? payload) as Record<string, unknown>

  const headers = (data.headers ?? {}) as Record<string, string>
  const referencesRaw = (headers['references'] ?? headers['References'] ?? '') as string
  const fromParsed = emailOf(data.from)

  const email: InboundEmail = {
    to: firstTo(data.to),
    fromEmail: fromParsed.email,
    fromName: fromParsed.name,
    subject: (data.subject as string | null) ?? '',
    text: (data.text as string | null) ?? '',
    html: (data.html as string | null) ?? '',
    messageId: (data.message_id as string | null) ?? (data.messageId as string | null) ?? headers['message-id'] ?? headers['Message-ID'] ?? null,
    inReplyTo: (data.in_reply_to as string | null) ?? headers['in-reply-to'] ?? headers['In-Reply-To'] ?? null,
    referencesFirst: referencesRaw.trim().split(/\s+/).filter(Boolean)[0] ?? null,
    autoSubmitted: headers['auto-submitted'] ?? headers['Auto-Submitted'],
    precedence: headers['precedence'] ?? headers['Precedence'],
  }

  const status = await processInboundEmail(createAdminClient(), email)
  return NextResponse.json({ received: true, status })
}
