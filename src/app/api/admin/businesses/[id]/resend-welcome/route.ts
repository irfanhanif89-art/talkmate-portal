import { NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { requireAdmin } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/resend'

// Session 41 — Resend welcome email + reset temp password.
//
// Recovery path: if Go Live's welcome email failed, the rep ends up with
// an active account but no credentials. This route regenerates the temp
// password, updates the Supabase auth password FIRST, then re-sends the
// welcome email and only flags welcome_email_sent on success.
//
// Critical ordering: auth password must update BEFORE the email send.
// Otherwise a stale temp_password ends up in the inbox and the client
// is locked out.

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, ch => (
    ch === '&' ? '&amp;' :
    ch === '<' ? '&lt;'  :
    ch === '>' ? '&gt;'  :
    ch === '"' ? '&quot;': '&#39;'
  ))
}

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const { id: businessId } = await ctx.params
  const admin = createAdminClient()

  const { data: business } = await admin.from('businesses')
    .select('*').eq('id', businessId).maybeSingle()
  if (!business) return NextResponse.json({ ok: false, error: 'Business not found' }, { status: 404 })
  if (business.welcome_email_sent === true) {
    return NextResponse.json({ ok: false, error: 'Welcome already sent' }, { status: 409 })
  }
  if (!business.owner_user_id) {
    return NextResponse.json({ ok: false, error: 'No owner linked to business' }, { status: 400 })
  }

  const { data: owner } = await admin.from('users')
    .select('email, full_name').eq('id', business.owner_user_id).maybeSingle()
  if (!owner?.email) {
    return NextResponse.json({ ok: false, error: 'Owner has no email on file' }, { status: 400 })
  }

  // 1. Generate fresh temp_password.
  const newTempPassword = crypto.randomBytes(12).toString('base64url').slice(0, 12)

  // 2. Update Supabase auth password FIRST.
  const { error: pwErr } = await admin.auth.admin.updateUserById(business.owner_user_id, {
    password: newTempPassword,
  })
  if (pwErr) {
    return NextResponse.json(
      { ok: false, error: `Auth password reset failed: ${pwErr.message}` },
      { status: 500 },
    )
  }

  // 3. Now persist new temp_password to the DB (so email body and DB stay in sync).
  await admin.from('businesses').update({ temp_password: newTempPassword }).eq('id', businessId)

  // 4. Send the welcome email.
  const html = `
  <div style="font-family: 'Outfit', Arial, sans-serif; max-width: 560px; margin: 0 auto; background: #061322; color: white; padding: 40px; border-radius: 16px;">
    <div style="margin-bottom: 28px;"><span style="font-size: 28px; font-weight: 800;">Talk</span><span style="font-size: 18px; font-weight: 300; color: #4A9FE8; letter-spacing: 4px;">Mate</span></div>
    <h1 style="font-size: 24px; font-weight: 800; margin-bottom: 10px;">Welcome to TalkMate${owner.full_name ? ', ' + escapeHtml(owner.full_name.split(' ')[0]) : ''}</h1>
    <p style="font-size: 15px; color: rgba(255,255,255,0.7); line-height: 1.7; margin-bottom: 22px;">
      Your AI receptionist for <strong style="color: white;">${escapeHtml(business.name)}</strong> is live.
    </p>
    <div style="background: rgba(255,255,255,0.05); border-radius: 12px; padding: 20px; margin-bottom: 22px;">
      <p style="font-size: 12px; color: #E8622A; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 8px;">Your login</p>
      <p style="font-size: 14px; color: white; margin: 0 0 4px;"><strong>Email:</strong> ${escapeHtml(owner.email)}</p>
      <p style="font-size: 14px; color: white; margin: 0;"><strong>Temporary password:</strong> <code style="font-family: monospace; background: #061322; padding: 3px 8px; border-radius: 5px;">${escapeHtml(newTempPassword)}</code></p>
    </div>
    ${business.phone_number ? `
    <div style="background: rgba(232,98,42,0.15); border: 1px solid rgba(232,98,42,0.4); border-radius: 12px; padding: 20px; margin-bottom: 22px;">
      <p style="font-size: 12px; color: #E8622A; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 6px;">Your TalkMate Number</p>
      <p style="font-size: 28px; font-weight: 800; color: white; letter-spacing: 2px; margin: 0;">${escapeHtml(business.phone_number)}</p>
    </div>` : ''}
    <a href="https://app.talkmate.com.au/dashboard" style="display: inline-block; background: #E8622A; color: white; font-size: 15px; font-weight: 700; padding: 14px 28px; border-radius: 10px; text-decoration: none;">Go to Dashboard</a>
  </div>`

  const emailResult = await sendEmail({
    from: 'TalkMate <hello@talkmate.com.au>',
    to: owner.email,
    subject: `Welcome to TalkMate, ${owner.full_name ?? ''}`.trim(),
    html,
  })

  if (!emailResult.ok) {
    // Auth password already changed, but email failed — don't flip flag, don't clear temp_password.
    // Admin can read temp_password off the queue card and share it manually.
    return NextResponse.json({ ok: false, error: emailResult.error ?? 'Email send failed' }, { status: 500 })
  }

  // 5. On success: flag sent + null out temp_password.
  await admin.from('businesses').update({
    welcome_email_sent: true,
    temp_password: null,
  }).eq('id', businessId)

  // 6. Audit log.
  await admin.from('admin_audit_log').insert({
    admin_email: auth.user.email ?? 'unknown',
    action: 'welcome_email_resent',
    business_id: businessId,
    business_name: business.name,
  })

  return NextResponse.json({ ok: true })
}
