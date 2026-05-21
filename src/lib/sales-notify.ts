// Notification helpers for the Sales HQ — Telegram + email.
// All helpers are fire-and-forget: failures are logged but never
// surface to the caller, matching the pattern in notifications.ts.

import { sendEmail } from '@/lib/resend'

const TG_BASE = 'https://api.telegram.org/bot'

async function sendTelegram(message: string): Promise<void> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID
  if (!botToken || !chatId) return
  try {
    await fetch(`${TG_BASE}${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        disable_web_page_preview: true,
      }),
    })
  } catch {
    // best-effort
  }
}

const ADMIN_EMAIL = process.env.INTERNAL_ALERT_EMAIL || 'hello@talkmate.com.au'
const PORTAL_URL = process.env.NEXT_PUBLIC_PORTAL_URL || 'https://app.talkmate.com.au'

export async function notifyWin(opts: {
  repName: string
  businessName: string
  contactName: string | null
  contactPhone: string | null
  plan: string
  commissionAmount: number
}) {
  const tgMessage = [
    'New Win — Approval Needed',
    `Rep: ${opts.repName}`,
    `Business: ${opts.businessName}`,
    `Plan: ${opts.plan} — $${opts.commissionAmount} commission`,
    `Review: ${PORTAL_URL}/admin/sales-team`,
  ].join('\n')
  await Promise.all([
    sendTelegram(tgMessage),
    sendEmail({
      to: ADMIN_EMAIL,
      subject: `New win from ${opts.repName} — approval needed`,
      html: winEmailHtml(opts),
    }),
  ])
}

export async function notifyBadLead(opts: {
  repName: string
  businessName: string
  reason: string
}) {
  const tgMessage = [
    'Bad Lead Flagged',
    `Rep: ${opts.repName}`,
    `Business: ${opts.businessName}`,
    `Reason: ${opts.reason}`,
    `Review: ${PORTAL_URL}/admin/sales-team`,
  ].join('\n')
  await sendTelegram(tgMessage)
}

export async function notifyContractSigned(opts: {
  repName: string
  signedAt: string
}) {
  const tgMessage = [
    'Contract Signed',
    `${opts.repName} has signed their agreement.`,
    `Signed at: ${opts.signedAt}`,
  ].join('\n')
  await sendTelegram(tgMessage)
}

// Generic admin alert for ad-hoc internal failures (e.g. rep portal
// provisioning fallout) — fire-and-forget, never throws.
export async function notifyAdminAlert(message: string) {
  await sendTelegram(message)
}

// Sent to a contractor when an existing auth user is found at signing
// time (so inviteUserByEmail does not generate the magic-link email).
// They still need to know their portal is live.
export async function sendRepPortalAccessEmail(opts: {
  email: string
  name: string
  portalUrl: string
}) {
  await sendEmail({
    to: opts.email,
    subject: 'Your TalkMate Sales HQ access is ready',
    html: repPortalAccessEmailHtml({ repName: opts.name, portalUrl: opts.portalUrl }),
  })
}

// Sent to a contractor when their agreement is terminated.
export async function sendTerminationEmail(opts: {
  email: string
  name: string
  terminationDate: string
}) {
  await sendEmail({
    to: opts.email,
    subject: 'Your TalkMate Sales Contractor Agreement has been terminated',
    html: terminationEmailHtml({ repName: opts.name, terminationDate: opts.terminationDate }),
  })
}

// =============================================
// Email templates
// =============================================

function emailWrap(content: string) {
  return `
<!doctype html>
<html><body style="font-family: 'Outfit', Arial, sans-serif; background: #f4f5f7; padding: 0; margin: 0;">
  <div style="max-width: 560px; margin: 30px auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">
    <div style="background: #061322; padding: 18px 24px;">
      <div style="font-family: 'Outfit', Arial, sans-serif; font-size: 18px; font-weight: 800; color: white;">
        TalkMate <span style="color: #E8622A;">Sales HQ</span>
      </div>
    </div>
    <div style="padding: 26px 24px; color: #061322; font-size: 14px; line-height: 1.65;">
      ${content}
    </div>
    <div style="padding: 16px 24px; background: #f9fafb; border-top: 1px solid #eef0f3; font-size: 11px; color: #7BAED4;">
      TalkMate Pty Ltd · hello@talkmate.com.au
    </div>
  </div>
</body></html>`
}

function btn(href: string, label: string) {
  return `<a href="${href}" style="display: inline-block; padding: 12px 22px; background: #E8622A; color: white; text-decoration: none; border-radius: 9px; font-weight: 700; font-size: 14px;">${label}</a>`
}

function winEmailHtml(opts: { repName: string; businessName: string; contactName: string | null; contactPhone: string | null; plan: string; commissionAmount: number }) {
  return emailWrap(`
    <h2 style="margin: 0 0 12px; font-size: 19px; font-weight: 800;">New win — approval needed</h2>
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 18px;">
      <tr><td style="padding: 6px 0; color: #7BAED4; font-weight: 600;">Rep</td><td style="padding: 6px 0; text-align: right;">${escapeHtml(opts.repName)}</td></tr>
      <tr><td style="padding: 6px 0; color: #7BAED4; font-weight: 600;">Business</td><td style="padding: 6px 0; text-align: right;">${escapeHtml(opts.businessName)}</td></tr>
      <tr><td style="padding: 6px 0; color: #7BAED4; font-weight: 600;">Contact</td><td style="padding: 6px 0; text-align: right;">${escapeHtml(opts.contactName ?? '—')} ${opts.contactPhone ? escapeHtml(opts.contactPhone) : ''}</td></tr>
      <tr><td style="padding: 6px 0; color: #7BAED4; font-weight: 600;">Plan</td><td style="padding: 6px 0; text-align: right; text-transform: capitalize;">${escapeHtml(opts.plan)}</td></tr>
      <tr><td style="padding: 6px 0; color: #7BAED4; font-weight: 600;">Commission</td><td style="padding: 6px 0; text-align: right; color: #22c55e; font-weight: 700;">$${opts.commissionAmount}</td></tr>
    </table>
    ${btn(`${PORTAL_URL}/admin/sales-team`, 'Review and Approve')}
  `)
}

export function repInviteEmailHtml(opts: { repName: string; magicLink: string }) {
  return emailWrap(`
    <h2 style="margin: 0 0 12px; font-size: 19px; font-weight: 800;">Welcome to TalkMate Sales HQ</h2>
    <p>Hi ${escapeHtml(opts.repName)},</p>
    <p>You've been added to the TalkMate Sales team. Click the button below to log in and set up your account.</p>
    <p style="margin: 22px 0;">${btn(opts.magicLink, 'Open Sales HQ')}</p>
    <p>Once you're in, you'll find your assigned leads, pipeline tools, and commission tracker all in one place.</p>
  `)
}

export function contractReadyEmailHtml(opts: { repName: string }) {
  return emailWrap(`
    <h2 style="margin: 0 0 12px; font-size: 19px; font-weight: 800;">Your TalkMate contract is ready to sign</h2>
    <p>Hi ${escapeHtml(opts.repName)},</p>
    <p>Your Independent Sales Representative Agreement is ready for your review and signature.</p>
    <p style="margin: 22px 0;">${btn(`${PORTAL_URL}/sales/contract`, 'Review and Sign')}</p>
    <p>Once signed, a copy will be emailed to you automatically.</p>
  `)
}

export function contractSignedEmailHtml(opts: { repName: string; signedAt: string }) {
  return emailWrap(`
    <h2 style="margin: 0 0 12px; font-size: 19px; font-weight: 800;">Contract signed — welcome to the team</h2>
    <p>Hi ${escapeHtml(opts.repName)},</p>
    <p>Your contract has been signed successfully.</p>
    <p><strong>Signed:</strong> ${escapeHtml(opts.signedAt)}</p>
    <p style="margin: 22px 0;">${btn(`${PORTAL_URL}/sales/contract`, 'View your contract')}</p>
  `)
}

export function clientWelcomeEmailHtml(opts: { firstName: string; plan: string; loginEmail: string }) {
  return emailWrap(`
    <h2 style="margin: 0 0 12px; font-size: 19px; font-weight: 800;">Welcome to TalkMate</h2>
    <p>Hi ${escapeHtml(opts.firstName)},</p>
    <p>Welcome to TalkMate. Your account has been set up on the <strong style="text-transform: capitalize;">${escapeHtml(opts.plan)}</strong> plan and your AI receptionist is almost live.</p>
    <p>Your login email is: <strong>${escapeHtml(opts.loginEmail)}</strong></p>
    <p style="margin: 22px 0;">${btn(`${PORTAL_URL}/dashboard`, 'Go to My Dashboard')}</p>
    <p>If you have any questions, just reply to this email.</p>
  `)
}

export function dealApprovedEmailHtml(opts: { repName: string; businessName: string; amount: number }) {
  return emailWrap(`
    <h2 style="margin: 0 0 12px; font-size: 19px; font-weight: 800;">Deal approved — ${escapeHtml(opts.businessName)} is ready to onboard</h2>
    <p>Hi ${escapeHtml(opts.repName)},</p>
    <p>Your deal with <strong>${escapeHtml(opts.businessName)}</strong> has been approved.</p>
    <p>Commission locked in: <strong style="color: #22c55e;">$${opts.amount}</strong></p>
    <p style="margin: 22px 0;">${btn(`${PORTAL_URL}/sales/onboard`, 'Onboard Client')}</p>
  `)
}

export function dealRejectedEmailHtml(opts: { repName: string; businessName: string; reason: string | null }) {
  return emailWrap(`
    <h2 style="margin: 0 0 12px; font-size: 19px; font-weight: 800;">Deal not approved — ${escapeHtml(opts.businessName)}</h2>
    <p>Hi ${escapeHtml(opts.repName)},</p>
    <p>Your submission for <strong>${escapeHtml(opts.businessName)}</strong> has been rejected by admin.</p>
    ${opts.reason ? `<p><strong>Reason:</strong> ${escapeHtml(opts.reason)}</p>` : ''}
    <p>The lead has been moved back into your pipeline. Reach out to admin if you'd like to discuss.</p>
    <p style="margin: 22px 0;">${btn(`${PORTAL_URL}/sales/leads`, 'Back to Pipeline')}</p>
  `)
}

export function repPortalAccessEmailHtml(opts: { repName: string; portalUrl: string }) {
  return emailWrap(`
    <h2 style="margin: 0 0 12px; font-size: 19px; font-weight: 800;">Your contractor agreement is signed</h2>
    <p>Hi ${escapeHtml(opts.repName)},</p>
    <p>Welcome to the TalkMate sales team. Your contractor agreement is signed and your Sales HQ portal access is now live on your existing TalkMate login.</p>
    <p style="margin: 22px 0;">${btn(opts.portalUrl, 'Open Sales HQ')}</p>
    <p>Sign in with the same email this message was sent to. If you have any questions, just reply to this email.</p>
  `)
}

export function terminationEmailHtml(opts: { repName: string; terminationDate: string }) {
  return emailWrap(`
    <h2 style="margin: 0 0 12px; font-size: 19px; font-weight: 800;">Your TalkMate Sales Contractor Agreement has been terminated</h2>
    <p>Hi ${escapeHtml(opts.repName)},</p>
    <p>This email confirms that your Sales Contractor Agreement with TalkMate has been terminated effective <strong>${escapeHtml(opts.terminationDate)}</strong>. Your portal access has been revoked.</p>
    <p>Any commissions earned on qualified sales prior to this date will be paid in accordance with the agreement terms.</p>
    <p>If you have questions please contact <a href="mailto:hello@talkmate.com.au" style="color: #E8622A;">hello@talkmate.com.au</a>.</p>
  `)
}

export function commissionRevokedEmailHtml(opts: { repName: string; businessName: string; amount: number; reason: string }) {
  return emailWrap(`
    <h2 style="margin: 0 0 12px; font-size: 19px; font-weight: 800;">Commission revoked — ${escapeHtml(opts.businessName)}</h2>
    <p>Hi ${escapeHtml(opts.repName)},</p>
    <p>The commission for <strong>${escapeHtml(opts.businessName)}</strong> ($${opts.amount}) has been revoked.</p>
    <p><strong>Reason:</strong> ${escapeHtml(opts.reason)}</p>
    <p>If you'd like to discuss this, please contact admin directly.</p>
  `)
}

export { ADMIN_EMAIL, PORTAL_URL }

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, ch => (
    ch === '&' ? '&amp;' :
    ch === '<' ? '&lt;'  :
    ch === '>' ? '&gt;'  :
    ch === '"' ? '&quot;': '&#39;'
  ))
}
