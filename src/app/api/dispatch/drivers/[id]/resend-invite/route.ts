import { NextResponse } from 'next/server'
import { requireClient } from '@/lib/portal-auth'
import { createAdminClient } from '@/lib/supabase/server'
import {
  sendSMS,
  templateDispatchDriverInvite,
  normaliseAuPhone,
} from '@/lib/sms'
import { sendEmail, buildDriverInviteEmail } from '@/lib/email'

// POST /api/dispatch/drivers/[id]/resend-invite — note: `id` here is
// the driver_invites.id, not a drivers.id. Resends SMS + email and
// extends expires_at by 7 days from now if it had expired.

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.talkmate.com.au'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireClient()
  if ('error' in auth) return auth.error
  const { clientId } = auth
  const { id } = await params

  const admin = createAdminClient()

  // Refresh expiry if needed.
  await admin
    .from('driver_invites')
    .update({ expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() })
    .eq('id', id)
    .eq('client_id', clientId)
    .eq('status', 'pending')

  const { data: invite } = await admin
    .from('driver_invites')
    .select('id, email, name, phone, token')
    .eq('id', id)
    .eq('client_id', clientId)
    .eq('status', 'pending')
    .maybeSingle()
  if (!invite) return NextResponse.json({ ok: false, error: 'Pending invite not found' }, { status: 404 })

  const { data: business } = await admin
    .from('businesses')
    .select('name')
    .eq('id', clientId)
    .maybeSingle()
  const businessName = business?.name ?? 'TalkMate'

  const phoneE164 = invite.phone ? normaliseAuPhone(invite.phone) : null
  if (phoneE164) {
    void sendSMS({
      to: phoneE164,
      message: templateDispatchDriverInvite({
        driverName: invite.name as string,
        businessName,
        appUrl: APP_URL,
        token: invite.token as string,
      }),
      clientId,
      smsType: 'dispatch_driver_invite',
    }).catch(() => {})
  }

  const emailTpl = buildDriverInviteEmail({
    driverName: invite.name as string,
    businessName,
    appUrl: APP_URL,
    token: invite.token as string,
    expiresInDays: 7,
  })
  void sendEmail({
    to: invite.email as string,
    subject: emailTpl.subject,
    html: emailTpl.html,
    text: emailTpl.text,
    tag: 'dispatch_driver_invite',
  }).catch(() => {})

  return NextResponse.json({ ok: true })
}
