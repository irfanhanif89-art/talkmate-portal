// GET /api/cron/review-follow-up — Vercel cron, every 15 minutes.
//
// For every business that has review requests enabled and a Google
// review URL configured, finds calls that:
//   - ended at least `review_request_delay_hours` ago (default 2h)
//   - weren't abandoned (we don't review-request a missed call)
//   - lasted >30s (only real conversations)
//   - have no review request yet (review_request_sent = false)
//   - where the caller hasn't been review-requested in the last 90 days
//   - where the caller hasn't opted out of SMS
// and texts the caller a review link via /lib/sms.ts.
//
// Bounded to 50 per run so a big backlog can't blow the function
// timeout. Cron fires every 15 min, so the steady-state throughput is
// 200 review requests / hour — plenty for the current fleet.

import { NextResponse } from 'next/server'
import { verifyCron } from '@/lib/cron-auth'
import { createAdminClient } from '@/lib/supabase/server'
import { sendSMS } from '@/lib/sms'

const MAX_PER_RUN = 50
const MIN_CALL_DURATION_SECONDS = 30
const DEFAULT_DELAY_HOURS = 2
const DEFAULT_THROTTLE_DAYS = 90
// Sprint 1 hardening — minimum call sentiment (0-10) to solicit a public
// Google review. Calls scoring below this are skipped; unscored (null)
// calls are still asked (preserves prior behaviour). Prod score range is
// 2-8, avg ~6.3; 6 cleanly excludes the poor band (2-5) including all
// 'pending'-status calls without suppressing solid interactions.
const MIN_REVIEW_SCORE = 6

interface BusinessForReview {
  id: string
  name: string
  google_review_url: string | null
  review_requests_enabled: boolean | null
  review_request_delay_hours: number | null
  review_request_custom_message: string | null
  twilio_phone_number: string | null
  talkmate_number: string | null
}

interface CallForReview {
  id: string
  business_id: string
  caller_number: string | null
  ended_at: string | null
  duration_seconds: number | null
  was_abandoned: boolean | null
  review_request_sent: boolean | null
}

