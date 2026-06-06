// Session 5B — Expo push notification sender.
//
// Sends a push to a business owner's registered mobile device via Expo's
// public push API. Best-effort: never throws (callers use `void`), and clears
// a token Expo reports as unregistered so we stop pushing to dead devices.
//
// EXPO_ACCESS_TOKEN is optional — Expo's push API accepts unauthenticated
// requests, but setting the token raises rate limits and is recommended for
// production. Read from env; absence is fine.

import { createAdminClient } from '@/lib/supabase/server'

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'

export interface PushNotification {
  title: string
  body: string
  data?: Record<string, string>
}

export async function sendPushToBusinessOwner(
  businessId: string,
  notification: PushNotification,
): Promise<void> {
  try {
    const admin = createAdminClient()
    const { data: biz } = await admin
      .from('businesses')
      .select('expo_push_token')
      .eq('id', businessId)
      .limit(1)
      .maybeSingle()

    const token = (biz?.expo_push_token as string | null) ?? null
    if (!token) return

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    }
    if (process.env.EXPO_ACCESS_TOKEN) {
      headers.Authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`
    }

    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        to: token,
        title: notification.title,
        body: notification.body,
        data: notification.data ?? {},
        sound: 'default',
        priority: 'high',
        channelId: 'default',
      }),
    })

    // Expo returns { data: { status, details } }. If the device token is no
    // longer valid, drop it so we don't keep trying.
    const json = (await res.json().catch(() => null)) as
      | { data?: { status?: string; details?: { error?: string } } }
      | null
    const errCode = json?.data?.details?.error
    if (errCode === 'DeviceNotRegistered') {
      await admin
        .from('businesses')
        .update({ expo_push_token: null })
        .eq('id', businessId)
        .eq('expo_push_token', token)
    }
  } catch (e) {
    console.error('[push-notify] send failed', (e as Error).message)
  }
}

// Transcript-gap notifications are throttled to once per day per business so a
// chatty day of calls doesn't spam the owner. Returns true if a push was sent.
export async function maybeSendGapPush(businessId: string): Promise<boolean> {
  try {
    const admin = createAdminClient()
    const { data: biz } = await admin
      .from('businesses')
      .select('expo_push_token, expo_push_last_gap_notified_at')
      .eq('id', businessId)
      .limit(1)
      .maybeSingle()

    if (!biz?.expo_push_token) return false
    const last = biz.expo_push_last_gap_notified_at as string | null
    if (last && Date.now() - new Date(last).getTime() < 24 * 60 * 60 * 1000) {
      return false
    }

    await admin
      .from('businesses')
      .update({ expo_push_last_gap_notified_at: new Date().toISOString() })
      .eq('id', businessId)

    await sendPushToBusinessOwner(businessId, {
      title: 'Agent insight',
      body: "Your agent couldn't answer a question from a recent call. Tap to review.",
      data: { type: 'transcript_gap' },
    })
    return true
  } catch (e) {
    console.error('[push-notify] gap push failed', (e as Error).message)
    return false
  }
}
