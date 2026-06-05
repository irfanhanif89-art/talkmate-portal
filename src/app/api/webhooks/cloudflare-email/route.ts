// POST /api/webhooks/cloudflare-email — receives a raw email forwarded by the
// Cloudflare Email Worker (the free inbound path). Authenticated by a shared
// secret header. Parses the raw MIME server-side (mailparser) and hands off to
// the shared inbound processor. Returns 200 on every non-handled case.

import { NextRequest, NextResponse } from 'next/server'
import { simpleParser, type AddressObject } from 'mailparser'
import { createAdminClient } from '@/lib/supabase/server'
import { processInboundEmail, type InboundEmail } from '@/lib/inbound-email'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function firstAddress(a: AddressObject | AddressObject[] | undefined): { email: string; name: string } {
  if (!a) return { email: '', name: '' }
  const obj = Array.isArray(a) ? a[0] : a
  const v = obj?.value?.[0]
  return { email: (v?.address ?? '').toLowerCase(), name: v?.name ?? '' }
}

export async function POST(request: NextRequest) {
  const secret = process.env.INBOUND_EMAIL_SECRET
  if (!secret || request.headers.get('x-inbound-secret') !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const raw = await request.text()
  // The Worker passes the envelope recipient/sender as headers (most reliable
  // for which TalkMate address was targeted).
  const envelopeTo = (request.headers.get('x-envelope-to') ?? '').toLowerCase()
  const envelopeFrom = (request.headers.get('x-envelope-from') ?? '').toLowerCase()

  let parsed
  try {
    parsed = await simpleParser(raw)
  } catch (e) {
    console.error('[cf-email] MIME parse failed', (e as Error).message)
    return NextResponse.json({ received: true, status: 'parse_failed' })
  }

  const from = firstAddress(parsed.from)
  const toHeader = firstAddress(parsed.to)
  const refs = Array.isArray(parsed.references) ? parsed.references : (parsed.references ? [parsed.references] : [])

  const email: InboundEmail = {
    to: envelopeTo || toHeader.email,
    fromEmail: from.email || envelopeFrom,
    fromName: from.name,
    subject: parsed.subject ?? '',
    text: parsed.text ?? '',
    html: typeof parsed.html === 'string' ? parsed.html : '',
    messageId: parsed.messageId ?? null,
    inReplyTo: parsed.inReplyTo ?? null,
    referencesFirst: refs[0] ?? null,
    autoSubmitted: parsed.headers.get('auto-submitted') as string | undefined,
    precedence: parsed.headers.get('precedence') as string | undefined,
  }

  const status = await processInboundEmail(createAdminClient(), email)
  return NextResponse.json({ received: true, status })
}
