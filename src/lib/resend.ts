// Simple Resend API helper — direct fetch, no SDK dependency.
// Use this for transactional emails that must send immediately
// (rather than routing through Make.com webhooks).

const RESEND_API_KEY = process.env.RESEND_API_KEY

export interface SendEmailOptions {
  to: string | string[]
  subject: string
  html: string
  from?: string
  replyTo?: string
}

export async function sendEmail(
  opts: SendEmailOptions
): Promise<{ ok: boolean; id?: string; error?: string }> {
  if (!RESEND_API_KEY) {
    console.warn('[sendEmail] RESEND_API_KEY missing — skipping')
    return { ok: false, error: 'RESEND_API_KEY not configured' }
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: opts.from ?? 'TalkMate <hello@talkmate.com.au>',
        to: opts.to,
        subject: opts.subject,
        html: opts.html,
        ...(opts.replyTo ? { reply_to: opts.replyTo } : {}),
      }),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return { ok: false, error: `Resend ${res.status}: ${text}` }
    }
    const json = await res.json().catch(() => ({}))
    return { ok: true, id: json.id }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
