// Sessions 36-37 — shared Resend wrapper. Resend was already a project
// dependency (see /api/onboarding/complete) but each caller spun up its
// own `new Resend(...)` instance and did its own error handling. This
// module centralises both so dispatcher driver invites (and future
// transactional email) go through one tested path.
//
// Failure semantics mirror sendAdminTelegram in `lib/notifications`: if
// RESEND_API_KEY is missing, the call is a no-op (returns success:false
// with reason 'config_missing') rather than throwing — so a missing
// env var degrades gracefully to "no email sent" instead of breaking
// the parent request.

import { Resend } from 'resend'
import { sendAdminTelegram } from '@/lib/notifications'

// Lazy-init so module evaluation doesn't crash at build time when the
// key isn't injected (Next 16 collects page data at build time without
// production env vars).
let cachedClient: Resend | null = null
function getClient(): Resend | null {
  if (cachedClient) return cachedClient
  const key = process.env.RESEND_API_KEY
  if (!key) return null
  cachedClient = new Resend(key)
  return cachedClient
}

export type EmailFailureReason =
  | 'config_missing'
  | 'resend_error'
  | 'invalid_recipient'

export interface SendEmailOptions {
  to: string | string[]
  subject: string
  html: string
  text?: string
  from?: string
  replyTo?: string
  // Tag for logging / Resend dashboard filtering. Mirrors sms_type.
  tag?: string
}

export interface SendEmailResult {
  success: boolean
  id?: string
  error?: string
  reason?: EmailFailureReason
}

// Sender address. Defaults to a generic noreply on the verified domain.
// Override per-call when a context-specific from is wanted.
const DEFAULT_FROM = process.env.RESEND_FROM_ADDRESS
  || 'TalkMate <noreply@talkmate.com.au>'

export async function sendEmail(opts: SendEmailOptions): Promise<SendEmailResult> {
  const client = getClient()
  if (!client) {
    void sendAdminTelegram(
      `⚠️ Email skipped (RESEND_API_KEY missing)\nTag: ${opts.tag ?? 'unknown'}\nTo: ${Array.isArray(opts.to) ? opts.to.join(',') : opts.to}`,
    ).catch(() => {})
    return { success: false, error: 'Resend not configured', reason: 'config_missing' }
  }

  const to = Array.isArray(opts.to) ? opts.to : [opts.to]
  if (to.length === 0 || to.some(t => !t || !t.includes('@'))) {
    return { success: false, error: 'Invalid recipient', reason: 'invalid_recipient' }
  }

  try {
    const { data, error } = await client.emails.send({
      from: opts.from ?? DEFAULT_FROM,
      to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
      replyTo: opts.replyTo,
      tags: opts.tag ? [{ name: 'tag', value: opts.tag }] : undefined,
    })
    if (error) {
      void sendAdminTelegram(
        `⚠️ Email failed\nTag: ${opts.tag ?? 'unknown'}\nTo: ${to.join(',')}\nError: ${error.message}`,
      ).catch(() => {})
      return { success: false, error: error.message, reason: 'resend_error' }
    }
    return { success: true, id: data?.id }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    void sendAdminTelegram(
      `⚠️ Email threw\nTag: ${opts.tag ?? 'unknown'}\nTo: ${to.join(',')}\nError: ${msg}`,
    ).catch(() => {})
    return { success: false, error: msg, reason: 'resend_error' }
  }
}

// ─────────────────── Sessions 36-37 driver invite email ────────────────

export interface DriverInviteEmailParams {
  driverName: string
  businessName: string
  appUrl: string
  token: string
  expiresInDays: number
}

export function buildDriverInviteEmail(params: DriverInviteEmailParams): {
  subject: string
  html: string
  text: string
} {
  const link = `${params.appUrl}/driver/invite/${params.token}`
  const subject = `${params.businessName} has invited you to TalkMate`
  const html = `
<!doctype html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; margin: 0; padding: 24px;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden;">
    <tr>
      <td style="background: #061322; padding: 24px; text-align: center;">
        <span style="color: #ffffff; font-size: 24px; font-weight: 600; letter-spacing: -0.5px;">TalkMate</span>
      </td>
    </tr>
    <tr>
      <td style="padding: 32px 28px;">
        <p style="margin: 0 0 16px; color: #061322; font-size: 18px;">Hi ${escapeHtml(params.driverName)},</p>
        <p style="margin: 0 0 16px; color: #1f2937; font-size: 16px; line-height: 1.5;">
          <strong>${escapeHtml(params.businessName)}</strong> has invited you to join TalkMate as a driver.
          Tap the button below to set up your account.
        </p>
        <div style="text-align: center; margin: 28px 0;">
          <a href="${link}" style="display: inline-block; background: #E8622A; color: #ffffff; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
            Set up your account
          </a>
        </div>
        <p style="margin: 0 0 8px; color: #6b7280; font-size: 14px; line-height: 1.5;">
          Or paste this link into your browser:
        </p>
        <p style="margin: 0 0 24px; color: #1565C0; font-size: 14px; word-break: break-all;">
          ${link}
        </p>
        <p style="margin: 0; color: #6b7280; font-size: 13px;">
          This invite expires in ${params.expiresInDays} days.
        </p>
      </td>
    </tr>
    <tr>
      <td style="background: #f9fafb; padding: 16px 28px; text-align: center; color: #9ca3af; font-size: 12px;">
        If you weren't expecting this invite, you can ignore this email.
      </td>
    </tr>
  </table>
</body>
</html>`.trim()
  const text = `Hi ${params.driverName},

${params.businessName} has invited you to join TalkMate as a driver.

Set up your account: ${link}

This invite expires in ${params.expiresInDays} days.

If you weren't expecting this invite, you can ignore this email.`
  return { subject, html, text }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
