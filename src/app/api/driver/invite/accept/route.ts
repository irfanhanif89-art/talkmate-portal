import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { validatePassword } from '@/lib/password'
import { sendAdminTelegram } from '@/lib/notifications'

// Sessions 36-37 — public POST endpoint that completes a driver invite.
// Body: { token, password }
//
// 1. Validate the invite (still pending, not expired).
// 2. Create the Supabase Auth user (or fail gracefully if one already
//    exists for that email).
// 3. Insert the drivers row linked to the new auth user.
// 4. Mark the invite as accepted.
// 5. Telegram the business owner so they know the driver is in.
//
// We deliberately do NOT sign the user in here — the client follows
// up with a normal signInWithPassword on its own. Keeping the route
// session-agnostic means we can run it with the service-role client
// without trying to mint a session for a different role.

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    token?: unknown
    password?: unknown
  }
  const token = typeof body.token === 'string' ? body.token : ''
  const password = typeof body.password === 'string' ? body.password : ''

  if (!token) return NextResponse.json({ ok: false, error: 'Missing token' }, { status: 400 })
  const pwErr = validatePassword(password)
  if (pwErr) return NextResponse.json({ ok: false, error: pwErr }, { status: 400 })

  const admin = createAdminClient()

  // 1. Lookup invite.
  const { data: invite } = await admin
    .from('driver_invites')
    .select('id, client_id, email, name, phone, truck_type, truck_rego, status, expires_at')
    .eq('token', token)
    .maybeSingle()

  if (!invite) {
    return NextResponse.json({ ok: false, error: 'Invite not found' }, { status: 404 })
  }
  if (invite.status !== 'pending') {
    return NextResponse.json({ ok: false, error: 'This invite has already been used' }, { status: 410 })
  }
  if (new Date(invite.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ ok: false, error: 'This invite has expired' }, { status: 410 })
  }

  // 2. Create auth user. confirm true because the invite link itself
  //    acted as the email confirmation step.
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: invite.email,
    password,
    email_confirm: true,
    user_metadata: { driver_name: invite.name, business_id: invite.client_id },
  })

  if (createErr || !created.user) {
    // 422 user_already_exists is the most common path here. The brief
    // assumes drivers always have a fresh email — for v1 we surface
    // the error so the dispatcher knows to use a different email.
    return NextResponse.json(
      { ok: false, error: createErr?.message ?? 'Could not create account' },
      { status: 400 },
    )
  }

  // 3. Insert drivers row.
  const { data: driver, error: driverErr } = await admin
    .from('drivers')
    .insert({
      user_id: created.user.id,
      client_id: invite.client_id,
      name: invite.name,
      phone: invite.phone ?? '',
      email: invite.email,
      truck_type: invite.truck_type,
      truck_rego: invite.truck_rego,
      is_available: false,
      is_online: false,
      is_active: true,
    })
    .select('id')
    .maybeSingle()

  if (driverErr || !driver) {
    // Roll back the auth user so the dispatcher can retry without a
    // ghost account hanging around.
    await admin.auth.admin.deleteUser(created.user.id).catch(() => {})
    return NextResponse.json(
      { ok: false, error: driverErr?.message ?? 'Could not create driver record' },
      { status: 500 },
    )
  }

  // 4. Mark invite accepted.
  await admin
    .from('driver_invites')
    .update({ status: 'accepted', accepted_at: new Date().toISOString() })
    .eq('id', invite.id)

  // 5. Owner alert (fire-and-forget).
  const { data: business } = await admin
    .from('businesses')
    .select('name')
    .eq('id', invite.client_id)
    .maybeSingle()
  void sendAdminTelegram(
    `✅ Driver onboarded: ${invite.name} (${invite.email}) joined ${business?.name ?? 'business'}`,
  ).catch(() => {})

  return NextResponse.json({ ok: true, driver_id: driver.id })
}
