import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin-auth'
import { postInviteEmail } from '@/lib/contractor-webhooks'

export const dynamic = 'force-dynamic'

const INVITE_TTL_DAYS = 7

export async function POST(req: Request) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const body = (await req.json().catch(() => ({}))) as {
    first_name?: unknown
    last_name?: unknown
    email?: unknown
    phone?: unknown
  }
  const first_name = String(body.first_name ?? '').trim()
  const last_name = String(body.last_name ?? '').trim()
  const email = String(body.email ?? '').trim().toLowerCase()
  const phone = body.phone ? String(body.phone).trim() : null

  if (!first_name || !last_name) {
    return NextResponse.json({ ok: false, error: 'First name and last name are required' }, { status: 400 })
  }
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ ok: false, error: 'Valid email is required' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Reject duplicate email - unique constraint will also catch it but a
  // friendly message is better than a 500.
  const { data: existing } = await admin
    .from('contractors')
    .select('id, status')
    .eq('email', email)
    .maybeSingle()
  if (existing) {
    return NextResponse.json({ ok: false, error: 'A contractor with that email already exists' }, { status: 409 })
  }

  const now = new Date()
  const expires = new Date(now.getTime() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000)

  const { data: inserted, error } = await admin
    .from('contractors')
    .insert({
      first_name,
      last_name,
      email,
      phone,
      status: 'invited',
      invite_sent_at: now.toISOString(),
      invite_expires_at: expires.toISOString(),
    })
    .select('id, first_name, last_name, email, phone, status, invite_token, invite_expires_at')
    .single()

  if (error || !inserted) {
    return NextResponse.json({ ok: false, error: error?.message ?? 'Failed to create contractor' }, { status: 500 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.talkmate.com.au'
  const invite_url = `${appUrl.replace(/\/$/, '')}/contractor-onboarding/${inserted.invite_token}`

  // Fire and forget - webhook failure does not block the invite.
  postInviteEmail({
    contractor_id: inserted.id,
    first_name: inserted.first_name,
    last_name: inserted.last_name,
    email: inserted.email,
    invite_token: inserted.invite_token,
    invite_url,
    expires_at: inserted.invite_expires_at as string,
  }).catch(() => {})

  // Mark agreement_sent once the webhook has been posted, regardless of
  // outcome - Donna will see the invite_sent_at timestamp if she needs
  // to debug.
  await admin
    .from('contractors')
    .update({ status: 'agreement_sent' })
    .eq('id', inserted.id)

  return NextResponse.json({
    ok: true,
    contractor: { ...inserted, status: 'agreement_sent', invite_url },
  })
}
