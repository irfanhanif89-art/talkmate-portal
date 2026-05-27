import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/server'
import { provisionAgent } from '@/lib/provisioning/approveAgent'
import { sendEmail } from '@/lib/resend'
import { sendAdminTelegram } from '@/lib/notifications'

// Session 41 — Go Live entry-point for the new admin onboarding wizard.
//
// Pipeline:
//   1. Call provisionAgent() — Twilio + Vapi + checklist gate.
//   2. Flip account_status to 'active', stamp golive_verified*.
//   3. Send the credentials welcome email IF welcome_email_sent === false.
//      On send failure: don't flip the flag, fire Telegram, surface error
//      so admin can retry via /admin/businesses/[id]/resend-welcome.
//   4. Approve any pending commissions tied to this business + insert
//      rep_notifications for each affected rep.
//   5. Telegram + audit log.
//
// Owner_user_id MUST exist before this is called (Step 1 of the wizard).

export async function POST(req: Request) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const { business_id } = await req.json().catch(() => ({}))
  if (!business_id) return NextResponse.json({ ok: false, error: 'business_id required' }, { status: 400 })

  const admin = createAdminClient()
  const { data: business } = await admin.from('businesses').select('*').eq('id', business_id).maybeSingle()
  if (!business) return NextResponse.json({ ok: false, error: 'Business not found' }, { status: 404 })
  if (business.account_status === 'active') {
    return NextResponse.json({ ok: false, error: 'Already live' }, { status: 409 })
  }
  if (!business.owner_user_id) {
    return NextResponse.json(
      { ok: false, error: 'No owner linked to business — run Step 1 first' },
      { status: 400 },
    )
  }

  // 1. Provision Twilio + Vapi (with checklist gate)
  const result = await provisionAgent(business_id)
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error, failing_checks: result.failing_checks },
      { status: result.status },
    )
  }

  // 2. Flip account status
  const adminEmail = auth.user.email ?? 'unknown'
  await admin.from('businesses').update({
    account_status: 'active',
    golive_verified: true,
    golive_verified_at: new Date().toISOString(),
    onboarding_completed_by: adminEmail,
    onboarding_complete: true,
    onboarding_complete_at: new Date().toISOString(),
  }).eq('id', business_id)

  await admin.from('client_golive_checklist').update({
    verified_at: new Date().toISOString(),
    verified_by: adminEmail,
  }).eq('business_id', business_id)

  // 3. Welcome email (idempotent — gated on welcome_email_sent flag).
  const { data: refreshed } = await admin.from('businesses')
    .select('temp_password, welcome_email_sent, name, email')
    .eq('id', business_id).maybeSingle()
  const { data: owner } = await admin.from('users')
    .select('email, full_name')
    .eq('id', business.owner_user_id).maybeSingle()

  if (refreshed && !refreshed.welcome_email_sent && refreshed.temp_password && owner?.email) {
    const emailResult = await sendEmail({
      from: 'TalkMate <hello@talkmate.com.au>',
      to: owner.email,
      subject: `Welcome to TalkMate, ${owner.full_name ?? ''}`.trim(),
      html: welcomeEmailHtml({
        firstName: owner.full_name?.split(' ')[0] ?? '',
        loginEmail: owner.email,
        tempPassword: refreshed.temp_password,
        phoneNumber: result.phone_number,
        businessName: business.name,
      }),
    })
    if (emailResult.ok) {
      await admin.from('businesses').update({
        welcome_email_sent: true,
        temp_password: null,
      }).eq('id', business_id)
    } else {
      // Don't block Go Live on welcome email failure — surface via Telegram so admin can retry.
      await sendAdminTelegram(
        `Welcome email failed for ${business.name}: ${emailResult.error ?? 'unknown'}. Use Resend Welcome button on the queue card.`,
      ).catch(() => {})
    }
  }

  // 4. Approve commissions for this business — Session 51 added the
  //    14-day clawback gate to match /api/admin/approve-agent. If the
  //    pending commission is still inside its clawback window, leave it
  //    pending and surface a soft note instead of blocking go-live.
  //    Client activation always wins; commission timing can catch up.
  const { data: pendingCommissions } = await admin.from('commissions')
    .select('id, rep_id, clawback_period_ends_at, created_at')
    .eq('business_id', business_id)
    .eq('status', 'pending')

  const heldForClawback: string[] = []
  let approvedCount = 0
  const nowMs = Date.now()
  const nowIso = new Date().toISOString()

  for (const c of pendingCommissions ?? []) {
    const clawbackEnds = c.clawback_period_ends_at
      ? new Date(c.clawback_period_ends_at as string).getTime()
      : new Date(c.created_at as string).getTime() + 14 * 24 * 60 * 60 * 1000
    if (nowMs < clawbackEnds) {
      heldForClawback.push(c.id as string)
      continue
    }
    await admin.from('commissions')
      .update({ status: 'approved', approved_at: nowIso })
      .eq('id', c.id)
    approvedCount++
    if (c.rep_id) {
      await admin.from('rep_notifications').insert({
        rep_id: c.rep_id,
        type: 'commission_updated',
        message: `Commission approved for ${business.name}. Payment incoming.`,
      })
    }
    await admin.from('admin_audit_log').insert({
      admin_email: adminEmail,
      action: 'commission_approved_on_golive',
      business_id,
      business_name: business.name,
    })
  }

  const commissionNote = heldForClawback.length > 0
    ? ` ${heldForClawback.length} commission row(s) held inside 14-day clawback — admin can approve manually once it ends.`
    : ''

  // 5. Telegram + audit log
  await sendAdminTelegram(
    `Client activated: ${business.name} (${business.plan}). ${approvedCount > 0 ? 'Commission approved.' : 'No commission approved (held for clawback).'}${commissionNote}`,
  ).catch(() => {})
  await admin.from('admin_audit_log').insert({
    admin_email: adminEmail,
    action: 'client_activated',
    business_id,
    business_name: business.name,
  })

  return NextResponse.json({ ok: true })
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, ch => (
    ch === '&' ? '&amp;' :
    ch === '<' ? '&lt;'  :
    ch === '>' ? '&gt;'  :
    ch === '"' ? '&quot;': '&#39;'
  ))
}

