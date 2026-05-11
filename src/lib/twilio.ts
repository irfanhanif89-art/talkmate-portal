/**
 * Lightweight Twilio SMS helper — native fetch, no SDK dependency.
 *
 * Reads from env vars:
 *   TWILIO_ACCOUNT_SID   – Twilio account SID
 *   TWILIO_AUTH_TOKEN    – Twilio auth token
 *   TWILIO_FROM_NUMBER   – The TalkMate Twilio number (+61468024020)
 *   IRFAN_MOBILE         – Irfan's mobile number to notify (+61422613708)
 *
 * Always fire-and-forget — logs errors but never throws.
 */
export async function sendSms(body: string): Promise<void> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const from = process.env.TWILIO_FROM_NUMBER
  const to = process.env.IRFAN_MOBILE

  if (!accountSid || !authToken || !from || !to) {
    console.warn('[twilio] sendSms skipped — missing env vars (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER / IRFAN_MOBILE)')
    return
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64')

  try {
    const params = new URLSearchParams({ To: to, From: from, Body: body })
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    })
    if (!res.ok) {
      const errText = await res.text().catch(() => '(no body)')
      console.error(`[twilio] SMS failed — HTTP ${res.status}:`, errText)
    }
  } catch (e) {
    console.error('[twilio] sendSms error:', e)
  }
}
