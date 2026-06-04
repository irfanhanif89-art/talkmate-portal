// Session 4A (Round 1) — pre-launch announcement templates.
// GET: returns pre-populated SMS + email templates for the business.
// POST { sent: true }: marks announcement_sent on the gate.
// POST { dismissed: true, reason }: marks dismissed (still satisfies the gate).
// SAFETY: this endpoint NEVER bulk-sends. The owner copies and sends from their
// own phone/email. Bulk-SMS to a client's customers is Spam Act 2003 exposure
// (consent, unsubscribe, sender ID) we do not own.

import { NextResponse } from 'next/server'
import { resolveBusinessId } from '@/lib/resolve-business'
import { createAdminClient } from '@/lib/supabase/server'
import { markGateItem } from '@/lib/onboarding-gate'

export const runtime = 'nodejs'

function smsTemplate(businessName: string, agentName: string): string {
  return `Hi, it's ${businessName}. Quick heads up, we've set up an assistant called ${agentName} to help answer our calls. ${agentName} can take messages, answer questions, and make sure you're looked after any time of day. It's still us running the business, ${agentName} just helps when we're busy or after hours. Reply STOP to opt out.`
}

function emailTemplate(businessName: string, agentName: string, ownerName: string) {
  return {
    subject: `A quick note from ${businessName}`,
    body:
`Hi,

Just letting you know we've set up an assistant called ${agentName} to help manage our phone calls.

When you call us, you may hear ${agentName} answer. ${agentName} can take your details, answer common questions, and make sure someone gets back to you, even after hours or when we're on another call.

We're still the same ${businessName} you know. ${agentName} is just here to make sure you're never left waiting.

Any questions, just reply to this email.

${ownerName}
${businessName}`,
  }
}

async function loadBiz(businessId: string) {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('businesses')
    .select('name, agent_name, owner_name')
    .eq('id', businessId)
    .maybeSingle()
  const biz = (data as { name: string | null; agent_name: string | null; owner_name: string | null } | null) ?? null
  return {
    businessName: biz?.name || 'our business',
    agentName: biz?.agent_name && biz.agent_name !== 'TalkMate' ? biz.agent_name : (biz?.agent_name || 'our assistant'),
    ownerName: biz?.owner_name || 'The team',
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const resolved = await resolveBusinessId(url.searchParams.get('adminClientId'), req)
  if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: resolved.status })

  const { businessName, agentName, ownerName } = await loadBiz(resolved.businessId)
  return NextResponse.json({
    sms: smsTemplate(businessName, agentName),
    email: emailTemplate(businessName, agentName, ownerName),
    businessName,
    agentName,
  })
}

export async function POST(req: Request) {
  const url = new URL(req.url)
  const resolved = await resolveBusinessId(url.searchParams.get('adminClientId'), req)
  if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: resolved.status })

  let body: { sent?: boolean; dismissed?: boolean; reason?: string }
  try { body = await req.json() } catch { body = {} }

  const supabase = createAdminClient()
  const nowIso = new Date().toISOString()
  await supabase.from('businesses').update({
    announcement_sent: true,
    announcement_sent_at: nowIso,
  }).eq('id', resolved.businessId)
  await markGateItem(supabase, resolved.businessId, { announcement_sent: true })

  return NextResponse.json({ ok: true, dismissed: !!body.dismissed, reason: body.reason ?? null })
}
