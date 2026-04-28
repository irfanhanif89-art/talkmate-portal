// Helpers for creating SystemAlert records and routing internal notifications.
// Used by cron jobs (Part 12) and the Command Centre / NPS flows (Part 5).

import type { SupabaseClient } from '@supabase/supabase-js'
import { postEmailTrigger } from './make-webhook'

const RESEND_API_KEY = process.env.RESEND_API_KEY
const INTERNAL_ALERT_EMAIL = process.env.INTERNAL_ALERT_EMAIL || 'hello@talkmate.com.au'

export type AlertType =
  | 'vapi_down'
  | 'vapi_recovered'
  | 'call_forward_broken'
  | 'usage_80pct'
  | 'usage_95pct'
  | 'onboarding_incomplete'
  | 'nps_low'
  | 'stripe_sync_mismatch'
  | 'db_backup_failed'
  | 'db_backup_ok'
  | 'other'

export interface AlertOptions {
  userId?: string | null
  businessId?: string | null
  type: AlertType
  message: string
  severity?: 'info' | 'warning' | 'critical'
  metadata?: Record<string, unknown>
}

export async function createSystemAlert(supabase: SupabaseClient, opts: AlertOptions) {
  const { error } = await supabase.from('system_alerts').insert({
    user_id: opts.userId ?? null,
    business_id: opts.businessId ?? null,
    type: opts.type,
    severity: opts.severity ?? 'warning',
    message: opts.message,
    metadata: opts.metadata ?? {},
  })
  if (error) console.error('[createSystemAlert]', error)
  return { ok: !error, error }
}

export async function resolveAlerts(
  supabase: SupabaseClient,
  filters: { userId?: string; businessId?: string; type?: AlertType }
) {
  let q = supabase.from('system_alerts').update({
    resolved: true,
    resolved_at: new Date().toISOString(),
  }).eq('resolved', false)
  if (filters.userId) q = q.eq('user_id', filters.userId)
  if (filters.businessId) q = q.eq('business_id', filters.businessId)
  if (filters.type) q = q.eq('type', filters.type)
  const { error } = await q
  if (error) console.error('[resolveAlerts]', error)
  return { ok: !error }
}

export async function sendInternalEmail(subject: string, html: string, to: string = INTERNAL_ALERT_EMAIL) {
  if (!RESEND_API_KEY) {
    console.warn('[sendInternalEmail] RESEND_API_KEY missing — skipping')
    return { ok: false, error: 'No RESEND_API_KEY' }
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'TalkMate System <hello@talkmate.com.au>',
        to,
        subject,
        html,
      }),
    })
    if (!res.ok) return { ok: false, error: `Resend ${res.status}` }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

// Convenience: send an internal alert email + log it as a SystemAlert.
export async function sendInternalAlert(
  supabase: SupabaseClient,
  opts: AlertOptions & { subject?: string; html?: string }
) {
  await createSystemAlert(supabase, opts)
  if (opts.subject || opts.html) {
    await sendInternalEmail(
      opts.subject ?? `⚠️ TalkMate alert: ${opts.type}`,
      opts.html ?? `<p>${opts.message}</p>`
    )
  }
  // Also fire the email trigger webhook so Make.com can fan out.
  await postEmailTrigger({
    event: 'system_alert',
    userId: opts.userId ?? undefined,
    businessId: opts.businessId ?? undefined,
    data: { type: opts.type, message: opts.message, ...opts.metadata },
  })
}
