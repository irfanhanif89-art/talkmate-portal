// Sessions 36-37 — Web Push wrapper for the driver app.
//
// Drivers subscribe via service worker on /driver/dashboard. Each
// subscription is stored in driver_push_subscriptions. When a dispatch
// job is offered to a driver, we fan out a push notification to every
// active subscription for that driver. If a subscription is dead
// (410 Gone) we delete the row so the next send is faster.
//
// Like lib/sms and lib/email, missing config is a no-op (returns
// success:false with reason 'config_missing') rather than a throw.

import webpush from 'web-push'
import { createAdminClient } from '@/lib/supabase/server'
import { sendAdminTelegram } from '@/lib/notifications'

let configured = false
function configure(): boolean {
  if (configured) return true
  const pub = process.env.VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT || 'mailto:hello@talkmate.com.au'
  if (!pub || !priv) return false
  webpush.setVapidDetails(subject, pub, priv)
  configured = true
  return true
}

export interface PushPayload {
  title: string
  body: string
  // Where the service worker should navigate on click.
  url?: string
  // Optional tag — pushes with the same tag replace previous ones.
  tag?: string
  // Optional badge / icon URLs (relative paths served from /public).
  icon?: string
  badge?: string
}

export interface SendPushResult {
  success: boolean
  sent: number
  failed: number
  removed: number
  reason?: 'config_missing' | 'no_subscriptions' | 'partial' | 'all_failed'
}

// Send a push notification to every active subscription for one driver.
export async function sendPushToDriver(
  driverId: string,
  payload: PushPayload,
): Promise<SendPushResult> {
  if (!configure()) {
    return { success: false, sent: 0, failed: 0, removed: 0, reason: 'config_missing' }
  }
  const supabase = createAdminClient()

  const { data: subs, error } = await supabase
    .from('driver_push_subscriptions')
    .select('id, subscription_json')
    .eq('driver_id', driverId)

  if (error) {
    console.error('[push] subscription lookup failed', { driverId, error: error.message })
    return { success: false, sent: 0, failed: 0, removed: 0, reason: 'config_missing' }
  }

  if (!subs || subs.length === 0) {
    return { success: false, sent: 0, failed: 0, removed: 0, reason: 'no_subscriptions' }
  }

  const json = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url ?? '/driver/dashboard',
    tag: payload.tag,
    icon: payload.icon ?? '/driver/icon-192.png',
    badge: payload.badge ?? '/driver/badge-72.png',
  })

  let sent = 0
  let failed = 0
  let removed = 0
  const deadIds: string[] = []

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          sub.subscription_json as webpush.PushSubscription,
          json,
          { TTL: 60 },
        )
        sent++
      } catch (e) {
        failed++
        const statusCode = (e as { statusCode?: number }).statusCode
        // 404 Not Found / 410 Gone => subscription is dead.
        if (statusCode === 404 || statusCode === 410) {
          deadIds.push(sub.id as string)
        } else {
          console.error('[push] send failed', {
            driverId,
            subId: sub.id,
            statusCode,
            error: e instanceof Error ? e.message : String(e),
          })
        }
      }
    }),
  )

  if (deadIds.length > 0) {
    const { error: delErr } = await supabase
      .from('driver_push_subscriptions')
      .delete()
      .in('id', deadIds)
    if (!delErr) removed = deadIds.length
  }

  if (sent === 0 && failed > 0) {
    void sendAdminTelegram(
      `⚠️ Push failed for all subscriptions\nDriver: ${driverId}\nFailed: ${failed} (${removed} removed as dead)`,
    ).catch(() => {})
    return { success: false, sent, failed, removed, reason: 'all_failed' }
  }

  return {
    success: sent > 0,
    sent,
    failed,
    removed,
    reason: failed > 0 ? 'partial' : undefined,
  }
}

// Convenience for the most common push: a new job offer to a driver.
export function buildJobOfferPushPayload(params: {
  jobTypeLabel: string
  pickupAddress: string
  jobId: string
}): PushPayload {
  return {
    title: `New job — ${params.jobTypeLabel}`,
    body: params.pickupAddress,
    url: `/driver/job/${params.jobId}`,
    tag: `job-${params.jobId}`,
  }
}
