// Contractor-flow transactional emails — sent directly via Resend.
//
// Originally these were Make.com webhooks (CONTRACTOR_AGREEMENT_WEBHOOK_URL
// and CONTRACTOR_SIGNED_PDF_WEBHOOK_URL). The Make.com scenarios were never
// built, so the webhooks were silently no-op and contractors never received
// the invite or the signed-PDF copy. Cutover to Resend mirrors the Session
// 38a fix for the post-sign portal-access email.
//
// Public API (postInviteEmail, postSignedPdfDelivery) and return shape are
// preserved so the existing callers in /api/contractors/invite,
// /api/contractors/[id]/resend, and /api/contractor-onboarding/[token]/sign
// keep working without changes. Both functions remain fire-and-forget at the
// call site: callers do not await, errors never throw. Internal failures are
// logged and admin-alerted via Telegram so we never silently drop a delivery.

import { sendEmail } from '@/lib/resend'
import {
  notifyAdminAlert,
  contractorInviteEmailHtml,
  contractorSignedPdfEmailHtml,
} from '@/lib/sales-notify'

export interface InviteEmailPayload {
  contractor_id: string
  first_name: string
  last_name: string
  email: string
  invite_token: string
  invite_url: string
  expires_at: string
}

export interface SignedPdfPayload {
  contractor_id: string
  first_name: string
  last_name: string
  email: string
  signed_at: string
  signed_pdf_signed_url: string
}

export async function postInviteEmail(payload: InviteEmailPayload): Promise<{ ok: boolean; error?: string }> {
  const fullName = `${payload.first_name} ${payload.last_name}`.trim()
  try {
    const res = await sendEmail({
      to: payload.email,
      subject: 'Your TalkMate sales contract is ready to sign',
      html: contractorInviteEmailHtml({
        firstName: payload.first_name,
        inviteUrl: payload.invite_url,
        expiresAt: payload.expires_at,
      }),
    })
    if (!res.ok) {
      console.error('[contractor-webhooks] invite email failed', res.error)
      notifyAdminAlert(
        `⚠️ Contractor invite email failed for ${fullName} (${payload.email}). ` +
        `They have no link to sign. Invite URL: ${payload.invite_url}. (${res.error ?? 'unknown'})`,
      ).catch(() => {})
      return { ok: false, error: res.error }
    }
    return { ok: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[contractor-webhooks] invite email threw', msg)
    notifyAdminAlert(
      `⚠️ Contractor invite email threw for ${fullName} (${payload.email}). ` +
      `They have no link to sign. Invite URL: ${payload.invite_url}. (${msg})`,
    ).catch(() => {})
    return { ok: false, error: msg }
  }
}

export async function postSignedPdfDelivery(payload: SignedPdfPayload): Promise<{ ok: boolean; error?: string }> {
  const fullName = `${payload.first_name} ${payload.last_name}`.trim()
  try {
    const res = await sendEmail({
      to: payload.email,
      subject: 'Your signed TalkMate sales agreement',
      html: contractorSignedPdfEmailHtml({
        firstName: payload.first_name,
        signedPdfUrl: payload.signed_pdf_signed_url,
      }),
    })
    if (!res.ok) {
      console.error('[contractor-webhooks] signed pdf email failed', res.error)
      notifyAdminAlert(
        `⚠️ Signed-PDF email failed for ${fullName} (${payload.email}). ` +
        `Contractor signed but did not receive a copy. (${res.error ?? 'unknown'})`,
      ).catch(() => {})
      return { ok: false, error: res.error }
    }
    return { ok: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[contractor-webhooks] signed pdf email threw', msg)
    notifyAdminAlert(
      `⚠️ Signed-PDF email threw for ${fullName} (${payload.email}). ` +
      `Contractor signed but did not receive a copy. (${msg})`,
    ).catch(() => {})
    return { ok: false, error: msg }
  }
}
