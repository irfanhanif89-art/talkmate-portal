import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin-auth'
import { postInviteEmail } from '@/lib/contractor-webhooks'

export const dynamic = 'force-dynamic'

const INVITE_TTL_DAYS = 7

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const { id } = await ctx.params
  const admin = createAdminClient()

  const { data: contractor, error: fetchError } = await admin
    .from('contractors')
    .select('id, first_name, last_name, email, status')
    .eq('id', id)
    .maybeSingle()

  if (fetchError) return NextResponse.json({ ok: false, error: fetchError.message }, { status: 500 })
  if (!contractor) return NextResponse.json({ ok: false, error: 'Contractor not found' }, { status: 404 })

  if (contractor.status !== 'invited' && contractor.status !== 'agreement_sent') {
    return NextResponse.json(
      { ok: false, error: `Cannot resend invite for a contractor with status ${contractor.status}` },
      { status: 400 },
    )
  }

  const now = new Date()
  const expires = new Date(now.getTime() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000)
  const newToken = randomUUID()

  const { error: updateError } = await admin
    .from('contractors')
    .update({
      invite_token: newToken,
      invite_sent_at: now.toISOString(),
      invite_expires_at: expires.toISOString(),
      status: 'invited',
    })
    .eq('id', contractor.id)

  if (updateError) return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 })

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.talkmate.com.au'
  const invite_url = `${appUrl.replace(/\/$/, '')}/contractor-onboarding/${newToken}`

  postInviteEmail({
    contractor_id: contractor.id,
    first_name: contractor.first_name,
    last_name: contractor.last_name,
    email: contractor.email,
    invite_token: newToken,
    invite_url,
    expires_at: expires.toISOString(),
  }).catch(() => {})

  // Mirror the invite route: mark as agreement_sent once the webhook
  // has been posted, regardless of outcome.
  await admin
    .from('contractors')
    .update({ status: 'agreement_sent' })
    .eq('id', contractor.id)

  return NextResponse.json({ ok: true, email: contractor.email })
}
