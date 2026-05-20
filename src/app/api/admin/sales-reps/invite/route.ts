import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin-auth'
import { sendEmail } from '@/lib/resend'
import { repInviteEmailHtml, PORTAL_URL } from '@/lib/sales-notify'

export async function POST(req: Request) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const full_name = String(body.full_name ?? '').trim()
  const email = String(body.email ?? '').trim().toLowerCase()
  const phone = body.phone ? String(body.phone).trim() : null

  if (!full_name) return NextResponse.json({ ok: false, error: 'full_name is required' }, { status: 400 })
  if (!email || !email.includes('@')) return NextResponse.json({ ok: false, error: 'A valid email is required' }, { status: 400 })

  const admin = createAdminClient()

  // Already a sales rep?
  const { data: existingRep } = await admin.from('sales_reps').select('id').eq('email', email).maybeSingle()
  if (existingRep) {
    return NextResponse.json({ ok: false, error: 'A sales rep with this email already exists.' }, { status: 409 })
  }

  // Already an auth user? Reuse them. Otherwise invite.
  const { data: list } = await admin.auth.admin.listUsers()
  const existingUser = list?.users?.find(u => u.email?.toLowerCase() === email)
  let userId: string

  if (existingUser) {
    userId = existingUser.id
  } else {
    const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { full_name, role: 'sales_rep' },
      redirectTo: `${PORTAL_URL}/auth/callback?next=/sales/dashboard`,
    })
    if (inviteErr || !invited?.user) {
      return NextResponse.json({ ok: false, error: inviteErr?.message ?? 'Could not send invite email' }, { status: 500 })
    }
    userId = invited.user.id
  }

  // Ensure a public.users mirror exists.
  await admin.from('users').upsert({
    id: userId, email, full_name, role: 'sales_rep',
  }, { onConflict: 'id' })

  // Find the default team to associate with.
  const { data: team } = await admin.from('sales_teams').select('id').limit(1).maybeSingle()

  const { data: createdRep, error: repErr } = await admin.from('sales_reps').insert({
    user_id: userId,
    full_name,
    email,
    phone,
    team_id: team?.id ?? null,
    status: 'active',
  }).select('id').single()

  if (repErr || !createdRep) {
    return NextResponse.json({ ok: false, error: repErr?.message ?? 'Failed to create rep' }, { status: 500 })
  }

  // Backup welcome email (Supabase's invite email also fires). Wraps
  // the same magic link the invite uses — if Supabase invite fails or
  // the user already exists, this gets them in.
  sendEmail({
    to: email,
    subject: "You've been invited to TalkMate Sales HQ",
    html: repInviteEmailHtml({
      repName: full_name,
      magicLink: `${PORTAL_URL}/login`,
    }),
  }).catch(() => { /* best-effort */ })

  return NextResponse.json({ ok: true, rep_id: createdRep.id })
}