function welcomeEmailHtml(opts: {
  firstName: string
  loginEmail: string
  tempPassword: string
  phoneNumber: string | null
  businessName: string
}) {
  return `
  <div style="font-family: 'Outfit', Arial, sans-serif; max-width: 560px; margin: 0 auto; background: #061322; color: white; padding: 40px; border-radius: 16px;">
    <div style="margin-bottom: 28px;"><span style="font-size: 28px; font-weight: 800;">Talk</span><span style="font-size: 18px; font-weight: 300; color: #4A9FE8; letter-spacing: 4px;">Mate</span></div>
    <h1 style="font-size: 26px; font-weight: 800; margin-bottom: 10px;">Welcome to TalkMate${opts.firstName ? ', ' + escapeHtml(opts.firstName) : ''}</h1>
    <p style="font-size: 15px; color: rgba(255,255,255,0.7); line-height: 1.7; margin-bottom: 22px;">
      Your AI receptionist for <strong style="color: white;">${escapeHtml(opts.businessName)}</strong> is live.
    </p>

    <div style="background: rgba(255,255,255,0.05); border-radius: 12px; padding: 20px; margin-bottom: 22px;">
      <p style="font-size: 12px; color: #E8622A; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 8px;">Your login</p>
      <p style="font-size: 14px; color: white; margin: 0 0 4px;"><strong>Email:</strong> ${escapeHtml(opts.loginEmail)}</p>
      <p style="font-size: 14px; color: white; margin: 0;"><strong>Temporary password:</strong> <code style="font-family: monospace; background: #061322; padding: 3px 8px; border-radius: 5px;">${escapeHtml(opts.tempPassword)}</code></p>
      <p style="font-size: 12px; color: rgba(255,255,255,0.55); margin-top: 8px;">Change this on first login.</p>
    </div>

    ${opts.phoneNumber ? `
    <div style="background: rgba(232,98,42,0.15); border: 1px solid rgba(232,98,42,0.4); border-radius: 12px; padding: 20px; margin-bottom: 22px;">
      <p style="font-size: 12px; color: #E8622A; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 6px;">Your TalkMate Number</p>
      <p style="font-size: 28px; font-weight: 800; color: white; letter-spacing: 2px; margin: 0;">${escapeHtml(opts.phoneNumber)}</p>
      <p style="font-size: 12px; color: rgba(255,255,255,0.65); margin-top: 8px;">Forward your business line to this number to start taking calls.</p>
    </div>` : ''}

    <a href="https://app.talkmate.com.au/dashboard" style="display: inline-block; background: #E8622A; color: white; font-size: 15px; font-weight: 700; padding: 14px 28px; border-radius: 10px; text-decoration: none;">Go to Dashboard</a>
    <p style="font-size: 12px; color: rgba(255,255,255,0.35); margin-top: 24px;">Questions? Reply to this email. We are a real team on the Gold Coast.</p>
  </div>`
}
