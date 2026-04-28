// Wrappers for posting to the Make.com webhooks (email triggers, payouts).
// Part 14 of the master brief defines the 17 trigger events.

const EMAIL_WEBHOOK = process.env.MAKE_WEBHOOK_EMAIL_TRIGGER
const PAYOUT_WEBHOOK = process.env.MAKE_WEBHOOK_PAYOUT
const FALLBACK_GENERIC = process.env.MAKE_WEBHOOK_URL

export type EmailTriggerEvent =
  | 'account_created_no_payment'
  | 'abandoned_cart_24h'
  | 'abandoned_cart_72h'
  | 'welcome_post_payment'
  | 'onboarding_incomplete_2h'
  | 'onboarding_incomplete_day7'
  | 'first_call_answered'
  | 'weekly_summary_day7'
  | 'pre_churn_day10'
  | 'guarantee_expiry_day13'
  | 'month_1_milestone'
  | 'usage_80pct'
  | 'usage_95pct'
  | 'referral_activated'
  | 'referral_churned'
  | 'nps_low_score'
  | 'system_alert'

export interface EmailTriggerPayload {
  event: EmailTriggerEvent
  userId?: string
  businessId?: string
  email?: string
  data?: Record<string, unknown>
}

export async function postEmailTrigger(payload: EmailTriggerPayload): Promise<{ ok: boolean; error?: string }> {
  const url = EMAIL_WEBHOOK || FALLBACK_GENERIC
  if (!url) return { ok: false, error: 'MAKE_WEBHOOK_EMAIL_TRIGGER not configured' }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, sentAt: new Date().toISOString() }),
    })
    if (!res.ok) return { ok: false, error: `Make webhook ${res.status}` }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

export async function postPayoutEvent(payload: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  const url = PAYOUT_WEBHOOK || FALLBACK_GENERIC
  if (!url) return { ok: false, error: 'MAKE_WEBHOOK_PAYOUT not configured' }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, sentAt: new Date().toISOString() }),
    })
    if (!res.ok) return { ok: false, error: `Make webhook ${res.status}` }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