export async function GET(request: Request) {
  const auth = verifyCron(request)
  if (auth) return auth

  const supabase = createAdminClient()

  // Pull every business with reviews enabled. Fleet is small enough we
  // can just iterate over them in code rather than build a giant JOIN.
  const { data: businesses, error: bizErr } = await supabase
    .from('businesses')
    .select('id, name, google_review_url, review_requests_enabled, review_request_delay_hours, review_request_custom_message, twilio_phone_number, talkmate_number')
    .eq('review_requests_enabled', true)
    .not('google_review_url', 'is', null)

  if (bizErr) {
    console.error('[cron/review-follow-up] business query failed', bizErr.message)
    return NextResponse.json({ ok: false, error: bizErr.message }, { status: 500 })
  }

  const eligibleBiz = (businesses ?? []) as BusinessForReview[]
  if (eligibleBiz.length === 0) {
    return NextResponse.json({ ok: true, considered: 0, sent: 0, results: [] })
  }

  const nowMs = Date.now()
  const results: Array<{ businessId: string; callId: string; result: string; detail?: string }> = []
  let sent = 0

  outer: for (const biz of eligibleBiz) {
    if (sent >= MAX_PER_RUN) break
    if (!biz.google_review_url) continue

    const delayHours = typeof biz.review_request_delay_hours === 'number'
      ? biz.review_request_delay_hours
      : DEFAULT_DELAY_HOURS
    const olderThanIso = new Date(nowMs - delayHours * 3600 * 1000).toISOString()

    // Find eligible calls for this business. The
    // idx_calls_review_pending partial index from migration 062
    // covers the (business_id, ended_at) filter with the predicate
    // review_request_sent = false AND was_abandoned = false, so this
    // is cheap even with a long calls history.
    const { data: calls } = await supabase
      .from('calls')
      .select('id, business_id, caller_number, ended_at, duration_seconds, was_abandoned, review_request_sent, intelligence_score')
      .eq('business_id', biz.id)
      .eq('review_request_sent', false)
      .eq('was_abandoned', false)
      .lt('ended_at', olderThanIso)
      .gte('duration_seconds', MIN_CALL_DURATION_SECONDS)
      // Sentiment gate (Sprint 1 hardening): never solicit a public Google
      // review off a poor interaction. intelligence_score is the 0-10
      // sentiment signal (intelligence_status is a workflow label, not
      // sentiment, so it is NOT used here). Unscored calls (null) keep the
      // prior behaviour — only scored-and-negative calls are suppressed.
      .or(`intelligence_score.is.null,intelligence_score.gte.${MIN_REVIEW_SCORE}`)
      .order('ended_at', { ascending: true })
      .limit(MAX_PER_RUN - sent)

    for (const call of (calls ?? []) as CallForReview[]) {
      if (sent >= MAX_PER_RUN) break outer
      if (!call.caller_number) {
        results.push({ businessId: biz.id, callId: call.id, result: 'skipped', detail: 'no_phone' })
        continue
      }

      // Contact opt-out + throttle check
      const { data: contact } = await supabase
        .from('contacts')
        .select('id, sms_opted_out, last_review_request_sent_at')
        .eq('client_id', biz.id)
        .eq('phone', call.caller_number)
        .eq('is_merged', false)
        .limit(1)
        .maybeSingle()

      if (contact?.sms_opted_out === true) {
        // Mark the call as sent so we don't re-evaluate it every run.
        await supabase
          .from('calls')
          .update({ review_request_sent: true, review_request_sent_at: new Date().toISOString() })
          .eq('id', call.id)
        results.push({ businessId: biz.id, callId: call.id, result: 'skipped', detail: 'opted_out' })
        continue
      }

      const last = contact?.last_review_request_sent_at as string | null | undefined
      if (last) {
        const lastMs = new Date(last).getTime()
        if (nowMs - lastMs < DEFAULT_THROTTLE_DAYS * 86400 * 1000) {
          await supabase
            .from('calls')
            .update({ review_request_sent: true, review_request_sent_at: new Date().toISOString() })
            .eq('id', call.id)
          results.push({ businessId: biz.id, callId: call.id, result: 'skipped', detail: 'throttled' })
          continue
        }
      }

      // Build message
      const bizName = biz.name ?? 'us'
      const custom = (biz.review_request_custom_message ?? '').trim()
      let message = (custom
        ? custom
        : `Thanks for choosing ${bizName}! We would love your feedback: ${biz.google_review_url}`
      )
        .replace(/\{business_name\}/gi, bizName)
        .replace(/\{review_url\}/gi, biz.google_review_url ?? '')
      // Compliance (Australian Spam Act): review requests are commercial SMS
      // and need a functional unsubscribe. STOP is honoured at the Twilio
      // inbound webhook; append unless the operator's copy already has it.
      if (!/\bstop\b/i.test(message)) message += ' Reply STOP to opt out.'

      const fromNumber = biz.twilio_phone_number ?? biz.talkmate_number ?? undefined

      const result = await sendSMS({
        to: call.caller_number,
        message,
        clientId: biz.id,
        smsType: 'review_request',
        from: fromNumber,
        sentBy: 'review_request',
      })

      if (!result.success) {
        console.warn('[cron/review-follow-up] send failed', {
          callId: call.id, businessId: biz.id, reason: result.reason, error: result.error,
        })
        results.push({ businessId: biz.id, callId: call.id, result: 'failed', detail: result.reason ?? result.error ?? undefined })
        // Don't mark sent — we'll retry on the next cron run.
        continue
      }

      // Stamp call + contact + insert review_requests row
      const nowIso = new Date().toISOString()
      await supabase
        .from('calls')
        .update({ review_request_sent: true, review_request_sent_at: nowIso })
        .eq('id', call.id)
      if (contact?.id) {
        await supabase
          .from('contacts')
          .update({ last_review_request_sent_at: nowIso })
          .eq('id', contact.id)
      }
      await supabase.from('review_requests').insert({
        business_id: biz.id,
        contact_id: contact?.id ?? null,
        call_id: call.id,
        platform: 'google',
      })
      // Sprint Session 2 — ROI audit trail (supplementary; the dashboard counts
      // review_requests directly). Never let a logging failure break the cron.
      await supabase.from('roi_events').insert({
        business_id: biz.id,
        event_type: 'review_request_sent',
        source_id: call.id,
        source_table: 'calls',
      }).then(() => {}, () => {})

      sent += 1
      results.push({ businessId: biz.id, callId: call.id, result: 'sent' })
    }
  }

  return NextResponse.json({
    ok: true,
    considered: eligibleBiz.length,
    sent,
    results,
  })
}
