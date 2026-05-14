// POST /api/auth/accept-invite — Session 11.
//
// Two phases:
//   GET-like lookup (action='lookup'):
//     Given a plaintext token, return the matching staff_members row so
//     the page can show "You're joining <Business> as a <Manager>".
//     No auth required — but token validity is the gate.
//
//   Accept (action='accept'):
//     Token + password → create a Supabase Auth user with that password,
//     stamp staff_members.auth_user_id + accepted_at, clear the token
//     so it can't be reused.

import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { createAdminClient } from '@/lib/supabase/server'
import { createClient as createSbClient } from '@supabase/supabase-js'
import { validatePassword } from '@/lib/password'

interface RequestBody {
  action?: 'lookup' | 'accept'
  token?: string
  password?: string
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({})) as RequestBody
  const action = body.action ?? 'lookup'
  const token = (body.token ?? '').trim()

  if (!token) return NextResponse.json({ ok: false, error: 'Missing invite token.' }, { status: 400 })

  const hash = crypto.createHash('sha256').update(token).digest('hex')
  const admin = createAdminClient()

  const { data: invite } = await admin
    .from('staff_members')
    .select('id, client_id, email, full_name, role, invite_expires_at, accepted_at, active, businesses:client_id (name)')
    .eq('invite_token_hash', hash)
    .maybeSingle()

  if (!invite) {
    return NextResponse.json({ ok: false, error: 'This invite link is invalid or has already been used.' }, { status: 404 })
  }
  if (!invite.active) {
    return NextResponse.json({ ok: false, error: 'This invite has been revoked.' }, { status: 410 })
  }
  if (invite.accepted_at) {
    return NextResponse.json({ ok: false, error: 'This invite has already been accepted. Try logging in.' }, { status: 410 })
  }
  if (invite.invite_expires_at && new Date(invite.invite_expires_at) < new Date()) {
    return NextResponse.json({ ok: false, error: 'This invite has expired. Ask the account owner to send a new one.' }, { status: 410 })
  }

  const business = Array.isArray(invite.businesses)
    ? (invite.businesses as Array<{ name?: string }>)[0]
    : (invite.businesses as { name?: string } | null)

  if (action === 'lookup') {
    return NextResponse.json({
      ok: true,
      email: invite.email,
      full_name: invite.full_name,
      role: invite.role,
      business_name: business?.name ?? null,
    })
  }

  // action === 'accept'
  const password = body.password ?? ''
  const pwErr = validatePassword(password)
  if (pwErr) return NextResponse.json({ ok: false, error: pwErr }, { status: 400 })

  // Use the anon client so a normal signUp record gets created.
  const anon = createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
  const { data: authData, error: authError } = await anon.auth.signUp({
    email: invite.email,
    password,
    options: { data: { full_name: invite.full_name } },
  })
  if (authError || !authData.user) {
    const msg = authError?.message ?? ''
    if (/already (registered|exists|been)/i.test(msg)) {
      return NextResponse.json({
        ok: false,
        error: 'An account with this email already exists. Log in with your existing password instead.',
      }, { status: 409 })
    }
    return NextResponse.json({ ok: false, error: msg || 'Could not create your account.' }, { status: 400 })
  }

  // Stamp the staff_members row + clear the token so it can't be reused.
  await admin
    .from('staff_members')
    .update({
      auth_user_id: authData.user.id,
      accepted_at: new Date().toISOString(),
      invite_token_hash: null,
      invite_expires_at: null,
    })
    .eq('id', invite.id)

  // Also write a minimal users row so the existing portal `users.role`
  // lookups behave sensibly. Staff are stored with role='staff' there
  // too — separate from the staff_members.role enum, but consistent.
  // PK collision is fine — another path may have created it; we don't
  // want to fail the invite acceptance over a duplicate users row.
  try {
    await admin.from('users').insert({
      id: authData.user.id,
      business_id: invite.client_id,
      email: invite.email,
      role: 'staff',
      full_name: invite.full_name,
    })
  } catch {
    // intentional swallow
  }

  return NextResponse.json({
    ok: true,
    email: invite.email,
    business_name: business?.name ?? null,
  })
}
