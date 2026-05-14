// POST /api/portal/staff/invite — Session 11.
//
// Owner-only. Inserts a staff_members row with an invite token, then
// emails the prospective user a link to /accept-invite?token=<plain>.
// We store only the hash of the token in the DB so a database leak
// can't be used to claim pending invites.

import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/resend'

const INVITE_EXPIRES_DAYS = 7

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 })

  // Owner check — the caller must own the business they're inviting into.
  const { data: biz } = await supabase
    .from('businesses')
    .select('id, name')
    .eq('owner_user_id', user.id)
    .maybeSingle()
  if (!biz) return NextResponse.json({ ok: false, error: 'Only the account owner can invite team members.' }, { status: 403 })

  const body = await req.json().catch(() => ({})) as { email?: string; full_name?: string; role?: string }
  const email = (body.email ?? '').trim().toLowerCase()
  const fullName = (body.full_name ?? '').trim()
  const role = body.role === 'manager' ? 'manager' : 'staff'

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ ok: false, error: 'Valid email address required.' }, { status: 400 })
  }
  if (!fullName) {
    return NextResponse.json({ ok: false, error: 'Full name required.' }, { status: 400 })
  }
  if (email === user.email?.toLowerCase()) {
    return NextResponse.json({ ok: false, error: "You can't invite yourself." }, { status: 400 })
  }

  const admin = createAdminClient()

  // Generate a 32-byte url-safe token. The plaintext goes in the email
  // link; only the hash is stored.
  const plaintext = crypto.randomBytes(32).toString('base64url')
  const hash = crypto.createHash('sha256').update(plaintext).digest('hex')
  const expires = new Date(Date.now() + INVITE_EXPIRES_DAYS * 24 * 60 * 60 * 1000).toISOString()

  const { error: upErr } = await admin
    .from('staff_members')
    .upsert({
      client_id: biz.id,
      email,
      full_name: fullName,
      role,
      invite_token_hash: hash,
      invite_expires_at: expires,
      invited_at: new Date().toISOString(),
      active: true,
    }, { onConflict: 'client_id,email' })
  if (upErr) {
    return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 })
  }

  // Compute the public URL. Same precedence the Vapi webhook uses for
  // webhook setup — explicit override first, then Vercel's auto value,
  // then the request origin.
  const publicBaseUrl =
    process.env.NEXT_PUBLIC_APP_URL
    ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)
    ?? new URL(req.url).origin
  const link = `${publicBaseUrl}/accept-invite?token=${plaintext}`
  const roleLabel = role === 'manager' ? 'Manager' : 'Staff'

  await sendEmail({
    to: email,
    subject: `You've been invited to access ${biz.name} on TalkMate`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 540px; margin: 0 auto; padding: 24px; color: #1a2333;">
        <h2 style="margin: 0 0 12px 0; font-size: 20px;">You've been invited to TalkMate</h2>
        <p style="margin: 0 0 16px 0; line-height: 1.5;">Hi ${escapeHtml(fullName)},</p>
        <p style="margin: 0 0 16px 0; line-height: 1.5;">
          ${escapeHtml(user.email ?? 'The account owner')} has invited you to access
          <strong>${escapeHtml(biz.name)}</strong> on TalkMate as a <strong>${roleLabel}</strong>.
        </p>
        <p style="margin: 24px 0;">
          <a href="${link}" style="display: inline-block; padding: 12px 24px; background: #E8622A; color: white; text-decoration: none; border-radius: 8px; font-weight: 600;">
            Accept invite & set password
          </a>
        </p>
        <p style="margin: 16px 0 0 0; font-size: 12px; color: #6b7280; line-height: 1.5;">
          This invite expires in ${INVITE_EXPIRES_DAYS} days. If you weren't expecting it, you can ignore this email.
        </p>
      </div>
    `,
  }).catch(console.error)

  return NextResponse.json({ ok: true })
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
