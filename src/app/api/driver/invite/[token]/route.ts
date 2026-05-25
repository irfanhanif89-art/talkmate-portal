import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

// Sessions 36-37 — public GET endpoint to fetch a pending invite by
// token. The unauth user is mid-onboarding: they tap the SMS / email
// link, this route hydrates the setup form with their name + business.
// Uses the service-role client to bypass RLS (the visitor has no
// session yet).

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  if (!token || typeof token !== 'string') {
    return NextResponse.json({ ok: false, error: 'Missing token' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data: invite, error } = await admin
    .from('driver_invites')
    .select('id, client_id, email, name, phone, truck_type, status, expires_at')
    .eq('token', token)
    .maybeSingle()

  if (error || !invite) {
    return NextResponse.json({ ok: false, error: 'Invite not found' }, { status: 404 })
  }
  if (invite.status !== 'pending') {
    return NextResponse.json({ ok: false, error: 'This invite has already been used' }, { status: 410 })
  }
  if (new Date(invite.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ ok: false, error: 'This invite has expired' }, { status: 410 })
  }

  // Pull the business name so the setup form can show "Welcome to X".
  const { data: business } = await admin
    .from('businesses')
    .select('name')
    .eq('id', invite.client_id)
    .maybeSingle()

  return NextResponse.json({
    ok: true,
    invite: {
      email: invite.email,
      name: invite.name,
      phone: invite.phone,
      truck_type: invite.truck_type,
      business_name: business?.name ?? 'TalkMate',
    },
  })
}
