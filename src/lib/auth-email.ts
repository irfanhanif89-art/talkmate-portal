// Auth-related transactional emails: password changed, account changes that
// the user themselves triggered. Sales rep-specific email helpers live in
// sales-notify.ts; this file is portal-agnostic so it can be called from
// both client portal and sales rep flows.

import { sendEmail } from '@/lib/resend'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.talkmate.com.au'

export async function sendPasswordChangedEmail(opts: {
  to: string
  name?: string | null
  when: string
  ip?: string | null
}): Promise<{ ok: boolean; error?: string }> {
  const result = await sendEmail({
    to: opts.to,
    subject: 'Your TalkMate password was changed',
    html: passwordChangedEmailHtml({
      name: opts.name ?? 'there',
      when: opts.when,
      ip: opts.ip ?? null,
    }),
  })
  if (result.ok === false) {
    console.error('[auth-email] password-changed email failed', result.error)
  }
  return result
}

function passwordChangedEmailHtml(opts: { name: string; when: string; ip: string | null }) {
  const ipLine = opts.ip
    ? `<li><strong>From:</strong> ${escapeHtml(opts.ip)}</li>`
    : ''
  return `
<!doctype html>
<html><body style="font-family: 'Outfit', Arial, sans-serif; background: #f4f5f7; padding: 0; margin: 0;">
  <div style="max-width: 560px; margin: 30px auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">
    <div style="background: #061322; padding: 18px 24px;">
      <div style="font-family: 'Outfit', Arial, sans-serif; font-size: 18px; font-weight: 800; color: white;">
        TalkMate
      </div>
    </div>
    <div style="padding: 26px 24px; color: #061322; font-size: 14px; line-height: 1.65;">
      <h2 style="margin: 0 0 12px; font-size: 19px; font-weight: 800;">Your password was changed</h2>
      <p>Hi ${escapeHtml(opts.name)},</p>
      <p>The password on your TalkMate account was just updated.</p>
      <ul style="padding-left: 18px; margin: 0 0 14px;">
        <li><strong>When:</strong> ${escapeHtml(opts.when)}</li>
        ${ipLine}
      </ul>
      <p style="background: rgba(245, 158, 11, 0.08); border-left: 3px solid #f59e0b; padding: 10px 14px; border-radius: 6px;">
        <strong>If this wasn&apos;t you</strong>, reply to this email or contact <a href="mailto:hello@talkmate.com.au" style="color: #E8622A;">hello@talkmate.com.au</a> immediately. Your account access may have been compromised.
      </p>
      <p>You can sign in at <a href="${APP_URL}/login" style="color: #E8622A;">${APP_URL.replace(/^https?:\/\//, '')}/login</a>.</p>
    </div>
    <div style="padding: 16px 24px; background: #f9fafb; border-top: 1px solid #eef0f3; font-size: 11px; color: #7BAED4;">
      TalkMate Pty Ltd · hello@talkmate.com.au
    </div>
  </div>
</body></html>`
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, ch => (
    ch === '&' ? '&amp;' :
    ch === '<' ? '&lt;'  :
    ch === '>' ? '&gt;'  :
    ch === '"' ? '&quot;': '&#39;'
  ))
}
