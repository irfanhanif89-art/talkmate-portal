import { NextResponse } from 'next/server'
import { postEmailTrigger, type EmailTriggerEvent, type EmailTriggerPayload } from '@/lib/make-webhook'

// Public webhook endpoint that other parts of the system (or external services)
// can call to fan out a Make.com email trigger. Authenticated by CRON_SECRET.
const VALID_EVENTS = new Set<EmailTriggerEvent>([
  'account_created_no_payment',
  'abandoned_cart_24h',
  'abandoned_cart_72h',
  'welcome_post_payment',
  'onboarding_incomplete_2h',
  'onboarding_incomplete_day7',
  'first_call_answered',
  'weekly_summary_day7',
  'pre_churn_day10',
  'guarantee_expiry_day13',
  'month_1_milestone',
  'usage_80pct',
  'usage_95pct',
  'referral_activated',
  'referral_churned',
  'nps_low_score',
  'system_alert',
])

export async function POST(req: Request) {
  const auth = req.headers.get('authorization')
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  const body = await req.json().catch(() => null) as EmailTriggerPayload | null
  if (!body || !body.event) return NextResponse.json({ ok: false, error: 'event required' }, { status: 400 })
  if (!VALID_EVENTS.has(body.event)) return NextResponse.json({ ok: false, error: 'unknown event' }, { status: 400 })

  const result = await postEmailTrigger(body)
  return NextResponse.json(result)
}
