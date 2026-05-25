import { NextResponse } from 'next/server'
import { requireClient } from '@/lib/portal-auth'
import { createAdminClient } from '@/lib/supabase/server'
import {
  sendSMS,
  templateDispatchDriverInvite,
  normaliseAuPhone,
} from '@/lib/sms'
import { sendEmail, buildDriverInviteEmail } from '@/lib/email'

// POST /api/dispatch/drivers/invite — owner creates a driver invite,
// sends SMS to the phone and email via Resend. Returns the invite
// row so the UI can show its expiry / status.

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.talkmate.com.au'

export async function POST(req: Request) {
  const auth = await requireClient()
  if ('error' in auth) return auth.error
  const { supabase, clientId, userId } = auth

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const name = String(body.name ?? '').trim()
  const email = String(body.email ?? '').trim().toLowerCase()
  const phone = String(body.phone ?? '').trim()
  const truckType = typeof body.truck_type === 'string' ? body.truck_type.trim() : null
  const truckRego = typeof body.truck_rego === 'string' ? body.truck_rego.trim() : null

  if (!name) return NextResponse.json({ ok: false, error: 'name is required' }, { status: 400 })
  if (!email || !email.includes('@')) {
    return NextResponse.json({ ok: false, error: 'A valid email is required' }, { status: 400 })
  }
  if (!phone) return NextResponse.json({ ok: false, error: 'phone is required' }, { status: 400 })

  // Block obvious duplicates.
  const { data: existingDriver } = await supabase
    .from('drivers')
    .select('id')
    .eq('client_id', clientId)
    .eq('email', email)
    .maybeSingle()
  if (existingDriver) {
    return NextResponse.json({ ok: false, error: 'This email already belongs to a driver in your business' }, { status: 409 })
  }
  const { data: existingInvite } = await supabase
    .from('driver_invites')
    .select('id')
    .eq('client_id', clientId)
    .eq('email', email)
    .eq('status', 'pending')
    .maybeSingle()
  if (existingInvite) {
    return NextResponse.json({ ok: false, error: 'A pending invite for this email already exists. Use Resend.' }, { status: 409 })
  }

  const admin = createAdminClient()
  const { data: invite, error } = await admin
    .from('driver_invites')
    .insert({
      client_id: clientId,
      email,
      name,
      phone,
      truck_type: truckType || null,
      truck_rego: truckRego || null,
      invited_by_user_id: userId,
    })
    .select('id, token, email, name, expires_at')
    .maybeSingle()
  if (error || !invite) {
    return NextResponse.json({ ok: false, error: error?.message ?? 'Could not create invite' }, { status: 500 })
  }

  // Resolve business name for the SMS / email copy.
  const { data: business } = await admin
    .from('businesses')
    .select('name')
    .eq('id', clientId)
    .maybeSingle()
  const businessName = business?.name ?? 'TalkMate'

  // Fire SMS + email, fire-and-forget.
  const phoneE164 = normaliseAuPhone(phone)
  if (phoneE164) {
    void sendSMS({
      to: phoneE164,
      message: templateDispatchDriverInvite({
        driverName: name,
        businessName,
        appUrl: APP_URL,
        token: invite.token as string,
      }),
      clientId,
      smsType: 'dispatch_driver_invite',
    }).catch(() => {})
  }

  const emailTpl = buildDriverInviteEmail({
    driverName: name,
    businessName,
    appUrl: APP_URL,
    token: invite.token as string,
    expiresInDays: 7,
  })
  void sendEmail({
    to: email,
    subject: emailTpl.subject,
    html: emailTpl.html,
    text: emailTpl.text,
    tag: 'dispatch_driver_invite',
  }).catch(() => {})

  return NextResponse.json({ ok: true, invite })
}
