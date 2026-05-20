// Make.com webhooks for contractor flow.
// Two scenarios:
//   A. Invite email      - CONTRACTOR_AGREEMENT_WEBHOOK_URL
//   B. Signed PDF deliver - CONTRACTOR_SIGNED_PDF_WEBHOOK_URL
// Both are best-effort: a webhook failure is logged but never blocks
// the underlying API response. Donna populates the env vars after the
// Make.com scenarios are built.

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

async function postWebhook(url: string | undefined, payload: unknown, label: string): Promise<{ ok: boolean; error?: string }> {
  if (!url) {
    console.warn(`[contractor-webhook] ${label} skipped - webhook URL not configured`)
    return { ok: false, error: 'webhook url not configured' }
  }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      console.warn(`[contractor-webhook] ${label} returned ${res.status}`)
      return { ok: false, error: `status ${res.status}` }
    }
    return { ok: true }
  } catch (err) {
    console.warn(`[contractor-webhook] ${label} threw`, err)
    return { ok: false, error: err instanceof Error ? err.message : 'unknown' }
  }
}

export function postInviteEmail(payload: InviteEmailPayload) {
  return postWebhook(process.env.CONTRACTOR_AGREEMENT_WEBHOOK_URL, payload, 'invite email')
}

export function postSignedPdfDelivery(payload: SignedPdfPayload) {
  return postWebhook(process.env.CONTRACTOR_SIGNED_PDF_WEBHOOK_URL, payload, 'signed pdf delivery')
}
