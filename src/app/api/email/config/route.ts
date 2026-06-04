// GET|PATCH /api/email/config — user auth (or ?adminClientId)
// Read/update the email responder config. Plan-gated to Growth+Pro.
// ai_email_consent is editable by admins only (client must agree first).

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { resolveBusinessId } from '@/lib/resolve-business'

export const dynamic = 'force-dynamic'

const EMAIL_DOMAIN = 'talkmate-reply.com.au'
const PAID = new Set(['growth', 'pro', 'professional', 'elite'])

export async function GET(request: NextRequest) {
  const adminClientId = request.nextUrl.searchParams.get('adminClientId')
  const auth = await resolveBusinessId(adminClientId, request)
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const admin = createAdminClient()
  const { data: b } = await admin
    .from('businesses')
    .select('inbound_email_address, email_responder_enabled, email_responder_from_name, email_auto_send, ai_email_consent, plan, slug, name')
    .eq('id', auth.businessId)
    .maybeSingle()
  if (!b) return NextResponse.json({ ok: false, error: 'business_not_found' }, { status: 404 })

  const plan = ((b.plan as string | null) ?? 'starter').toLowerCase()
  return NextResponse.json({
    ok: true,
    inboundEmailAddress: b.inbound_email_address ?? null,
    enabled: b.email_responder_enabled === true,
    fromName: (b.email_responder_from_name as string | null) ?? ((b.name as string | null) ?? ''),
    autoSend: b.email_auto_send === true,
    consent: b.ai_email_consent === true,
    plan,
    planAllowed: PAID.has(plan),
    isAdmin: auth.isAdmin,
    hasSlug: Boolean(b.slug),
  })
}

export async function PATCH(request: NextRequest) {
  const adminClientId = request.nextUrl.searchParams.get('adminClientId')
  const auth = await resolveBusinessId(adminClientId, request)
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  let body: { enabled?: boolean; fromName?: string; autoSend?: boolean; consent?: boolean }
  try { body = await request.json() } catch { return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 }) }

  const admin = createAdminClient()
  const { data: b } = await admin
    .from('businesses')
    .select('inbound_email_address, plan, slug')
    .eq('id', auth.businessId)
    .maybeSingle()
  if (!b) return NextResponse.json({ ok: false, error: 'business_not_found' }, { status: 404 })

  const plan = ((b.plan as string | null) ?? 'starter').toLowerCase()
  const update: Record<string, unknown> = {}

  if (typeof body.enabled === 'boolean') {
    if (body.enabled && !PAID.has(plan)) {
      return NextResponse.json({ ok: false, error: 'Email Responder is available on Growth and Pro plans.' }, { status: 403 })
    }
    update.email_responder_enabled = body.enabled
    // Generate the inbound address on first enable.
    if (body.enabled && !b.inbound_email_address) {
      const slug = (b.slug as string | null)?.trim()
      if (!slug) return NextResponse.json({ ok: false, error: 'Your account needs a slug before email can be enabled. Contact support.' }, { status: 400 })
      update.inbound_email_address = `${slug}@${EMAIL_DOMAIN}`
    }
  }
  if (typeof body.fromName === 'string') update.email_responder_from_name = body.fromName.trim().slice(0, 120)
  if (typeof body.autoSend === 'boolean') update.email_auto_send = body.autoSend
  // Consent is an admin-only switch (client must agree first).
  if (typeof body.consent === 'boolean') {
    if (!auth.isAdmin) return NextResponse.json({ ok: false, error: 'Consent can only be set by an administrator.' }, { status: 403 })
    update.ai_email_consent = body.consent
  }

  if (Object.keys(update).length === 0) return NextResponse.json({ ok: true })

  const { error } = await admin.from('businesses').update(update).eq('id', auth.businessId)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, inboundEmailAddress: update.inbound_email_address ?? b.inbound_email_address ?? null })
}
