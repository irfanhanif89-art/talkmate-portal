import { NextResponse } from 'next/server'
import { Webhook } from 'svix'
import { createAdminClient } from '@/lib/supabase/server'

// Session 41 — Resend webhook for proposal-open tracking.
//
// Resend signs webhook events using the Svix format. Headers:
//   svix-id, svix-timestamp, svix-signature
// The secret is `whsec_...` (set RESEND_WEBHOOK_SECRET in Vercel).
//
// On `email.opened`:
//   - call the increment_proposal_opens RPC (atomic, IF FOUND guard)
//   - if the row exists and this is the first open, insert a
//     rep_notifications row of type 'proposal_opened'.
//   - subsequent opens still increment opened_count but do not re-notify.
//
// Returns 200 on success (or no-op) so Resend doesn't retry.
// Returns 401 only on bad signature.

interface IncrementResult {
  was_first_open: boolean
  rep_id: string
  lead_id: string
}

export async function POST(req: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET
  if (!secret) {
    console.error('[resend-webhook] RESEND_WEBHOOK_SECRET not configured')
    return NextResponse.json({ ok: false }, { status: 500 })
  }

  const body = await req.text()
  const headers = {
    'svix-id': req.headers.get('svix-id') ?? '',
    'svix-timestamp': req.headers.get('svix-timestamp') ?? '',
    'svix-signature': req.headers.get('svix-signature') ?? '',
  }

  let event: { type?: string; data?: { email_id?: string } }
  try {
    const wh = new Webhook(secret)
    event = wh.verify(body, headers) as { type?: string; data?: { email_id?: string } }
  } catch (e) {
    console.error('[resend-webhook] signature verify failed', (e as Error).message)
    return NextResponse.json({ ok: false, error: 'invalid signature' }, { status: 401 })
  }

  if (event.type !== 'email.opened') {
    return NextResponse.json({ ok: true })
  }

  const emailId = event.data?.email_id
  if (!emailId) return NextResponse.json({ ok: true })

  const admin = createAdminClient()
  const { data, error } = await admin.rpc('increment_proposal_opens', { p_email_id: emailId })
  if (error) {
    console.error('[resend-webhook] increment_proposal_opens failed', error.message)
    return NextResponse.json({ ok: true })
  }

  const rows = (data ?? []) as IncrementResult[]
  const row = rows[0]
  if (!row || !row.rep_id) {
    // No matching proposal_tracking row — e.g. an open on an email
    // we don't track. Acknowledge and move on.
    return NextResponse.json({ ok: true })
  }
  if (row.was_first_open !== true) {
    return NextResponse.json({ ok: true })
  }

  const { data: lead } = await admin
    .from('leads')
    .select('business_name')
    .eq('id', row.lead_id)
    .maybeSingle()

  await admin.from('rep_notifications').insert({
    rep_id: row.rep_id,
    type: 'proposal_opened',
    lead_id: row.lead_id,
    message: `${lead?.business_name ?? 'A client'} opened your proposal`,
  })

  return NextResponse.json({ ok: true })
}
